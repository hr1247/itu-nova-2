import { processAllPendingCandidates } from './autonomousLearningEngine.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import cosineSimilarity from 'compute-cosine-similarity';
import { fetchEmbedding } from './routerService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storePath = process.env.ITU_SELF_LEARNING_PATH
  ? path.resolve(process.env.ITU_SELF_LEARNING_PATH)
  : path.resolve(__dirname, '../../data/self_learning.json');
const MAX_RECORDS = 2000;
const TOPIC_THRESHOLD = 0.78;
const GAP_RETRIEVAL_THRESHOLD = 0.5;
let processingQueue = Promise.resolve();

function emptyStore() {
  return { version: 1, interactions: [], topics: [], knowledgeGaps: [], candidates: [], feedback: [], verifiedKnowledge: [] };
}

function readStore(currentStorePath = storePath) {
  try {
    const value = JSON.parse(fs.readFileSync(currentStorePath, 'utf8'));
    return { ...emptyStore(), ...value };
  } catch (error) {
    if (error.code === 'ENOENT') return emptyStore();
    throw error;
  }
}

function writeStore(value, currentStorePath = storePath) {
  fs.mkdirSync(path.dirname(currentStorePath), { recursive: true });
  const temporaryPath = `${currentStorePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temporaryPath, currentStorePath);
}

function similarity(first, second) {
  if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length) return -1;
  try {
    const score = cosineSimilarity(first, second);
    return Number.isFinite(score) ? score : -1;
  } catch {
    return -1;
  }
}

function likelyITUQuestion(question) {
  return /\b(itu|information technology university|bscs|bsai|admission|tuition|merit|campus|astp|route|transport|hostel|scholarship|nceac|hec)\b/i.test(question);
}

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function sectionsFromContext(context) {
  try {
    return Object.keys(JSON.parse(context || '{}')).slice(0, 20);
  } catch {
    return context ? ['unstructured_context'] : [];
  }
}

function hasKnowledgeGap(record) {
  return record.confidence < 0.55
    || (record.detectedMode === 'itu' && record.retrievalScore < GAP_RETRIEVAL_THRESHOLD)
    || record.answerFallback
    || (record.requestedMode === 'auto' && record.detectedMode === 'general' && likelyITUQuestion(record.question));
}

function updateTopic(store, record, embedding) {
  let selected = null;
  let highestScore = -1;
  for (const topic of store.topics) {
    const score = similarity(embedding, topic.embedding);
    if (score > highestScore) {
      selected = topic;
      highestScore = score;
    }
  }

  if (!selected || highestScore < TOPIC_THRESHOLD) {
    selected = {
      id: randomUUID(),
      representativeQuestion: record.question,
      sampleQuestions: [],
      embedding: embedding || null,
      occurrences: 0,
      confidenceTotal: 0,
      retrievalScoreTotal: 0,
      averageConfidence: 0,
      averageRetrievalScore: 0,
      routeCounts: { itu: 0, general: 0 },
      createdAt: record.timestamp,
      updatedAt: record.timestamp
    };
    store.topics.push(selected);
  }

  selected.occurrences += 1;
  selected.confidenceTotal += record.confidence;
  selected.retrievalScoreTotal += record.retrievalScore;
  selected.averageConfidence = selected.confidenceTotal / selected.occurrences;
  selected.averageRetrievalScore = selected.retrievalScoreTotal / selected.occurrences;
  selected.routeCounts[record.detectedMode] = (selected.routeCounts[record.detectedMode] || 0) + 1;
  selected.updatedAt = record.timestamp;
  if (embedding && !selected.embedding) selected.embedding = embedding;
  if (!selected.sampleQuestions.includes(record.question) && selected.sampleQuestions.length < 5) {
    selected.sampleQuestions.push(record.question);
  }
  return { topic: selected, matched: highestScore >= TOPIC_THRESHOLD };
}

function updateGap(store, topic, record) {
  let gap = store.knowledgeGaps.find(item => item.topicId === topic.id);
  const reason = record.answerFallback
    ? 'Fallback answer used'
    : record.retrievalScore < GAP_RETRIEVAL_THRESHOLD
      ? 'Low retrieval similarity'
      : record.detectedMode === 'general'
        ? 'Likely ITU question routed to General'
        : 'Low response confidence';

  if (!gap) {
    gap = {
      id: randomUUID(),
      topicId: topic.id,
      topic: topic.representativeQuestion,
      frequency: 0,
      confidenceTotal: 0,
      retrievalScoreTotal: 0,
      averageConfidence: 0,
      averageRetrievalScore: 0,
      representativeQuestions: [],
      reasons: [],
      status: 'DETECTED',
      createdAt: record.timestamp,
      updatedAt: record.timestamp
    };
    store.knowledgeGaps.push(gap);
    console.log('[SELF-LEARNING] Knowledge gap detected');
  }

  gap.frequency += 1;
  gap.confidenceTotal += record.confidence;
  gap.retrievalScoreTotal += record.retrievalScore;
  gap.averageConfidence = gap.confidenceTotal / gap.frequency;
  gap.averageRetrievalScore = gap.retrievalScoreTotal / gap.frequency;
  gap.updatedAt = record.timestamp;
  if (!gap.reasons.includes(reason)) gap.reasons.push(reason);
  if (!gap.representativeQuestions.includes(record.question) && gap.representativeQuestions.length < 5) {
    gap.representativeQuestions.push(record.question);
  }

  if (!store.candidates.some(item => item.topicId === topic.id && item.validationStatus === 'PENDING')) {
    store.candidates.push({
      id: randomUUID(),
      topicId: topic.id,
      question: record.question,
      proposedAnswer: record.answer,
      source: 'model_generated_unverified',
      reason,
      validationStatus: 'PENDING',
      createdAt: record.timestamp
    });
    console.log('[SELF-LEARNING] Learning candidate created');
  }
}

async function processInteraction(input, options = {}) {
  const currentStorePath = options.storePath || storePath;
  const embedder = options.embedder || fetchEmbedding;
  const record = {
    id: randomUUID(),
    question: String(input.question || '').slice(0, 2000),
    answer: String(input.answer || '').slice(0, 8000),
    requestedMode: input.requestedMode || 'auto',
    detectedMode: input.detectedMode || 'general',
    routeReason: String(input.routeReason || '').slice(0, 500),
    confidence: Number.isFinite(input.confidence) ? input.confidence : 0,
    retrievalScore: Number.isFinite(input.retrievalScore) ? input.retrievalScore : 0,
    retrievalSources: Array.isArray(input.sources) ? input.sources.slice(0, 10) : [],
    retrievedSections: sectionsFromContext(input.groundedContext),
    model: input.model || 'unknown',
    answerFallback: Boolean(input.answerFallback),
    timestamp: input.timestamp || new Date().toISOString()
  };

  const store = readStore(currentStorePath);
  store.interactions.push(record);
  store.interactions = store.interactions.slice(-MAX_RECORDS);
  writeStore(store, currentStorePath);
  console.log('[SELF-LEARNING] Interaction recorded');

  let embedding = null;
  try {
    embedding = await embedder(record.question);
  } catch {
    // The local interaction log remains useful if Ollama embeddings are unavailable.
  }

  const updated = readStore(currentStorePath);
  const { topic, matched } = updateTopic(updated, record, embedding);
  const storedInteraction = updated.interactions.find(item => item.id === record.id);
  if (storedInteraction) storedInteraction.topicId = topic.id;
  if (matched) console.log('[SELF-LEARNING] Similar question cluster updated');
  if (hasKnowledgeGap(record)) updateGap(updated, topic, record);
  updated.topics = updated.topics.slice(-MAX_RECORDS);
  updated.knowledgeGaps = updated.knowledgeGaps.slice(-MAX_RECORDS);
  updated.candidates = updated.candidates.slice(-MAX_RECORDS);
  writeStore(updated, currentStorePath);
  console.log('[SELF-LEARNING] Learning cycle completed');
  processAllPendingCandidates({ storePath: currentStorePath, embedder }).catch(err => {
    console.warn('[SELF-LEARNING] Candidate autonomous processing warning:', err.message);
  });
}

export function enqueueInteraction(record, options = {}) {
  processingQueue = processingQueue
    .then(() => new Promise(resolve => setImmediate(resolve)))
    .then(() => processInteraction(record, options))
    .catch(error => console.warn('[SELF-LEARNING] Background analysis failed:', error.message));
}

export async function waitForLearningQueue() {
  await processingQueue;
}

export async function getLearnedRoutingHint(question, queryEmbedding, options = {}) {
  const currentStorePath = options.storePath || storePath;
  const embedder = options.embedder || fetchEmbedding;
  let embedding = queryEmbedding;
  if (!Array.isArray(embedding)) {
    try {
      embedding = await embedder(question);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(embedding)) return null;

  const store = readStore(currentStorePath);
  let best = null;
  let bestScore = -1;
  for (const topic of store.topics) {
    const score = similarity(embedding, topic.embedding);
    if (score > bestScore) {
      best = topic;
      bestScore = score;
    }
  }
  if (!best || bestScore < TOPIC_THRESHOLD) return null;

  const dominantMode = Object.entries(best.routeCounts || {})
    .sort((first, second) => second[1] - first[1])[0]?.[0];
  return dominantMode === 'itu'
    ? { mode: 'itu', score: Number(bestScore.toFixed(3)), representativeQuestion: best.representativeQuestion }
    : null;
}

export function recordFeedbackSignal(feedback, currentStorePath = storePath) {
  const store = readStore(currentStorePath);
  const signal = {
    id: randomUUID(),
    question: String(feedback.question || '').slice(0, 2000),
    rating: feedback.rating,
    correctionCandidateId: feedback.correctionCandidateId || null,
    timestamp: new Date().toISOString()
  };
  store.feedback.push(signal);
  const normalizedQuestion = normalizeText(signal.question);
  const interaction = [...store.interactions].reverse().find(item =>
    normalizeText(item.question) === normalizedQuestion
  );
  if (interaction) {
    interaction.feedbackRating = signal.rating;
    const topic = store.topics.find(item => item.id === interaction.topicId);
    if (topic) {
      topic.feedbackCounts ||= { helpful: 0, notHelpful: 0 };
      if (signal.rating === 'helpful') topic.feedbackCounts.helpful += 1;
      if (signal.rating === 'not_helpful') topic.feedbackCounts.notHelpful += 1;
      const total = topic.feedbackCounts.helpful + topic.feedbackCounts.notHelpful;
      topic.averageFeedbackScore = total > 0 ? topic.feedbackCounts.helpful / total : null;
    }
  }
  store.feedback = store.feedback.slice(-MAX_RECORDS);
  writeStore(store, currentStorePath);
}

export function getLearningSummary(currentStorePath = storePath) {
  const store = readStore(currentStorePath);
  return {
    interactionCount: store.interactions.length,
    topicCount: store.topics.length,
    knowledgeGapCount: store.knowledgeGaps.length,
    pendingCandidateCount: store.candidates.filter(item => item.validationStatus === 'PENDING').length
  };
}

export function listLearningCandidates(currentStorePath = storePath) {
  const store = readStore(currentStorePath);
  return store.candidates.map(candidate => ({
    id: candidate.id,
    question: candidate.question,
    reason: candidate.reason,
    source: candidate.source,
    validationStatus: candidate.validationStatus,
    createdAt: candidate.createdAt
  }));
}

export function dismissLearningCandidate(candidateId, currentStorePath = storePath) {
  const store = readStore(currentStorePath);
  const candidate = store.candidates.find(item => item.id === candidateId && item.validationStatus === 'PENDING');
  if (!candidate) throw new Error('Pending learning candidate not found.');
  candidate.validationStatus = 'REJECTED';
  candidate.reviewedAt = new Date().toISOString();
  writeStore(store, currentStorePath);
  return candidate;
}
