import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadKnowledge } from './knowledgeService.js';
import { buildPrompt } from '../utils/promptTemplates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '../../../');
const memoryDirectory = path.resolve(projectRoot, 'src/data');

if (!fs.existsSync(memoryDirectory)) {
  fs.mkdirSync(memoryDirectory, { recursive: true });
}

const LEARNING_STORE_PATH = path.join(memoryDirectory, 'learned_memory.json');

function buildFallbackSuggestions(mode = 'itu', userMessage = '') {
  const base = mode === 'itu'
    ? [
        'What labs are available at ITU?',
        'What student societies does ITU have?',
        'Where is the ITU library located?'
      ]
    : ['Tell me more', 'Other options', 'Clarify details'];

  if (!userMessage || !userMessage.trim()) {
    return base;
  }

  const lower = userMessage.toLowerCase();

  if (lower.includes('campus') || lower.includes('facility') || lower.includes('facilities')) {
    return [
      'What research labs are available at ITU?',
      'What student societies does ITU have?',
      'Where is the ITU library and library resources?'
    ];
  }

  return base;
}

function extractStructuredText(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return 'Here is the requested information.';
  }

  if (typeof parsed.text === 'string' && parsed.text.trim()) {
    return parsed.text.trim();
  }

  if (typeof parsed.answer === 'string' && parsed.answer.trim()) {
    return parsed.answer.trim();
  }

  const clauses = [];

  if (typeof parsed.title === 'string' && parsed.title.trim()) {
    clauses.push(`**${parsed.title.trim()}**`);
  }

  const addList = (label, value) => {
    if (Array.isArray(value) && value.length > 0) {
      const items = value
        .map(item => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object') {
            const section = item.section || item.name || item.title || label;
            const details = item.details || item.points || item.facilities || item.items || [];
            if (Array.isArray(details) && details.length > 0) {
              return `${section}: ${details.map(detail => String(detail)).join(', ')}`;
            }
            return `${section}: ${JSON.stringify(item)}`;
          }
          return String(item);
        })
        .filter(Boolean);

      if (items.length > 0) {
        clauses.push(`${label}: ${items.join('; ')}`);
      }
    }
  };

  addList('Facilities', parsed.facilities);
  addList('Sections', parsed.sections);
  addList('Details', parsed.details);
  addList('Features', parsed.features);

  if (Array.isArray(parsed.sectionsDetails)) {
    const sectionText = parsed.sectionsDetails
      .map(item => {
        if (item && typeof item === 'object') {
          const section = item.section || item.name || item.title || 'Section';
          const details = Array.isArray(item.details) ? item.details : [];
          return details.length > 0 ? `${section}: ${details.join(', ')}` : section;
        }
        return String(item);
      })
      .filter(Boolean);

    if (sectionText.length > 0) {
      clauses.push(sectionText.join('\n- '));
    }
  }

  if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
    clauses.push(parsed.summary.trim());
  }

  if (clauses.length > 0) {
    return clauses.join('\n\n');
  }

  return 'Here is the requested information.';
}

function buildGroundedFallbackAnswer(userMessage, groundedContext = '') {
  const lower = (userMessage || '').toLowerCase();
  const isCampusQuery = lower.includes('campus') || lower.includes('facility') || lower.includes('facilities') || lower.includes('lab') || lower.includes('library');

  if (!isCampusQuery) {
    return null;
  }

  const kb = loadKnowledge();
  const campus = kb?.campusLifeAndFacilities;

  if (!campus) {
    return groundedContext ? `Based on the retrieved ITU data: ${groundedContext.slice(0, 400)}...` : null;
  }

  const research = Array.isArray(campus.researchLabs) ? campus.researchLabs.map(item => item.name).join(', ') : 'research labs';
  const societies = Array.isArray(campus.studentSocieties) ? campus.studentSocieties.join(', ') : 'student societies';
  const library = campus.library?.location ? `${campus.library.location} with ${campus.library.resources}` : 'the main ITU library';
  const plan9 = campus.incubationAndIndustry?.plan9 || 'Plan9 incubation access';

  return `ITU has a strong campus environment with facilities including ${research}. Students also get access to student societies such as ${societies}. The library is at ${library}. The university is connected to innovation and industry through ${plan9}.`;
}

