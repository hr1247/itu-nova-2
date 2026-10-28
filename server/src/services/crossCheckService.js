import { getRelevantITUContext, loadKnowledge } from './knowledgeService.js';
import { evaluateSourceTrust, TRUST_LEVELS } from './sourceTrustService.js';

/**
 * Deterministic rules for core immutable ITU facts (Anti-poisoning Canon).
 */
export function checkImmutableContradictions(question, text) {
  const q = String(question || '').toLowerCase();
  const t = String(text || '').toLowerCase();

  // 1. Prompt Injection / Security check
  if (/ignore (all )?previous instructions|system prompt|jailbreak|drop table|<script>|prompt injection/i.test(t)) {
    return {
      status: 'DENIED',
      verdict: 'CONTRADICTED',
      confidence: 1.0,
      reason: 'Security violation: Prompt injection or system manipulation detected.'
    };
  }

  // 2. Minimum substance & gibberish check
  if (t.trim().length < 10 || /^([a-z0-9])\1{5,}$/i.test(t.trim())) {
    return {
      status: 'DENIED',
      verdict: 'CONTRADICTED',
      confidence: 1.0,
      reason: 'Content failed quality validation: Insufficient substance or repetitive gibberish.'
    };
  }

  // 3. Tuition / Fee poisoning (claiming 0 PKR or completely free tuition without scholarship)
  if (/fee|tuition|cost|credit hour|charges/i.test(q) || /fee|tuition|cost/i.test(t)) {
    if (/\b(free|0\s*pkr|zero rupees?|no fee|100\s*pkr|free of cost)\b/i.test(t) && !/scholarship|financial aid|waiver|need[- ]based/i.test(t)) {
      return {
        status: 'DENIED',
        verdict: 'CONTRADICTED',
        confidence: 0.99,
        reason: 'Contradicts official ITU fee structure: Standard degree programs are not free of tuition.'
      };
    }
  }

  // 4. City location poisoning (ITU is chartered in Lahore only)
  if (/where|location|city|campus|address/i.test(q)) {
    if (/\b(karachi|islamabad|peshawar|quetta|multan|rawalpindi|faisalabad)\b/i.test(t) && !/lahore/i.test(t)) {
      return {
        status: 'DENIED',
        verdict: 'CONTRADICTED',
        confidence: 0.98,
        reason: 'Contradicts official charter: ITU is located and chartered exclusively in Lahore.'
      };
    }
  }

  // 5. Accreditation & Charter poisoning
  if (/hec|recognition|accreditation|nceac|charter/i.test(q) || /hec|recognition|accreditation/i.test(t)) {
    if (/\b(not recognized|fake university|illegal|unaccredited|banned|unauthorized)\b/i.test(t)) {
      return {
        status: 'DENIED',
        verdict: 'CONTRADICTED',
        confidence: 0.99,
        reason: 'Contradicts official statutory records: ITU is a recognized university chartered by the Govt of Punjab.'
      };
    }
  }

  return null;
}

/**
 * Cross-checks a candidate against the 5-level hierarchy of evidence:
 * 
 * LEVEL 1: Authoritative Official ITU Source & Knowledge Base
 * LEVEL 2: Existing Verified Local Knowledge
 * LEVEL 3: Independent Trusted Sources (HEC, Govt, Reputable Media)
 * LEVEL 4: LLM Fact Checker Reasoning Layer
 * LEVEL 5: User Correction (learning signal only, not authority)
 * 
 * @param {Object} candidate
 * @param {string} candidate.id
 * @param {string} candidate.question
 * @param {string} candidate.proposedAnswer
 * @param {string} [candidate.source]
 * @param {string} [candidate.sourceUrl]
 * @param {Array}  [candidate.evidence]
 * @returns {Promise<Object>} Structured decision record (APPROVED, PENDING, or DENIED)
 */
