import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import cosineSimilarity from 'compute-cosine-similarity';
import { fetchEmbedding } from './routerService.js';
import { appendLearnedMemoryEntry } from './learnedMemoryService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultStorePath = process.env.ITU_LEARNING_STORE_PATH
  ? path.resolve(process.env.ITU_LEARNING_STORE_PATH)
  : path.resolve(__dirname, '../../data/learning_feedback.json');

function readEntries(storePath = defaultStorePath) {
  try {
    const entries = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function writeEntries(entries, storePath = defaultStorePath) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(entries, null, 2), 'utf8');
  fs.renameSync(temporaryPath, storePath);
}

export function submitLearningFeedback(
  {
    question,
    answer,
    rating,
    correction,
    autoApprove = (process.env.AUTO_APPROVE_CORRECTIONS === 'true' && process.env.NODE_ENV !== 'test'),
    initialStatus = null,
    validationStatus = null,
    verificationReason = null
  },
  storePath = defaultStorePath,
  embedder = fetchEmbedding
) {
  const cleanQuestion = String(question || '').trim();
  const cleanAnswer = String(answer || '').trim();
  const cleanCorrection = String(correction || '').trim();

  if (!cleanQuestion || !cleanAnswer) {
    throw new Error('Question and answer are required.');
  }
  if (!['helpful', 'not_helpful'].includes(rating)) {
    throw new Error('Rating must be helpful or not_helpful.');
  }
  if (cleanQuestion.length > 2000 || cleanAnswer.length > 8000 || cleanCorrection.length > 4000) {
    throw new Error('Feedback exceeds the allowed text length.');
  }

  const isExplicitlyRejected = initialStatus === 'rejected';
  const shouldAutoApprove = !isExplicitlyRejected && Boolean(cleanCorrection && autoApprove);

  const entry = {
    id: randomUUID(),
    question: cleanQuestion,
    answer: cleanAnswer,
    rating,
    correction: cleanCorrection || null,
    status: cleanCorrection
      ? (isExplicitlyRejected ? 'rejected' : (shouldAutoApprove ? 'approved' : 'pending'))
      : 'feedback',
    ...(cleanCorrection
      ? {
          validationStatus: isExplicitlyRejected
            ? (validationStatus || 'REJECTED_BY_AI')
            : (shouldAutoApprove ? (validationStatus || 'AUTO_APPROVED') : 'PENDING'),
          source: 'user_suggested_correction',
          ...(isExplicitlyRejected && verificationReason ? { rejectionReason: verificationReason } : {}),
          ...(shouldAutoApprove
            ? {
                approvalSource: 'autonomous_self_learning',
                verificationReason: verificationReason || 'Autonomous verification passed.',
                reviewedAt: new Date().toISOString()
              }
            : {})
        }
      : {}),
    createdAt: new Date().toISOString()
  };

  const entries = readEntries(storePath);
  entries.push(entry);
  writeEntries(entries, storePath);

  if (shouldAutoApprove) {
    Promise.resolve().then(async () => {
      try {
        const questionEmbedding = await embedder(cleanQuestion);
        if (Array.isArray(questionEmbedding)) {
          const freshEntries = readEntries(storePath);
          const current = freshEntries.find(e => e.id === entry.id);
          if (current) {
            current.questionEmbedding = questionEmbedding;
            writeEntries(freshEntries, storePath);
          }
        }
        appendLearnedMemoryEntry({
          query: cleanQuestion,
          response: cleanCorrection,
          mode: 'itu',
          embedding: Array.isArray(questionEmbedding) ? questionEmbedding : null
        });
      } catch (err) {
        console.warn('[Self-Learning] Background auto-approve embedding notice:', err.message);
      }
    });
  }

  return entry;
}



export async function reviewLearningFeedback(id, decision, storePath = defaultStorePath, embedder = fetchEmbedding) {
  if (!['approve', 'reject'].includes(decision)) {
    throw new Error('Decision must be approve or reject.');
  }

  const entries = readEntries(storePath);
  const entry = entries.find(item => item.id === id);
  if (!entry || !entry.correction || !['pending', 'approved'].includes(entry.status)) {
    throw new Error('Reviewable correction not found.');
  }
  if (decision === 'approve' && entry.status !== 'pending') {
    throw new Error('Correction is already active.');
  }

  entry.status = decision === 'approve' ? 'approved' : 'rejected';
  entry.validationStatus = decision === 'approve' ? 'APPROVED_BY_REVIEWER' : 'REJECTED';
  if (decision === 'approve') entry.approvalSource = 'human_review';
  entry.reviewedAt = new Date().toISOString();
  if (decision === 'approve' && !Array.isArray(entry.questionEmbedding)) {
    const embedding = await embedder(entry.question);
    if (Array.isArray(embedding)) entry.questionEmbedding = embedding;
  }
  writeEntries(entries, storePath);

  if (decision === 'approve' && entry.correction) {
    try {
      appendLearnedMemoryEntry({
        query: entry.question,
        response: entry.correction,
        mode: 'itu',
        embedding: entry.questionEmbedding
      });
    } catch (err) {
      console.warn('[Self-Learning] Could not sync to learned memory:', err.message);
    }
  }
  return entry;
}

