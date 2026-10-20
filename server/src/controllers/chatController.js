import { classifyQuery } from '../services/routerService.js';
import { getRelevantITUContext, loadKnowledge } from '../services/knowledgeService.js';
import { generateResponse } from '../services/llmService.js';

export async function handleChatMessage(req, res) {
  try {
    const { message, history = [], mode: explicitMode = 'auto' } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required and must be non-empty.' });
    }

    // 1. Dual-mode classification
    const classification = classifyQuery(message, explicitMode);
    const selectedMode = classification.mode;

    // 2. Knowledge grounding
    let groundedContext = '';
    let sources = [];
    let matchedTopics = [];

    if (selectedMode === 'itu') {
      const grounded = getRelevantITUContext(message);
      groundedContext = grounded.context;
      sources = grounded.sources;
      matchedTopics = grounded.matchedTopics;
    }

    // 3. LLM Generation
    const reply = await generateResponse({
      mode: selectedMode,
      userMessage: message,
      groundedContext,
      chatHistory: history
    });

    return res.json({
      reply,
      mode: selectedMode,
      confidence: classification.confidence,
      reason: classification.reason,
      groundedSources: sources,
      matchedTopics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in chat controller:', error);
    return res.status(500).json({
      error: 'An internal error occurred while processing your request.',
      details: error.message
    });
  }
}

export function handleGetKnowledge(req, res) {
  try {
    const knowledge = loadKnowledge();
    if (!knowledge) {
      return res.status(500).json({ error: 'Failed to load ITU knowledge base.' });
    }
    return res.json(knowledge);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
