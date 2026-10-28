import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isCampusLocationQuery, loadKnowledge } from './knowledgeService.js';
import { buildPrompt } from '../utils/promptTemplates.js';
import { recordLearnedEmbedding } from './learnedMemoryService.js';

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

export function buildGroundedFallbackAnswer(userMessage, groundedContext = '') {
  if (groundedContext && groundedContext.includes('RELEVANT VERIFIED LEARNED KNOWLEDGE:')) {
    const learnedMatch = groundedContext.match(/Answer:\s*([\s\S]+?)(?:\n\n[A-Z]|$)/);
    if (learnedMatch && learnedMatch[1]?.trim()) {
      return learnedMatch[1].trim();
    }
  }

  const lower = (userMessage || '').toLowerCase();
  const kb = loadKnowledge();
  if (isCampusLocationQuery(lower)) {
    const campuses = kb?.university?.campuses || [];
    const mainCampus = campuses.find(campus => campus.id === 'main_astp') || campuses[0];
    const permanentCampus = campuses.find(campus => campus.id === 'barki_campus');

    if (mainCampus?.location) {
      const additionalCampus = permanentCampus?.location
        ? ` ITU also lists a ${permanentCampus.name.toLowerCase()} at ${permanentCampus.location}, described as being in phased development.`
        : '';
      return `ITU's main city campus is at ${mainCampus.location}.${additionalCampus}`;
    }
  }

  const transport = kb?.transportation;
  const isTransportQuery = /transport|bus|shuttle|route|pickup|metro|commute|travel/.test(lower);

  if (isTransportQuery && transport?.routes?.length) {
    const routeNumber = lower.match(/\broute\s*(?:number\s*)?([1-4])\b/)?.[1];
    const routeByArea = transport.routes.find(route =>
      route.name.toLowerCase().split(/[^a-z0-9]+/).some(word => word.length > 3 && lower.includes(word))
    );
    const selectedRoutes = routeNumber
      ? transport.routes.filter(route => route.routeNumber.endsWith(routeNumber))
      : routeByArea
        ? [routeByArea]
        : transport.routes;
    const wantsStops = /stop|stops|pickup|pick up|where does|via|through/.test(lower);
    const wantsRoutes = /routes|which routes|route numbers/.test(lower);

    if (selectedRoutes.length === 1 && routeNumber && wantsStops) {
      const route = selectedRoutes[0];
      const stops = route.stops.map(stop => `${stop.stopName} (${stop.time})`).join('; ');
      return `${route.routeNumber} (${route.name}) uses an ${route.vehicle}. Morning departure is ${route.morningDepartureTime}; evening departures are ${route.eveningDepartureTimes.join(' and ')}. Stops: ${stops}.`;
    }

    if (selectedRoutes.length === 1 && routeNumber) {
      const route = selectedRoutes[0];
      const areas = route.stops.map(stop => stop.stopName).join(', ');
      return `${route.routeNumber} is the ${route.name}. It serves these areas and stops: ${areas}. Morning departure is ${route.morningDepartureTime}; evening departures are ${route.eveningDepartureTimes.join(' and ')}.`;
    }

    if (wantsRoutes) {
      const routes = selectedRoutes.map(route =>
        `${route.routeNumber}: ${route.name} (morning departure ${route.morningDepartureTime}; evening departures ${route.eveningDepartureTimes.join(' and ')})`
      );
      return `ITU operates air-conditioned buses/coasters to its ASTP campus. ${routes.join('. ')}. The transport fee is PKR ${transport.semesterFee.amountPKR.toLocaleString()} per semester.`;
    }

    return `${transport.overview} The semester transport fee is PKR ${transport.semesterFee.amountPKR.toLocaleString()} per semester. ${transport.metroBusConnectivity.details}`;
  }

  const admissionYearMatch = lower.match(/\b(20\d{2})\b/);
  const admissionKeywords = /admission|application|apply|deadline|intake|entry test|merit list|orientation|classes/;

  if (admissionKeywords.test(lower)) {
    const admissions = kb?.admissionsCycle;

    if (admissionYearMatch) {
      const year = admissionYearMatch[1];
      const history = admissions?.history?.[`year${year}`];
      if (history) {
        const sessions = Object.entries(history).map(([name, details]) => {
          const label = name.charAt(0).toUpperCase() + name.slice(1);
          return `${label}: applications opened ${details.applicationStart}, deadline ${details.applicationDeadline}, entry test ${details.testDates}, first merit list ${details.firstMeritList}, and classes started ${details.classesStart}.`;
        });
        return `The stored ITU admission history for ${year} shows ${sessions.join(' ')}`;
      }
    }

    if (admissions?.schedules?.length) {
      const schedules = admissions.schedules.map(schedule => {
        const deadline = schedule.finalApplicationDeadline
          ? ` The final application deadline was ${schedule.finalApplicationDeadline}.`
          : '';
        return `${schedule.session}: applications opened ${schedule.admissionsOpenDate}.${deadline}`;
      });
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth();
      const scheduleYear = Number(admissions.academicYear?.match(/20\d{2}/g)?.at(-1));
      const scheduleIsOutdated = scheduleYear && (
        currentYear > scheduleYear || (currentYear === scheduleYear && currentMonth >= 8)
      );
      const staleNotice = scheduleIsOutdated
        ? ` This stored schedule is for ${admissions.academicYear} and does not confirm dates for the current admission cycle; verify current dates at ${kb.university?.contact?.website || 'the official ITU website'}.`
        : '';

      return `The stored ITU schedule for ${admissions.academicYear} lists ${schedules.join(' ')}${staleNotice}`;
    }
  }

  const asksAdmissionEligibility = /\b(can\s+i\s+get\s+admission|eligib|admission\s+criteria|admission\s+requirements?|how\s+to\s+get\s+admission)\b/i.test(lower)
    && /\b(bscs|bsai|computer science|artificial intelligence|undergraduate|programs?)\b/i.test(lower);

  if (asksAdmissionEligibility) {
    const bscs = kb?.academicPrograms?.undergraduate?.find(p => p.code === 'BSCS');
    const bsai = kb?.academicPrograms?.undergraduate?.find(p => p.code === 'BSAI');
    if (bscs || bsai) {
      return "Yes! You can get admission into BSCS or BSAI at ITU if you satisfy the eligibility and aggregate merit criteria:\n\n1. **Academic Qualifications:** Minimum 50% overall marks in Intermediate (HSSC) Pre-Engineering, ICS (Mathematics, Physics, Computer Science), or Pre-Medical (with 6-credit Mathematics deficiency course in the first year per HEC), or A-Levels with Mathematics and minimum 50% IBCC equivalence.\n2. **Admission Test:** ITU Admissions Test (CS/AI Stream) OR a valid NTS-NAT (NAT-IE / NAT-ICS) / USAT score taken within the last 12 months.\n3. **Merit Formula:** Aggregate = (15% Matric) + (35% Intermediate Part-1/Total) + (50% Entry Test).\n4. **Previous Closing Merits:** BSCS closing merit was ~81.2% (projected ~82.0%), while BSAI closing merit was ~83.8% (projected ~84.5%).";
    }
  }

  const isCampusQuery = /\bfacilities?\b|\blabs?\b|\blibrary\b|\bsociet(?:y|ies)\b|\bsports\b|student life|\bresearch\b|plan\s*9|\bincubation\b|\bindustry\b|\binnovation\b/.test(lower);

  if (!isCampusQuery) {
    return null;
  }

  const campus = kb?.campusLifeAndFacilities;

  if (!campus) {
    return groundedContext ? `Based on the retrieved ITU data: ${groundedContext.slice(0, 400)}...` : null;
  }

  const wantsLabs = /\blabs?\b|\bresearch\b/.test(lower);
  const wantsSocieties = /\bsociet(?:y|ies)\b|\bclubs?\b|\bsports\b/.test(lower);
  const wantsLibrary = /\blibrary\b|\bbooks?\b|\bresources?\b/.test(lower);
  const wantsIndustry = /plan\s*9|incubation|industry|innovation/.test(lower);
  const broadFacilitiesRequest = /facilit|campus life|student life|campus overview/.test(lower);
  const asksForSpecificCategories = wantsLabs || wantsSocieties || wantsLibrary || wantsIndustry;
  const includeAll = broadFacilitiesRequest && !asksForSpecificCategories;
  const details = [];

  if (wantsLabs || includeAll) {
    const labs = Array.isArray(campus.researchLabs) ? campus.researchLabs : [];
    if (labs.length) details.push(`Research labs: ${labs.map(item => `${item.name} (${item.focus})`).join('; ')}`);
  }
  if (wantsSocieties || includeAll) {
    const societies = campus.studentSocieties;
    if (Array.isArray(societies) && societies.length) details.push(`Student societies: ${societies.join(', ')}`);
  }
  if (wantsLibrary || includeAll) {
    const library = campus.library;
    if (library) details.push(`Library: ${library.location || 'location not listed'}; resources: ${library.resources || 'details not listed'}`);
  }
  if (wantsIndustry || includeAll) {
    const plan9 = campus.incubationAndIndustry?.plan9;
    if (plan9) details.push(`Plan9 and industry: ${plan9}`);
  }

  return details.length ? details.join('\n') : null;
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

    if (entry.embedding && Array.isArray(entry.embedding)) {
      recordLearnedEmbedding(entry.query, entry.embedding);
    }
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

    // Self-learning candidates are autonomously evaluated via autonomousLearningEngine

    return {
      text: responseText,
      suggestions: responseSuggestions
    };

  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'Ollama generation timed out after 30s.'
      : error.message;

    console.error('LLM Generation Error:', message);

    const groundedFallback = buildGroundedFallbackAnswer(userMessage, groundedContext);

    return {
      text: groundedFallback || 'Sorry, I could not generate an ITU-grounded answer right now. Please try again shortly or switch to General mode.',
      suggestions: groundedFallback
        ? buildFallbackSuggestions(mode, userMessage)
        : ['Retry query', 'Switch to General mode', 'Ask an ITU question']
    };
  }
}