import OpenAI from 'openai';
import { createSourceProvenance, evaluateSourceTrust } from './sourceTrustService.js';

let openaiClient = null;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) return null;
  if (!openaiClient || openaiClient.apiKey !== apiKey) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Determines whether an incoming query requires real-time / current information.
 */
export function shouldRequireLiveWeb(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') return false;
  const msg = userMessage.trim().toLowerCase();

  const realTimePatterns = [
    /\b(today|tonight|yesterday|tomorrow)\b/i,
    /\b(latest|recent|recently|newest|current|currently|now|right now)\b/i,
    /\b(this week|this month|this year|upcoming|ongoing)\b/i,
    /\b(weather|temperature|forecast|rain|climate|humidity|air quality|aqi)\b/i,
    /\b(price|prices|rate|rates|cost of|petrol|diesel|gold|silver|dollar|pkr|usd|currency|market)\b/i,
    /\b(news|announcement|announcements|headline|headlines|breaking)\b/i,
    /\b(schedule|schedules|dates?|deadline|deadlines|timetable|routine)\b/i,
    /\b(live|score|match|election|standing|standings)\b/i,
    /\b(version|released?|update|updated)\b/i,
    /\b(2025|2026)\b/i
  ];

  return realTimePatterns.some(pattern => pattern.test(msg));
}

/**
 * Extracts and normalizes sources from an OpenAI Responses API response.
 */
function extractSourcesFromResponse(response) {
  const sources = [];
  const seenUrls = new Set();

  if (!response || !Array.isArray(response.output)) {
    return sources;
  }

  for (const item of response.output) {
    // 1. Web search tool calls
    if (item.type === 'web_search_call' && item.action) {
      const actionSources = item.action.sources || [];
      for (const s of actionSources) {
        const url = s.url || s.link || '';
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          sources.push(createSourceProvenance({
            url,
            title: s.title || s.name || '',
            snippet: s.snippet || s.description || ''
          }));
        }
      }
    }

    // 2. Message annotations / citations
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (Array.isArray(part.annotations)) {
          for (const ann of part.annotations) {
            const url = ann.url || ann.citation?.url || '';
            if (url && !seenUrls.has(url)) {
              seenUrls.add(url);
              sources.push(createSourceProvenance({
                url,
                title: ann.title || ann.citation?.title || '',
                snippet: ann.text || ''
              }));
            }
          }
        }
      }
    }
  }

  return sources;
}

/**
 * Generates response using OpenAI Responses API with optional real-time web search.
 * Primary model: gpt-6.1-sol
 */
