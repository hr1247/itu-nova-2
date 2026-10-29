import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { crossCheckCandidate } from './crossCheckService.js';
import { appendLearnedMemoryEntry, getLearnedMemoryPath } from './learnedMemoryService.js';
import { fetchEmbedding } from './routerService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultStorePath = process.env.ITU_SELF_LEARNING_PATH
  ? path.resolve(process.env.ITU_SELF_LEARNING_PATH)
  : path.resolve(__dirname, '../../data/self_learning.json');

function emptyStore() {
  return {
    version: 1,
    interactions: [],
    topics: [],
    knowledgeGaps: [],
    candidates: [],
    decisions: [],
    feedback: [],
    verifiedKnowledge: []
  };
}

function readStore(storePath = defaultStorePath) {
  try {
    if (!fs.existsSync(storePath)) return emptyStore();
    const raw = fs.readFileSync(storePath, 'utf8');
    return { ...emptyStore(), ...JSON.parse(raw || '{}') };
  } catch (error) {
    if (error.code === 'ENOENT') return emptyStore();
    console.warn('[Autonomous Learning] Store read warning:', error.message);
    return emptyStore();
  }
}

function writeStore(store, storePath = defaultStorePath) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(temporaryPath, storePath);
}

/**
 * Creates a new learning candidate from an interaction, knowledge gap, or trusted source.
 */
export function createLearningCandidate({
  question,
  proposedAnswer,
  topicId = null,
  source = 'model_generated_unverified',
  sourceUrl = '',
  reason = 'Knowledge gap detected',
  storePath = defaultStorePath
}) {
  const store = readStore(storePath);

  // Check for duplicate pending candidate
  const cleanQ = String(question || '').trim().toLowerCase();
  const existing = store.candidates.find(c =>
    c.validationStatus === 'PENDING' && c.question.trim().toLowerCase() === cleanQ
  );
  if (existing) {
    return existing;
  }

  const candidate = {
    id: randomUUID(),
    topicId,
    question: String(question || '').trim(),
    proposedAnswer: String(proposedAnswer || '').trim(),
    source,
    sourceUrl,
    reason,
    validationStatus: 'PENDING',
    createdAt: new Date().toISOString()
  };

  store.candidates.push(candidate);
  writeStore(store, storePath);
  console.log(`[AUTONOMOUS LEARNING] Created learning candidate ${candidate.id} for: "${candidate.question.slice(0, 50)}..."`);
  return candidate;
}

/**
 * Evaluates a single candidate through the cross-checking decision engine,
 * sets APPROVED / PENDING / DENIED, and updates verified knowledge & vector index if approved.
 */
export async function evaluateAndApplyCandidate(
  candidateId,
  options = {}
) {
  const storePath = options.storePath || defaultStorePath;
  const embedder = options.embedder || fetchEmbedding;
  const store = readStore(storePath);

  const candidate = store.candidates.find(c => c.id === candidateId);
  if (!candidate) {
    throw new Error(`Candidate with id ${candidateId} not found.`);
  }

  console.log(`[AUTONOMOUS LEARNING] Cross-checking candidate ${candidate.id}: "${candidate.question}"`);

  // Run through hierarchical cross-checking engine
  const decision = await crossCheckCandidate(candidate);

  // Record decision history
  store.decisions = store.decisions || [];
  store.decisions.push(decision);

  if (decision.status === 'APPROVED') {
    candidate.validationStatus = 'APPROVED';
    candidate.approvedAt = decision.timestamp;
    candidate.decisionReason = decision.reason;
    candidate.confidence = decision.confidence;

    // Resolve corresponding knowledge gap if one exists
    if (candidate.topicId && Array.isArray(store.knowledgeGaps)) {
      const gap = store.knowledgeGaps.find(g => g.topicId === candidate.topicId);
      if (gap) {
        gap.status = 'RESOLVED';
        gap.resolvedAt = decision.timestamp;
        gap.resolvedByCandidateId = candidate.id;
      }
    }

    // Persist store update
    writeStore(store, storePath);

    // 1. Generate local embedding vector using Ollama
    let embedding = null;
    try {
      embedding = await embedder(candidate.question);
    } catch (embErr) {
      console.warn('[AUTONOMOUS LEARNING] Embedding generation warning:', embErr.message);
    }

    // 2. Commit to verified RAG memory store (learned_memory.json + cache)
    appendLearnedMemoryEntry({
      query: candidate.question,
      response: candidate.proposedAnswer,
      sourceType: 'LEARNED_APPROVED',
      source: decision.source,
      evidence: decision.evidence,
      confidence: decision.confidence,
      mode: 'itu',
      embedding: Array.isArray(embedding) ? embedding : null,
      customPath: options.customMemoryPath || null
    });

    console.log(`[AUTONOMOUS LEARNING] ✅ Candidate ${candidate.id} APPROVED and added to verified RAG memory!`);

  } else if (decision.status === 'DENIED') {
    candidate.validationStatus = 'DENIED';
    candidate.deniedAt = decision.timestamp;
    candidate.decisionReason = decision.reason;
    writeStore(store, storePath);
    console.log(`[AUTONOMOUS LEARNING] ❌ Candidate ${candidate.id} DENIED: ${decision.reason}`);

  } else {
    // PENDING
    candidate.validationStatus = 'PENDING';
    candidate.lastCheckedAt = decision.timestamp;
    candidate.decisionReason = decision.reason;
    writeStore(store, storePath);
    console.log(`[AUTONOMOUS LEARNING] ⏳ Candidate ${candidate.id} retained as PENDING: ${decision.reason}`);
  }

  return {
    candidate,
    decision
  };
}

/**
 * Processes all currently pending learning candidates.
 */
export async function processAllPendingCandidates(options = {}) {
  const storePath = options.storePath || defaultStorePath;
  const store = readStore(storePath);

  const pending = store.candidates.filter(c => c.validationStatus === 'PENDING');
  if (pending.length === 0) return { processed: 0, results: [] };

  console.log(`[AUTONOMOUS LEARNING] Processing ${pending.length} pending candidate(s)...`);
  const results = [];

  for (const candidate of pending) {
    try {
      const res = await evaluateAndApplyCandidate(candidate.id, options);
      results.push(res);
    } catch (err) {
      console.error(`[AUTONOMOUS LEARNING] Error processing candidate ${candidate.id}:`, err.message);
    }
  }

  return {
    processed: results.length,
    results
  };
}

/**
 * Returns overall autonomous learning diagnostic statistics.
 */
export function getAutonomousLearningDiagnostics(storePath = defaultStorePath) {
  const store = readStore(storePath);
  return {
    totalInteractions: store.interactions?.length || 0,
    totalTopics: store.topics?.length || 0,
    openKnowledgeGaps: (store.knowledgeGaps || []).filter(g => g.status === 'DETECTED').length,
    resolvedKnowledgeGaps: (store.knowledgeGaps || []).filter(g => g.status === 'RESOLVED').length,
    candidates: {
      pending: (store.candidates || []).filter(c => c.validationStatus === 'PENDING').length,
      approved: (store.candidates || []).filter(c => c.validationStatus === 'APPROVED').length,
      denied: (store.candidates || []).filter(c => c.validationStatus === 'DENIED').length,
      total: store.candidates?.length || 0
    },
    decisionsCount: store.decisions?.length || 0
  };
}