function normalizeModelResult(parsed, mode, userMessage, groundedContext = '') {
  const text = extractStructuredText(parsed);
  const suggestions = Array.isArray(parsed?.suggestions) && parsed.suggestions.length > 0
    ? parsed.suggestions.map(item => String(item))
    : buildFallbackSuggestions(mode, userMessage);

  const fallbackText = buildGroundedFallbackAnswer(userMessage, groundedContext);

  return {
    text: fallbackText || text,
    suggestions
  };
}

/**
 * Saves verified Q&A interactions and fetched context to learned_memory.json
 * to build an evolving local knowledge base.
 */
function logToLearnedMemory(entry) {
  try {
    let memory = [];
    if (fs.existsSync(LEARNING_STORE_PATH)) {
      const raw = fs.readFileSync(LEARNING_STORE_PATH, 'utf-8');
      memory = JSON.parse(raw || '[]');
    }

    // Avoid duplicate user queries in memory store
    const existingIndex = memory.findIndex(item => item.query.toLowerCase() === entry.query.toLowerCase());
    if (existingIndex >= 0) {
      memory[existingIndex] = { ...memory[existingIndex], ...entry, updatedAt: new Date().toISOString() };
    } else {
      memory.push({ ...entry, createdAt: new Date().toISOString() });
    }

    fs.writeFileSync(LEARNING_STORE_PATH, JSON.stringify(memory, null, 2));
  } catch (err) {
    console.warn('[Self-Learning Memory] Failed to log interaction:', err.message);
  }
}

export async function generateResponse({ mode, userMessage, groundedContext = '', chatHistory = [] }) {
  const trimmedMessage = (userMessage || '').trim();
  if (/^(hi|hello|hey|salam|assalamualaikum|aoa|good morning|good evening|good afternoon|greetings)\b/i.test(trimmedMessage)) {
    return {
      text: 'Hello! I am ITU Chatbot. Ask me about ITU programs, fees, merit, campus facilities, transport, or general questions.',
      suggestions: ['What programs does ITU offer?', 'How is BSCS merit calculated?', 'What are the campus facilities?']
    };
  }

  try {
    // 1. Build system instruction & prompt with grounded context using promptTemplates.js
    const { systemInstruction, prompt } = buildPrompt(mode, userMessage, groundedContext, chatHistory);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    // 2. Send request to Ollama
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        system: systemInstruction,
        prompt: prompt,
        stream: false,
        format: 'json'
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Ollama API returned error status ${res.status}`);
    }

    const data = await res.json();
    let parsed = {};

    try {
      const rawResponse = typeof data.response === 'string' ? data.response : JSON.stringify(data.response || {});
      parsed = JSON.parse(rawResponse);
    } catch (parseError) {
      console.warn('Ollama JSON parse warning:', parseError.message);
      parsed = { text: typeof data.response === 'string' ? data.response : 'Here is the requested information.' };
    }

    const normalized = normalizeModelResult(parsed, mode, userMessage, groundedContext);
    const responseText = normalized.text;
    const responseSuggestions = normalized.suggestions;

    // 3. Self-Learning Loop: Save live fetched contexts or high-confidence answers locally
    if (groundedContext || mode === 'itu') {
      logToLearnedMemory({
        query: userMessage,
        response: responseText,
        suggestions: responseSuggestions,
        context: groundedContext,
        mode
      });
    }

    return {
      text: responseText,
      suggestions: responseSuggestions
    };

  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'Ollama generation timed out after 30s.'
      : error.message;

    console.error('LLM Generation Error:', message);

    // Dynamic local fallback if Ollama is unreachable
    return {
      text: 'Sorry, I could not generate an ITU-grounded answer right now. Please try again shortly or switch to General mode.',
      suggestions: ['Retry query', 'Switch to General mode', 'Ask an ITU question']
    };
  }
}