export async function crossCheckCandidate(candidate) {
  const {
    id = '',
    question = '',
    proposedAnswer = '',
    source = 'unknown',
    sourceUrl = '',
    evidence = []
  } = candidate;

  // Step 1: Immutable Canon & Security Checks
  const canonRejection = checkImmutableContradictions(question, proposedAnswer);
  if (canonRejection) {
    return {
      candidateId: id,
      status: canonRejection.status,
      verdict: canonRejection.verdict,
      reason: canonRejection.reason,
      source,
      evidence: [],
      confidence: canonRejection.confidence,
      timestamp: new Date().toISOString()
    };
  }

  // Step 2: Level 1 & Level 2 - Retrieve Official Verified ITU Knowledge
  const officialResult = getRelevantITUContext(question);
  const officialContext = officialResult?.context || '';
  const collectedEvidence = [...(evidence || [])];

  if (officialContext && officialContext !== 'No knowledge base loaded.') {
    collectedEvidence.push({
      level: 1,
      type: 'official_itu_knowledge_base',
      summary: officialContext.slice(0, 300)
    });
  }

  // Step 3: Evaluate Source Trust
  const sourceTrust = sourceUrl
    ? evaluateSourceTrust(sourceUrl)
    : {
        trustLevel: source === 'official_itu' ? TRUST_LEVELS.AUTHORITATIVE_ITU : TRUST_LEVELS.UNTRUSTED,
        isItuAuthoritative: source === 'official_itu',
        sourceType: source === 'official_itu' ? 'official_itu' : 'unverified'
      };

  // Step 4: Strict Anti-Hallucination Guard (Phase 12)
  // An unverified model hallucination or unverified user correction CANNOT be self-approved without evidence
  const isPureModelOutput = source === 'model_generated_unverified' || source === 'model_generated';
  const isPureUserStatement = source === 'user_suggested_correction' || source === 'user_input';

  if ((isPureModelOutput || isPureUserStatement) && !sourceUrl && collectedEvidence.length <= 1) {
    // Check if the proposed answer actually agrees with official context
    const hasOfficialSupport = checkTextMatchesOfficial(question, proposedAnswer, officialContext);

    if (!hasOfficialSupport) {
      return {
        candidateId: id,
        status: 'PENDING',
        verdict: 'UNVERIFIED',
        reason: 'Unverified claim lacking authoritative source confirmation. Retained as PENDING candidate.',
        source,
        evidence: collectedEvidence,
        confidence: 0.45,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Step 5: Check Source Authority Level
  if (sourceTrust.isItuAuthoritative || sourceTrust.trustLevel >= TRUST_LEVELS.OFFICIAL_GOVERNMENT) {
    // Trusted authoritative source found!
    collectedEvidence.push({
      level: 1,
      type: 'authoritative_source_domain',
      domain: sourceTrust.domain,
      trustLevel: sourceTrust.trustLevel
    });

    return {
      candidateId: id,
      status: 'APPROVED',
      verdict: 'PLAUSIBLE',
      reason: `Verified from authoritative source (${sourceTrust.domain || 'Official ITU'}).`,
      source: sourceTrust.domain || source,
      evidence: collectedEvidence,
      confidence: Math.max(0.92, sourceTrust.trustLevel),
      timestamp: new Date().toISOString()
    };
  }

  // Step 6: Level 4 - LLM Fact-Checking Layer
  // Call LLM judge to evaluate the evidence against the claim
  const llmVerdict = await evaluateWithLlmJudge({
    question,
    proposedAnswer,
    officialContext,
    evidence: collectedEvidence
  });

  if (llmVerdict) {
    if (llmVerdict.verdict === 'CONTRADICTED') {
      return {
        candidateId: id,
        status: 'DENIED',
        verdict: 'CONTRADICTED',
        reason: llmVerdict.reason || 'Contradicted by authoritative evidence.',
        source,
        evidence: collectedEvidence,
        confidence: llmVerdict.confidence || 0.9,
        timestamp: new Date().toISOString()
      };
    }

    if (llmVerdict.verdict === 'PLAUSIBLE' && llmVerdict.confidence >= 0.85 && (sourceTrust.trustLevel >= 0.7 || collectedEvidence.length > 1)) {
      return {
        candidateId: id,
        status: 'APPROVED',
        verdict: 'PLAUSIBLE',
        reason: llmVerdict.reason || 'Cross-checked and confirmed plausible by multi-source evaluation.',
        source,
        evidence: collectedEvidence,
        confidence: llmVerdict.confidence,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Default safe decision for uncertain or unverified data: PENDING
  return {
    candidateId: id,
    status: 'PENDING',
    verdict: 'PENDING_EVIDENCE',
    reason: 'Evidence is insufficient or confidence below automatic approval threshold (0.85). Retained as PENDING.',
    source,
    evidence: collectedEvidence,
    confidence: 0.60,
    timestamp: new Date().toISOString()
  };
}

/**
 * Checks whether key facts in the text match known official knowledge.
 */
function checkTextMatchesOfficial(question, proposedAnswer, officialContext) {
  if (!officialContext || officialContext.length < 50) return false;
  const ans = proposedAnswer.toLowerCase();
  const ctx = officialContext.toLowerCase();

  // If the proposed answer contains numbers/locations found in official context
  const numbersInAns = ans.match(/\b\d+(?:,\d+)*(?:\.\d+)?\b/g) || [];
  if (numbersInAns.length > 0) {
    const matchingNumbers = numbersInAns.filter(num => ctx.includes(num));
    if (matchingNumbers.length >= 1) return true;
  }

  // Check key proper nouns
  const keywords = ['astp', 'barki', 'ferozepur', 'punjab', 'hec', 'nceac', 'plan9'];
  const matchingKeywords = keywords.filter(kw => ans.includes(kw) && ctx.includes(kw));
  return matchingKeywords.length >= 2;
}

/**
 * Calls AI reasoning layer as LLM judge.
 */
async function evaluateWithLlmJudge({ question, proposedAnswer, officialContext, evidence }) {
  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = `You are an impartial fact-checking judge for Information Technology University (ITU) Lahore.
Evaluate whether the proposed candidate answer is factual, plausible, or contradicted based on the provided evidence.

Official Context:
${officialContext ? officialContext.slice(0, 1000) : 'None'}

Evidence Items:
${JSON.stringify(evidence || [])}

Question: "${question}"
Proposed Answer: "${proposedAnswer}"

Task:
Respond ONLY with JSON:
{
  "verdict": "PLAUSIBLE" | "CONTRADICTED",
  "confidence": 0.0 - 1.0,
  "reason": "one sentence explanation"
}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    // Use OpenAI directly
    let url = 'https://api.openai.com/v1/chat/completions';
    let headers = {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    };
    let body = JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-6.1-sol',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 150
    });

    const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