export function migrateUnverifiedCorrections(storePath = defaultStorePath) {
  const entries = readEntries(storePath);
  let changed = false;
  for (const entry of entries) {
    if (entry.status === 'approved' && /^automatic_/.test(entry.approvalSource || '')) {
      entry.status = 'pending';
      entry.validationStatus = 'PENDING';
      entry.migrationNote = 'Moved to pending review because it was automatically activated before reviewer validation was required.';
      changed = true;
    }
  }
  if (changed) writeEntries(entries, storePath);
  return changed;
}

export function listReviewableLearningFeedback(storePath = defaultStorePath) {
  return readEntries(storePath).filter(entry =>
    entry.correction && ['pending', 'approved'].includes(entry.status)
  );
}

function normalizeQuestion(text) {
  return String(text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getQuestionIntent(text) {
  const normalized = normalizeQuestion(text);
  if (/\b(fee|tuition|dues|cost|charges?|credit\s*hour)\b/.test(normalized)) return 'fee';
  if (/\b(location|where|address|city|campus|building)\b/.test(normalized)) return 'location';
  if (/\b(bus|transport|route|shuttle|stop|pickup)\b/.test(normalized)) return 'transport';
  if (/\b(library|book|books|reading|database)\b/.test(normalized)) return 'library';
  if (/\b(hostel|accommodation|stay|residence)\b/.test(normalized)) return 'hostel';
  if (/\b(name|who are you|what are you called|identify yourself|your identity)\b/.test(normalized)) return 'identity';
  if (/\b(how are you|how have you been|how is it going|how are things|you doing)\b/.test(normalized)) return 'wellbeing';
  return null;
}

const SEMANTIC_MATCH_THRESHOLD = 0.68;
const AMBIGUITY_MARGIN = 0.06;
const MAX_CORRECTIONS_TO_BACKFILL = 25;

export async function getRelevantApprovedCorrection(
  question,
  storePath = defaultStorePath,
  embedder = fetchEmbedding
) {
  const normalizedQuestion = normalizeQuestion(question);
  if (!normalizedQuestion) return null;

  const entries = readEntries(storePath);
  const approvedEntries = entries
    .filter(entry => entry.status === 'approved' && entry.correction)
    .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
  const exactMatch = approvedEntries.find(entry => normalizeQuestion(entry.question) === normalizedQuestion);
  if (exactMatch) {
    return { question: exactMatch.question, correction: exactMatch.correction, matchType: 'exact' };
  }

  const queryEmbedding = await embedder(question);
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) return null;
  const queryIntent = getQuestionIntent(question);

  let needsWrite = false;
  const candidates = [];
  for (const entry of approvedEntries.slice(0, MAX_CORRECTIONS_TO_BACKFILL)) {
    const candidateIntent = getQuestionIntent(entry.question);
    if ((queryIntent || candidateIntent) && queryIntent !== candidateIntent) continue;

    if (!Array.isArray(entry.questionEmbedding) || entry.questionEmbedding.length === 0) {
      const embedding = await embedder(entry.question);
      if (Array.isArray(embedding) && embedding.length > 0) {
        entry.questionEmbedding = embedding;
        needsWrite = true;
      }
    }

    if (!Array.isArray(entry.questionEmbedding) || entry.questionEmbedding.length !== queryEmbedding.length) {
      continue;
    }

    const score = cosineSimilarity(queryEmbedding, entry.questionEmbedding);
    if (Number.isFinite(score)) candidates.push({ entry, score });
  }

  if (needsWrite) writeEntries(entries, storePath);

  candidates.sort((first, second) => second.score - first.score);
  const best = candidates[0];
  const secondBest = candidates[1];
  if (!best || best.score < SEMANTIC_MATCH_THRESHOLD) return null;
  if (secondBest && best.score - secondBest.score < AMBIGUITY_MARGIN) return null;

  return {
    question: best.entry.question,
    correction: best.entry.correction,
    matchType: 'semantic',
    similarity: Number(best.score.toFixed(3))
  };
}

export async function initializeLearningStorage(storePath = defaultStorePath) {
  const migrated = migrateUnverifiedCorrections(storePath);
  if (migrated) console.log('[SELF-LEARNING] Legacy unreviewed corrections moved to pending review');
  return migrated;
}