export async function generateOpenAIResponse({
  userMessage,
  chatHistory = [],
  groundedContext = '',
  forceWebSearch = false
}) {
  const client = getClient();
  const apiKey = process.env.OPENAI_API_KEY;

  if (!client || !apiKey) {
    return {
      text: 'OpenAI API key is missing. Please set OPENAI_API_KEY in server/.env to run GPT-6.1-Sol.',
      suggestions: ['Set OPENAI_API_KEY', 'Switch to ITU mode', 'Retry query'],
      sources: [],
      webSearchUsed: false
    };
  }

  const configuredModel = process.env.OPENAI_MODEL || 'gpt-6.1-sol';
  const candidateModels = [
    configuredModel,
    'gpt-4o',
    'gpt-4o-mini'
  ].filter((v, i, a) => a.indexOf(v) === i);

  const needsWebSearch = forceWebSearch || shouldRequireLiveWeb(userMessage);

  const messages = [
    {
      role: 'system',
      content: 'You are ITU Nova, an intelligent AI assistant powered by OpenAI GPT-6.1-Sol. Provide direct, concise, factual, and helpful responses. When real-time data or sources are retrieved, cite them accurately. Do not invent facts or URLs.'
    },
    ...chatHistory.map(item => ({
      role: item.role === 'user' ? 'user' : 'assistant',
      content: String(item.content || '')
    })),
    {
      role: 'user',
      content: groundedContext
        ? `Grounding Context:\n${groundedContext}\n\nUser Question:\n${userMessage}`
        : userMessage
    }
  ];

  let lastError = null;

  for (const model of candidateModels) {
    try {
      // 1. Try OpenAI Responses API
      const responseParams = {
        model,
        input: messages,
        temperature: 0.7
      };

      if (needsWebSearch) {
        responseParams.tools = [{ type: 'web_search' }];
        responseParams.include = ['web_search_call.action.sources'];
      }

      console.log(`[OpenAI Service] Calling Responses API with model "${model}" (Web search: ${needsWebSearch})`);
      const response = await client.responses.create(responseParams);

      const responseText = response.output_text?.trim()
        || response.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text?.trim()
        || 'I could not generate a response right now.';

      const extractedSources = needsWebSearch ? extractSourcesFromResponse(response) : [];
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
        webSearchUsed: needsWebSearch && extractedSources.length > 0,
        model
      };

    } catch (err) {
      lastError = err;
      console.warn(`[OpenAI Service] Responses API error with model "${model}":`, err.message);

      // If Responses API failed with quota/billing, capture immediately
      if (err.status === 429 || /billing|credit|quota/i.test(err.message)) {
        return {
          text: `OpenAI Account Notice: Your OpenAI API key is active, but you have no remaining credits (Status 429). Please add credits to your account at https://platform.openai.com/settings/organization/billing to continue using ${model}.`,
          suggestions: ['Add OpenAI credits', 'Switch to ITU mode', 'Check billing settings'],
          sources: [],
          webSearchUsed: false,
          model
        };
      }

      // Try Chat Completions API as secondary fallback with the same model
      try {
        console.log(`[OpenAI Service] Attempting chat.completions with model "${model}"`);
        const completion = await client.chat.completions.create({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 800
        });

        const replyContent = completion.choices?.[0]?.message?.content?.trim() || '';
        if (replyContent) {
          return {
            text: replyContent,
            suggestions: ['Tell me more', 'Explain further', 'Ask another question'],
            sources: [],
            sourceDetails: [],
            webSearchUsed: false,
            model
          };
        }
      } catch (chatErr) {
        lastError = chatErr;
        console.warn(`[OpenAI Service] Chat completions error for "${model}":`, chatErr.message);

        if (chatErr.status === 429 || /billing|credit|quota/i.test(chatErr.message)) {
          return {
            text: `OpenAI Account Notice: Your OpenAI API key is active, but you have no remaining credits (Status 429). Please add credits to your account at https://platform.openai.com/settings/organization/billing to continue using ${model}.`,
            suggestions: ['Add OpenAI credits', 'Switch to ITU mode', 'Check billing settings'],
            sources: [],
            webSearchUsed: false,
            model
          };
        }
      }
    }
  }

  return {
    text: `The OpenAI General AI service encountered an error (${lastError?.message || 'unknown error'}). Please verify OPENAI_API_KEY and billing on platform.openai.com.`,
    suggestions: ['Check OpenAI billing', 'Switch to ITU mode', 'Retry query'],
    sources: [],
    webSearchUsed: false,
    model: configuredModel
  };
}

/**
 * Safe health diagnostic probe for OpenAI.
 * Does NOT leak keys or sensitive information.
 */
export async function testOpenAIConnection() {
  const apiKey = process.env.OPENAI_API_KEY;
  const configuredModel = process.env.OPENAI_MODEL || 'gpt-6.1-sol';

  if (!apiKey || !apiKey.trim()) {
    return {
      connected: false,
      configured: false,
      model: configuredModel,
      webSearchAvailable: false,
      status: 'API key not configured'
    };
  }

  try {
    const client = getClient();
    const res = await client.models.list();
    const available = Array.isArray(res?.data) && res.data.length > 0;
    const hasConfiguredModel = res.data.some(m => m.id === configuredModel);

    return {
      connected: available,
      configured: true,
      model: configuredModel,
      modelFoundOnAccount: hasConfiguredModel,
      webSearchAvailable: true,
      status: available ? 'operational' : 'connected_no_models'
    };
  } catch (err) {
    return {
      connected: false,
      configured: true,
      model: configuredModel,
      webSearchAvailable: false,
      status: `Connection error: ${err.message}`
    };
  }
}
