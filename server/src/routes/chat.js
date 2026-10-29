import express from 'express';
import { classifyQuery } from '../services/routerService.js';
import { generateResponse } from '../services/llmService.js';
import { generateOpenAIResponse, testOpenAIConnection, shouldRequireLiveWeb } from '../services/openaiService.js';
import { generateGeminiResponse, testGeminiConnection } from '../services/geminiService.js';
import { getKnowledgeAgeDays, getRelevantITUContext, loadKnowledge } from '../services/knowledgeService.js';
import { fetchLiveWebContext } from '../services/webSearchService.js';
import { handleGetKnowledge } from '../controllers/chatController.js';
import { getRelevantApprovedCorrection, submitLearningFeedback } from '../services/learningService.js';
import { enqueueInteraction, getLearnedRoutingHint, recordFeedbackSignal } from '../services/selfLearningService.js';
import { calculateResponseConfidence } from '../services/confidenceService.js';
import { appendLearnedMemoryEntry } from '../services/learnedMemoryService.js';
import { verifyCorrection } from '../services/factCheckService.js';
import { getAutonomousLearningDiagnostics, processAllPendingCandidates } from '../services/autonomousLearningEngine.js';

const router = express.Router();

router.get('/knowledge', handleGetKnowledge);

/**
 * GET /api/health/ai
 * Safe AI health diagnostic endpoint.
 * Tests Ollama, RAG, OpenAI, and Self-learning subsystem without leaking secrets.
 */
