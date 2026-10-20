import express from 'express';
import { classifyQuery } from '../services/routerService.js';
import { generateResponse } from '../services/llmService.js';
import { generateGeneralResponse } from '../services/groqService.js';
import { getRelevantITUContext } from '../services/knowledgeService.js';
import { fetchLiveWebContext } from '../services/webSearchService.js'; // 👈 Import local web fetcher

const router = express.Router();

/**
 * POST /api/chat Endpoint
 * Connects Semantic Vector Classification, Local RAG, Web Search, and Ollama Generation
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, mode = 'auto', history = [] } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message is required." });
    }

    // Keep ITU mode explicit, but still check whether the question is in scope.
    const classification = await classifyQuery(message, mode === 'itu' ? 'auto' : mode);

    if (mode === 'itu' && classification.mode !== 'itu') {
      return res.json({
        reply: 'Sorry, I can only help with Information Technology University (ITU) questions in ITU mode. Please switch to General mode for this question.',
        suggestions: ['Switch to General mode', 'Ask an ITU question'],
        mode: 'itu',
        confidence: classification.confidence,
        reason: 'The question is outside the ITU knowledge scope.',
        sources: []
      });
    }

    // 2. Retrieve grounded context (Either ITU RAG or Live Web Context)
    let groundedContext = '';
    let sources = [];

    if (classification.mode === 'itu') {
      // Fetch ITU RAG knowledge base data
      const ragResult = getRelevantITUContext(message);
      groundedContext = ragResult.context;
      sources = ragResult.sources;
    } else {
      // Check if general query requires live/real-time market or current info
      const isRealTimeQuery = /price|rate|gold|tomato|dollar|pkr|weather|today|news|market/i.test(message);
      
      if (isRealTimeQuery) {
        console.log(`[WebSearch] Fetching live web context for query: "${message}"`);
        const liveSnippets = await fetchLiveWebContext(message);
        
        if (liveSnippets) {
          groundedContext = `LIVE WEB DATA (Fetched Today): ${liveSnippets}`;
          sources = ["Live Local Web Search"];
        }
      }
    }

    // 3. Generate concise answer + suggestions
    // - ITU mode: grounded ITU knowledge via local Ollama
    // - General mode: Groq API
    // - Auto mode: use ITU if relevant; otherwise Groq when classification falls back to general
    let llmResult;

    if (classification.mode === 'general') {
      llmResult = await generateGeneralResponse({
        userMessage: message,
        groundedContext,
        chatHistory: history
      });
    } else {
      llmResult = await generateResponse({
        mode: classification.mode,
        userMessage: message,
        groundedContext,
        chatHistory: history
      });
    }

    // 4. Return unified JSON response
    return res.json({
      reply: llmResult.text,
      suggestions: llmResult.suggestions || [],
      mode: classification.mode,
      confidence: classification.confidence,
      reason: classification.reason,
      sources
    });

  } catch (error) {
    console.error("Chat Controller Error:", error);
    return res.status(500).json({
      reply: "I'm having trouble connecting to my local AI engine right now. Please ensure Ollama is running in your terminal.",
      suggestions: ["How do I start Ollama?", "Retry query"],
      mode: "general",
      confidence: 0
    });
  }
});

export default router;