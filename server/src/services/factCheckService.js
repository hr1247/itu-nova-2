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

  // 3. Fee poisoning check: claiming tuition is free, 0, or absurdly low (< 5,000 PKR)
  const mentionsFee = /\b(fee|tuition|dues|cost|charges?|credit\s*hour)\b/i.test(q) || /\b(fee|tuition|dues|cost|charges?)\b/i.test(c);
  if (mentionsFee) {
    const isExempt = /\b(scholarship|financial\s*aid|need-based|merit-based|waiver|discount)\b/i.test(c);
    if (!isExempt) {
      const cleanNumbers = c.replace(/,/g, '');
      const claimsZeroOrFree = /\b(free|zero|nil|none|free\s+of\s+cost|free\s+of\s+charge|no\s+fee|no\s+charges?|no\s+tuition|without\s+any\s+fee)\b/i.test(cleanNumbers)
        || /\b(?:fee|tuition|cost|charges?)\s*(?:is|are|=|:|was)?\s*(?:rs\.?|pkr)?\s*0\b/i.test(cleanNumbers)
        || /\b0\s*(?:pkr|rs|rupees|\/-\s*|\/credit|\/semester)?\b/i.test(cleanNumbers)
        || /\b(?:is|are|=|:)\s*0\b/i.test(cleanNumbers);

      const tinyMatch = cleanNumbers.match(/\b(?:(?:rs\.?|pkr|rupees)\s*(\d+)|(\d+)\s*(?:rs\.?|pkr|rupees|\/-\s*)|(?:fee|tuition|cost)\s*(?:is|are|=|:)\s*(\d+))\b/i);
      const tinyAmount = tinyMatch ? Number(tinyMatch[1] || tinyMatch[2] || tinyMatch[3]) : null;
      const claimsTinyFee = tinyAmount !== null && tinyAmount > 0 && tinyAmount < 5000;

      if (claimsZeroOrFree || claimsTinyFee) {
        return {
          verified: false,
          verdict: 'CONTRADICTED',
          reason: 'Rejected: Contradicts official fee structure. ITU degree tuition is not 0 PKR or negligible (minimum BS tuition is PKR 9,200 per credit hour).'
        };
      }
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
 * Autonomous LLM Judge via Google Gemini or OpenAI API.
 */
async function callLlmJudge({ question, correction, officialContext, webEvidence }) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if ((!geminiKey || !geminiKey.trim()) && (!openaiKey || !openaiKey.trim())) {
    return null;
  }

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

  // 1. Try Gemini first if key available
  if (geminiKey && geminiKey.trim()) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${geminiKey.trim()}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 200 }
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = text.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.verdict === 'PLAUSIBLE' || parsed.verdict === 'CONTRADICTED') {
            return {
              verified: parsed.verdict === 'PLAUSIBLE',
              verdict: parsed.verdict,
              confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
              reason: parsed.reason || (parsed.verdict === 'PLAUSIBLE' ? 'Verified as plausible.' : 'Contradicts verified data.')
            };
          }
        }
      }
    } catch (err) {
      console.warn('[FactCheck] Gemini judge error:', err.message);
    }
  }

  // 2. Try OpenAI fallback if key available
  if (openaiKey && openaiKey.trim()) {
    try {
      const model = process.env.OPENAI_MODEL || 'gpt-6.1-sol';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 150
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (res.ok) {
        const data = await res.json();
        const raw = data?.choices?.[0]?.message?.content || '';
        const jsonMatch = raw.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.verdict === 'PLAUSIBLE' || parsed.verdict === 'CONTRADICTED') {
            return {
              verified: parsed.verdict === 'PLAUSIBLE',
              verdict: parsed.verdict,
              confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
              reason: parsed.reason || (parsed.verdict === 'PLAUSIBLE' ? 'Verified as plausible.' : 'Contradicts verified data.')
            };
          }
        }
      }
    } catch (err) {
      console.warn('[FactCheck] OpenAI judge error:', err.message);
    }
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