router.get('/health/ai', async (req, res) => {
  try {
    // 1. Ollama checks
    let ollamaConnected = false;
    let llamaModelAvailable = false;
    let embeddingModelAvailable = false;
    let generationTest = false;
    let embeddingTest = false;

    try {
      const tagsRes = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(4000) });
      if (tagsRes.ok) {
        ollamaConnected = true;
        const tagsData = await tagsRes.json();
        const modelNames = (tagsData.models || []).map(m => m.name);
        llamaModelAvailable = modelNames.some(n => n.includes('llama3.2'));
        embeddingModelAvailable = modelNames.some(n => n.includes('nomic-embed-text'));
      }
    } catch {
      ollamaConnected = false;
    }

    if (ollamaConnected && llamaModelAvailable) {
      try {
        const genRes = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'llama3.2', prompt: 'ping', stream: false }),
          signal: AbortSignal.timeout(6000)
        });
        generationTest = genRes.ok;
      } catch {
        generationTest = false;
      }
    }

    if (ollamaConnected && embeddingModelAvailable) {
      try {
        const embRes = await fetch('http://localhost:11434/api/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'nomic-embed-text', prompt: 'test' }),
          signal: AbortSignal.timeout(4000)
        });
        if (embRes.ok) {
          const embData = await embRes.json();
          embeddingTest = Array.isArray(embData.embedding) && embData.embedding.length > 0;
        }
      } catch {
        embeddingTest = false;
      }
    }

    // 2. RAG checks
    const kb = loadKnowledge();
    const knowledgeLoaded = Boolean(kb && kb.university);
    const retrievalCheck = getRelevantITUContext('BSCS fee');
    const retrievalTest = Boolean(retrievalCheck?.context && retrievalCheck.context !== 'No knowledge base loaded.');

    // 3. Provider checks (Gemini & OpenAI)
    const geminiDiag = await testGeminiConnection();
    const openaiDiag = await testOpenAIConnection();

    // 4. Autonomous Learning Diagnostics
    const learningDiag = getAutonomousLearningDiagnostics();

    return res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      ollama: {
        connected: ollamaConnected,
        llamaModel: llamaModelAvailable ? 'available' : 'not_found',
        generationTest,
        embeddingModel: embeddingModelAvailable ? 'available' : 'not_found',
        embeddingTest
      },
      rag: {
        knowledgeLoaded,
        vectorIndexLoaded: true,
        retrievalTest
      },
      gemini: geminiDiag,
      openai: openaiDiag,
      selfLearning: learningDiag
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/feedback', async (req, res) => {
  try {
    const { question, answer, rating, correction } = req.body || {};

    let factCheck = { verified: true, reason: 'Passed' };
    if (correction && String(correction).trim()) {
      factCheck = await verifyCorrection({
        question: String(question || ''),
        correction: String(correction || '')
      });
    }

    const autoApprove = factCheck.verified && process.env.AUTO_APPROVE_CORRECTIONS === 'true' && !process.env.ITU_LEARNING_STORE_PATH;

    const entry = submitLearningFeedback({
      ...(req.body || {}),
      autoApprove,
      initialStatus: factCheck.verified ? (autoApprove ? 'approved' : 'pending') : 'rejected',
      validationStatus: factCheck.verified ? (autoApprove ? 'VERIFIED_BY_AI' : 'PENDING') : 'REJECTED_BY_AI',
      verificationReason: factCheck.reason
    });

    recordFeedbackSignal({
      question: req.body?.question,
      rating: req.body?.rating,
      correctionCandidateId: entry.correction ? entry.id : null
    });

    let message;
    if (entry.correction) {
      if (factCheck.verified) {
        message = entry.status === 'approved'
          ? 'Correction verified and learned! ITU Chatbot has updated its knowledge base immediately.'
          : 'Correction submitted as a pending candidate. It will not affect answers until reviewed.';
      } else {
        message = `Suggestion rejected: ${factCheck.reason}`;
      }
    } else {
      message = 'Thanks for your feedback.';
    }

    return res.status(201).json({
      status: entry.status,
      verified: factCheck.verified,
      message,
      reason: factCheck.reason,
      id: entry.id
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/chat Endpoint
 * Connects Semantic Vector Classification, Local RAG, OpenAI General Mode, and Ollama Generation
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, mode = 'auto', history = [] } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message is required." });
    }

    if (mode !== 'general') {
      const learnedCorrection = await getRelevantApprovedCorrection(message);
      if (learnedCorrection) {
        const confidenceResult = calculateResponseConfidence({
          mode: 'itu',
          routingConfidence: 1,
          retrievalScore: learnedCorrection.similarity || 1,
          sources: ['Learned correction'],
          hasGroundedContext: true,
          knowledgeAgeDays: getKnowledgeAgeDays()
        });
        enqueueInteraction({
          question: message,
          answer: learnedCorrection.correction,
          requestedMode: mode,
          detectedMode: 'itu',
          routeReason: `Learned correction match: ${learnedCorrection.matchType}`,
          confidence: confidenceResult.score,
          retrievalScore: learnedCorrection.similarity || 1,
          sources: ['Learned correction'],
          groundedContext: JSON.stringify({ matchedQuestion: learnedCorrection.question }),
          model: 'approved-local-correction'
        });
        return res.json({
          reply: learnedCorrection.correction,
          suggestions: ['Ask another ITU question'],
          mode: 'itu',
          confidence: confidenceResult.score,
          confidenceBand: confidenceResult.band,
          reason: learnedCorrection.matchType === 'exact'
            ? 'Returned the latest correction saved for this exact question.'
            : `Returned an approved correction for a semantically similar question (${learnedCorrection.similarity} similarity).`,
          sources: [learnedCorrection.matchType === 'exact' ? 'Learned correction' : 'Semantically learned correction']
        });
      }
    }

    // Keep ITU mode explicit, but still check whether the question is in scope.
    let classification = await classifyQuery(message, mode === 'itu' ? 'auto' : mode);

    if (mode === 'auto' && classification.mode === 'general' && classification.queryEmbedding) {
      const learnedHint = await getLearnedRoutingHint(message, classification.queryEmbedding);
      if (learnedHint) {
        classification = {
          ...classification,
          mode: 'itu',
          confidence: Math.max(classification.confidence, learnedHint.score),
          reason: `Matched previously learned ITU topic pattern (${learnedHint.score.toFixed(2)} similarity).`,
          learnedHint
        };
      }
    }

    if (mode === 'itu' && classification.mode !== 'itu') {
      const scopeReply = 'Sorry, I can only help with Information Technology University (ITU) questions in ITU mode. Please switch to General mode for this question.';
      const scopeConfidence = calculateResponseConfidence({
        mode: 'itu',
        routingConfidence: classification.confidence,
        sources: [],
        hasGroundedContext: false,
        fallbackUsed: true,
        knowledgeAgeDays: getKnowledgeAgeDays()
      });
      enqueueInteraction({
        question: message,
        answer: scopeReply,
        requestedMode: mode,
        detectedMode: 'general',
        routeReason: classification.reason,
        confidence: scopeConfidence.score,
        retrievalScore: 0,
        sources: [],
        groundedContext: '',
        model: 'local-scope-router',
        answerFallback: true
      });
      return res.json({
        reply: scopeReply,
        suggestions: ['Switch to General mode', 'Ask an ITU question'],
        mode: 'itu',
        confidence: scopeConfidence.score,
        confidenceBand: scopeConfidence.band,
        reason: 'The question is outside the ITU knowledge scope.',
        sources: []
      });
    }

    // Fast-path: Return verified learned memory directly if exact or high-confidence semantic match
    if (mode !== 'general' && classification.learnedMemory?.isDirectAnswer) {
      const memoryMatch = classification.learnedMemory.match;
      const confidenceResult = calculateResponseConfidence({
        mode: classification.mode || 'itu',
        routingConfidence: Math.max(0.92, classification.confidence),
        retrievalScore: classification.learnedMemory.similarity,
        sources: ['Verified Learned Memory'],
        hasGroundedContext: true,
        knowledgeAgeDays: getKnowledgeAgeDays()
      });

      enqueueInteraction({
        question: message,
        answer: memoryMatch.response,
        requestedMode: mode,
        detectedMode: classification.mode,
        routeReason: classification.learnedMemory.reason,
        confidence: confidenceResult.score,
        retrievalScore: classification.learnedMemory.similarity,
        sources: ['Verified Learned Memory'],
        groundedContext: memoryMatch.context || '',
        model: 'learned-memory-store'
      });

      return res.json({
        reply: memoryMatch.response,
        suggestions: Array.isArray(memoryMatch.suggestions) && memoryMatch.suggestions.length > 0
          ? memoryMatch.suggestions
          : ['Ask another ITU question', 'Tell me more'],
        mode: classification.mode,
        confidence: confidenceResult.score,
        confidenceBand: confidenceResult.band,
        reason: classification.learnedMemory.reason,
        sources: [classification.learnedMemory.matchType === 'exact' ? 'Exact Learned Memory' : 'Semantically Learned Memory']
      });
    }

    // 2. Retrieve grounded context
    let groundedContext = '';
    let sources = [];

    if (classification.mode === 'itu') {
      // Fetch ITU RAG knowledge base data
      const retrievalQuery = classification.learnedHint
        ? `${message}\nRelated learned question pattern: ${classification.learnedHint.representativeQuestion}`
        : message;
      const ragResult = getRelevantITUContext(retrievalQuery);
      groundedContext = ragResult.context;
      sources = ragResult.sources;
      if (classification.learnedHint) sources.push('Learned topic pattern');

      // Inject high-confidence learned memory match into grounding context
      if (classification.learnedMemory?.match && classification.learnedMemory.similarity >= 0.82) {
        const mem = classification.learnedMemory.match;
        const memoryContext = `RELEVANT VERIFIED LEARNED KNOWLEDGE:\nQuestion: "${mem.query}"\nAnswer: ${mem.response}`;
        groundedContext = groundedContext
          ? `${groundedContext}\n\n${memoryContext}`
          : memoryContext;
        sources.push('Self-Learning Memory');
      }

    } else {
      // General Mode: Live web check for real-time fluctuating or current data
      const isRealTimeQuery = shouldRequireLiveWeb(message) || /price|rate|gold|tola|tomato|dollar|pkr|weather|temperature|today|news|market|petrol|diesel|fuel|bitcoin|crypto|stock/i.test(message);
      if (isRealTimeQuery) {
        console.log(`[WebSearch] Fetching live web context for query: "${message}"`);
        const liveSnippets = await fetchLiveWebContext(message).catch(() => null);
        if (liveSnippets) {
          groundedContext = `LIVE WEB & MARKET DATA (Fetched Real-Time): ${liveSnippets}`;
          sources = ["Live Web Search & Real-Time Data"];
        }
      }
    }

    // 3. Generate answer:
    // - ITU mode: grounded ITU knowledge via local Ollama (Llama 3.2)
    // - General mode: Google Gemini (Free Tier with live search) or OpenAI
    let llmResult;

    if (classification.mode === 'general') {
      const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
      const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());

      if (hasGeminiKey || !hasOpenAIKey) {
        // Primary Free Tier Provider: Google Gemini with native Google Search Grounding
        llmResult = await generateGeminiResponse({
          userMessage: message,
          chatHistory: history,
          groundedContext
        });
      } else {
        // Secondary Provider: OpenAI
        llmResult = await generateOpenAIResponse({
          userMessage: message,
          chatHistory: history,
          groundedContext
        });
      }

      if (Array.isArray(llmResult.sources) && llmResult.sources.length > 0) {
        sources = [...new Set([...sources, ...llmResult.sources])];
      }
    } else {
      llmResult = await generateResponse({
        mode: classification.mode,
        userMessage: message,
        groundedContext,
        chatHistory: history
      });
    }

    const fallbackUsed = /could not generate|provider is not available|offline mode|unable to complete request/i.test(llmResult.text || '');
    const confidenceResult = calculateResponseConfidence({
      mode: classification.mode,
      routingConfidence: classification.confidence,
      retrievalScore: classification.mode === 'itu' ? classification.confidence : 0,
      sources,
      hasGroundedContext: Boolean(groundedContext),
      fallbackUsed,
      knowledgeAgeDays: classification.mode === 'itu' ? getKnowledgeAgeDays() : null
    });

    const activeModel = classification.mode === 'general'
      ? (llmResult.model || process.env.GEMINI_MODEL || process.env.OPENAI_MODEL || 'gemini-2.0-flash')
      : 'ollama/llama3.2';

    // 4. Enqueue interaction for autonomous learning & clustering
    enqueueInteraction({
      question: message,
      answer: llmResult.text,
      requestedMode: mode,
      detectedMode: classification.mode,
      routeReason: classification.reason,
      confidence: confidenceResult.score,
      retrievalScore: classification.mode === 'itu' ? classification.confidence : 0,
      sources,
      groundedContext,
      model: activeModel,
      answerFallback: fallbackUsed
    });

    // 5. Return response
    return res.json({
      reply: llmResult.text,
      suggestions: llmResult.suggestions || [],
      mode: classification.mode,
      confidence: confidenceResult.score,
      confidenceBand: confidenceResult.band,
      reason: classification.reason,
      sources,
      webSearchUsed: Boolean(llmResult.webSearchUsed)
    });

  } catch (error) {
    console.error("Chat Controller Error:", error);
    const failedMessage = String(req.body?.message || '').slice(0, 2000);
    if (failedMessage) {
      enqueueInteraction({
        question: failedMessage,
        answer: "I'm having trouble connecting to my local AI engine right now.",
        requestedMode: req.body?.mode || 'auto',
        detectedMode: 'general',
        routeReason: 'Chat request failed before normal response completed.',
        confidence: 0.15,
        retrievalScore: 0,
        sources: [],
        groundedContext: '',
        model: 'request-error-fallback',
        answerFallback: true
      });
    }
    return res.status(500).json({
      reply: "I'm having trouble connecting to my AI engine right now. Please ensure Ollama or API providers are running.",
      suggestions: ["How do I start Ollama?", "Retry query"],
      mode: "general",
      confidence: 0
    });
  }
});

export default router;
