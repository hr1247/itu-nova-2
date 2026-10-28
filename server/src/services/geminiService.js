import { GoogleGenerativeAI } from '@google/generative-ai';
import { createSourceProvenance } from './sourceTrustService.js';
import { shouldRequireLiveWeb } from './openaiService.js';

let geminiClient = null;

/**
 * Returns a singleton instance of the Google Generative AI client.
 */
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) return null;
  if (!geminiClient || geminiClient.apiKey !== apiKey) {
    geminiClient = new GoogleGenerativeAI(apiKey.trim());
  }
  return geminiClient;
}

/**
 * Extracts grounding sources and URLs from a Gemini response if available.
 */
function extractGeminiGroundingSources(candidate) {
  const sources = [];
  const seenUrls = new Set();
  const metadata = candidate?.groundingMetadata;

  if (!metadata) return sources;

  const chunks = metadata.groundingChunks || [];
  for (const chunk of chunks) {
    const web = chunk.web;
    if (web && web.uri && !seenUrls.has(web.uri)) {
      seenUrls.add(web.uri);
      sources.push(createSourceProvenance({
        url: web.uri,
        title: web.title || 'Google Search Result',
        snippet: ''
      }));
    }
  }

  return sources;
}

/**
 * Safely tests connection to Google Gemini API.
 */
export async function testGeminiConnection() {
  const apiKey = process.env.GEMINI_API_KEY;
  const configuredModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

  if (!apiKey || !apiKey.trim()) {
    return {
      connected: false,
      configured: false,
      model: configuredModel,
      provider: 'Google AI Studio (Gemini)',
      status: 'API key not configured in .env'
    };
  }

  try {
    const client = new GoogleGenerativeAI(apiKey.trim());
    const model = client.getGenerativeModel({ model: configuredModel });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'ping' }] }]
    });

    const text = result?.response?.text();
    return {
      connected: Boolean(text),
      configured: true,
      model: configuredModel,
      provider: 'Google AI Studio (Gemini)',
      status: 'active'
    };
  } catch (error) {
    return {
      connected: false,
      configured: true,
      model: configuredModel,
      provider: 'Google AI Studio (Gemini)',
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Generates response using Google Gemini (gemini-3.5-flash-lite / gemini-3.8-flash / gemini-3.5-flash).
 * Seamlessly integrates live web search context.
 */
export async function generateGeminiResponse({
  userMessage,
  chatHistory = [],
  groundedContext = '',
  forceWebSearch = false
}) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    return {
      text: 'Google Gemini (Free Tier) is configured for General Mode. Please add your free GEMINI_API_KEY to server/.env to start generating responses.\n\nYou can get a free API key from Google AI Studio at: https://aistudio.google.com/app/apikey',
      suggestions: ['How to get free Gemini API key', 'Switch to ITU mode', 'Retry query'],
      sources: [],
      webSearchUsed: false,
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
    };
  }

  const client = getGeminiClient();
  const configuredModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const candidateModels = [
    configuredModel,
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.5-flash'
  ].filter((v, i, a) => a.indexOf(v) === i);

  const needsWebSearch = forceWebSearch || shouldRequireLiveWeb(userMessage);

  // Build conversation history for Gemini contents format
  const contents = [];

  for (const item of chatHistory) {
    const role = item.role === 'user' ? 'user' : 'model';
    const text = String(item.content || '').trim();
    if (text) {
      contents.push({
        role,
        parts: [{ text }]
      });
    }
  }

  let finalUserText = userMessage;
  if (groundedContext) {
    finalUserText = `[REAL-TIME LIVE DATA & CONTEXT]:\n${groundedContext}\n\n[USER QUESTION]:\n${userMessage}`;
  }

  contents.push({
    role: 'user',
    parts: [{ text: finalUserText }]
  });

  const currentDateTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi', dateStyle: 'full', timeStyle: 'short' });
  const systemInstruction = `You are ITU Nova, a highly capable AI assistant. Current date & time: ${currentDateTime}. Provide direct, concise, factual, and helpful responses. When real-time live data or market context is provided, prioritize it to deliver up-to-the-minute answers for fluctuating prices, currency rates, weather, and news. Do not use outdated training memory when live context is provided.`;

  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      console.log(`[Gemini Service] Generating response using model "${modelName}" (Real-time data: ${Boolean(groundedContext)})`);
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 800
        }
      });

      const result = await model.generateContent({ contents });
      const candidate = result?.response?.candidates?.[0];
      const responseText = result?.response?.text()?.trim() || 'I could not generate a response right now.';

      const extractedSources = extractGeminiGroundingSources(candidate);
      const sourceLabels = extractedSources.map(s => `${s.title} (${s.domain})`);

      const suggestions = [
        'Tell me more',
        'Can you give an example?',
        'What are the key details?'
      ];

      return {
        text: responseText,
        suggestions,
        sources: sourceLabels,
        sourceDetails: extractedSources,
        webSearchUsed: Boolean(groundedContext) || extractedSources.length > 0,
        model: modelName
      };

    } catch (err) {
      lastError = err;
      console.warn(`[Gemini Service] Error with model "${modelName}":`, err.message);

      // Check quota / rate limits (429)
      if (err.status === 429 || /quota|resource_exhausted/i.test(err.message)) {
        console.warn(`[Gemini Service] Model "${modelName}" hit rate limit. Trying next candidate...`);
        continue;
      }
    }
  }

  console.error('[Gemini Service] Generation failed across all models:', lastError?.message);

  return {
    text: `General AI generation failed: ${lastError?.message || 'Unknown error'}. Please switch to ITU mode or retry in a moment.`,
    suggestions: ['Switch to ITU mode', 'Retry query'],
    sources: [],
    webSearchUsed: false,
    model: configuredModel
  };
}
