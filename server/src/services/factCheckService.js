import { getRelevantITUContext } from './knowledgeService.js';
import { fetchLiveWebContext } from './webSearchService.js';

/**
 * Deterministic contradiction checks against core immutable ITU facts.
 */
function checkCoreContradictions(question, correction) {
  const q = String(question || '').toLowerCase();
  const c = String(correction || '').toLowerCase();

  // 1. Anti-spam / Prompt injection check
  if (/ignore (all )?previous instructions|system prompt|jailbreak|drop table|<script>/i.test(c)) {
    return {
      verified: false,
      verdict: 'CONTRADICTED',
      reason: 'Rejected: Security policy violation or prompt injection pattern detected.'
    };
  }

  // 2. Minimum substance check
  if (c.trim().length < 8 || /^([a-z0-9])\1{5,}$/i.test(c.trim())) {
    return {
      verified: false,
      verdict: 'CONTRADICTED',
      reason: 'Rejected: Insufficient detail or repetitive gibberish.'
    };
  }

  // 3. Fee poisoning check: claiming tuition is free or 0
  if (/fee|tuition|cost|credit hour|charges/i.test(q) || /fee|tuition|cost/i.test(c)) {
    if (/\b(free|0\s*pkr|zero|no fee|100\s*pkr|free of cost)\b/i.test(c) && !/scholarship|aid|waiver/i.test(c)) {
      return {
        verified: false,
        verdict: 'CONTRADICTED',
        reason: 'Rejected: Contradicts official fee structure. Regular degree tuition is not 0 PKR.'
      };
    }
  }

  // 4. City Location poisoning check
  if (/where|location|city|campus|address/i.test(q)) {
    if (/\b(karachi|islamabad|peshawar|quetta|multan|rawalpindi|faisalabad)\b/i.test(c) && !/lahore/i.test(c)) {
      return {
        verified: false,
        verdict: 'CONTRADICTED',
        reason: 'Rejected: Information Technology University (ITU) is chartered and located exclusively in Lahore.'
      };
    }
  }

  // 5. Accreditation poisoning check
  if (/hec|recognition|accreditation|nceac|charter/i.test(q)) {
    if (/\b(not recognized|fake|illegal|unaccredited|banned)\b/i.test(c)) {
      return {
        verified: false,
        verdict: 'CONTRADICTED',
        reason: 'Rejected: Contradicts official government charter. ITU is chartered by Punjab and accredited by HEC/NCEAC.'
      };
    }
  }

  return null;
}

/**
 * Autonomous LLM Judge via OpenAI API.
 */
async function callLlmJudge({ question, correction, officialContext, webEvidence }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) return null;

  const model = process.env.OPENAI_MODEL || 'gpt-6.1-sol';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  const prompt = `You are an automated university fact-checker and anti-poisoning guardrail for Information Technology University (ITU) Lahore.

Official University Context:
${officialContext ? officialContext.slice(0, 1200) : 'None available'}

Web Search Evidence:
${webEvidence ? webEvidence.slice(0, 600) : 'None available'}

User Question: "${question}"
User Suggested Correction: "${correction}"

Task:
Determine whether the user's suggested correction is:
- PLAUSIBLE: Plausible, helpful, genuine new information, or consistent with ITU / reality.
- CONTRADICTED: Blatantly false, contradicts official university facts (e.g. fake fees, fake locations, fake closures), malicious data poisoning, or total nonsense.

Respond ONLY with valid JSON in this exact structure:
{
  "verdict": "PLAUSIBLE" | "CONTRADICTED",
  "confidence": 0.0 - 1.0,
  "reason": "short explanation in 1 sentence"
}`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 150
      }),
      signal: controller.signal
    });

    if (!res.ok) return null;

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || '';
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.verdict === 'PLAUSIBLE' || parsed.verdict === 'CONTRADICTED') {
      return {
        verified: parsed.verdict === 'PLAUSIBLE',
        verdict: parsed.verdict,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
        reason: parsed.reason || (parsed.verdict === 'PLAUSIBLE' ? 'Verified as plausible.' : 'Contradicts verified data.')
      };
    }
  } catch (err) {
    console.warn('[FactCheck] LLM Judge unavailable, using rules:', err.message);
  } finally {
    clearTimeout(timeoutId);
  }

  return null;
}

/**
 * Autonomous Fact-Checker
 * 
 * Verifies whether a user suggestion is factually sound before committing it
 * to active memory.
 * 
 * @param {Object} params
 * @param {string} params.question - The question being corrected.
 * @param {string} params.correction - The proposed new answer.
 * @returns {Promise<{ verified: boolean, verdict: string, reason: string }>}
 */
export async function verifyCorrection({ question, correction }) {
  // 1. Fast Rule-Based Canon Defense
  const deterministicResult = checkCoreContradictions(question, correction);
  if (deterministicResult) {
    return deterministicResult;
  }

  // 2. Retrieve official context and optional web evidence
  const officialResult = getRelevantITUContext(question);
  const officialContext = officialResult?.context || '';

  let webEvidence = '';
  try {
    webEvidence = await fetchLiveWebContext(`${question} ${correction}`).catch(() => '');
  } catch {
    webEvidence = '';
  }

  // 3. Autonomous LLM Fact Check
  const llmResult = await callLlmJudge({
    question,
    correction,
    officialContext,
    webEvidence
  });

  if (llmResult) {
    return llmResult;
  }

  // 4. Default safe fallback if LLM is offline: Plausible unless contradicted by rules
  return {
    verified: true,
    verdict: 'PLAUSIBLE',
    confidence: 0.8,
    reason: 'Passed autonomous rule-based consistency check.'
  };
}

