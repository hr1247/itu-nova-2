import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cosineSimilarity from 'compute-cosine-similarity';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let memoryCacheMap = new Map();
let cacheLoaded = false;

/**
 * Resolves the path to learned_memory.json across different workspace setups.
 */
export function getLearnedMemoryPath(customPath = null) {
  if (customPath) {
    return path.resolve(customPath);
  }
  if (process.env.ITU_LEARNED_MEMORY_PATH && fs.existsSync(process.env.ITU_LEARNED_MEMORY_PATH)) {
    return path.resolve(process.env.ITU_LEARNED_MEMORY_PATH);
  }
  const rootPath = path.resolve(__dirname, '../../../src/data/learned_memory.json');
  if (fs.existsSync(rootPath)) return rootPath;

  const serverDataPath = path.resolve(__dirname, '../data/learned_memory.json');
  if (fs.existsSync(serverDataPath)) return serverDataPath;

  const rootDataPath = path.resolve(__dirname, '../../data/learned_memory.json');
  if (fs.existsSync(rootDataPath)) return rootDataPath;

  return rootPath;
}

/**
 * Path for persisting precomputed embeddings of learned memory queries.
 */
export function getCachePath() {
  return path.resolve(__dirname, '../data/learned_memory_cache.json');
}

/**
 * Normalize text for case and punctuation insensitive comparison.
 */
export function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Loads valid and informative learned memory entries.
 * Filters out empty or low-quality canned responses.
 */
export function loadLearnedMemory(customPath = null) {
  const filePath = getLearnedMemoryPath(customPath);
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    const entries = JSON.parse(raw || '[]');
    if (!Array.isArray(entries)) return [];

    return entries.filter(e => {
      if (!e || typeof e !== 'object') return false;
      if (!e.query || typeof e.query !== 'string' || !e.query.trim()) return false;
      if (!e.response || typeof e.response !== 'string') return false;
      const resp = e.response.trim();
      if (resp.length < 25) return false;
      if (/^here is the requested information\.?$/i.test(resp)) return false;
      if (/sorry, I could not generate/i.test(resp)) return false;
      if (/provider is not available|offline mode/i.test(resp)) return false;
      if (/I am an AI assistant|not a student|personal preferences|as an AI language model|choice ultimately depends/i.test(resp)) return false;
      if (resp.endsWith('?') && resp.length < 150) return false;
      const q = e.query.trim().toLowerCase();
      if (q === 'ask an itu question' || q.startsWith('ask an itu')) return false;
      return true;
    });
  } catch (err) {
    console.warn('[Learned Memory] Could not read memory entries:', err.message);
    return [];
  }
}

/**
 * Loads cached embeddings from disk into memory.
 */
export function loadEmbeddingCache() {
  if (cacheLoaded) return memoryCacheMap;
  const cachePath = getCachePath();
  try {
    if (fs.existsSync(cachePath)) {
      const raw = fs.readFileSync(cachePath, 'utf-8');
      const data = JSON.parse(raw || '{}');
      memoryCacheMap = new Map(Object.entries(data));
    }
  } catch (err) {
    console.warn('[Learned Memory] Could not load embedding cache:', err.message);
    memoryCacheMap = new Map();
  }
  cacheLoaded = true;
  return memoryCacheMap;
}

/**
 * Saves in-memory cache to disk.
 */
export function persistEmbeddingCache() {
  try {
    const cachePath = getCachePath();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const obj = Object.fromEntries(memoryCacheMap.entries());
    fs.writeFileSync(cachePath, JSON.stringify(obj), 'utf-8');
  } catch (err) {
    console.warn('[Learned Memory] Could not persist embedding cache:', err.message);
  }
}

/**
 * Store an embedding for a query into cache.
 */
export function recordLearnedEmbedding(query, embedding) {
  if (!query || !Array.isArray(embedding)) return;
  loadEmbeddingCache();
  const normalized = normalizeText(query);
  memoryCacheMap.set(normalized, embedding);
  persistEmbeddingCache();
}

/**
 * Calculate cosine similarity safely.
 */
function safeSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) {
    return -1;
  }
  try {
    const score = cosineSimilarity(vecA, vecB);
    return Number.isFinite(score) ? score : -1;
  } catch {
    return -1;
  }
}

/**
 * Indexes any un-embedded learned memory entries via the provided fetchEmbedding function.
 */
export async function warmLearnedMemoryIndex(fetchEmbeddingFn, customPath = null) {
  loadEmbeddingCache();
  const entries = loadLearnedMemory(customPath);
  let newlyEmbedded = 0;

  for (const entry of entries) {
    const key = normalizeText(entry.query);
    if (!memoryCacheMap.has(key) && typeof fetchEmbeddingFn === 'function') {
      try {
        const embedding = await fetchEmbeddingFn(entry.query);
        if (embedding && Array.isArray(embedding)) {
          memoryCacheMap.set(key, embedding);
          newlyEmbedded++;
        }
      } catch (err) {
        console.warn(`[Learned Memory] Failed to embed "${entry.query}":`, err.message);
      }
    }
  }

  if (newlyEmbedded > 0) {
    persistEmbeddingCache();
    console.log(`[Learned Memory] Embedded and cached ${newlyEmbedded} new queries.`);
  }

  return { total: entries.length, cached: memoryCacheMap.size };
}

/**
 * Appends or updates an entry in learned_memory.json and caches its embedding immediately.
 */
export function appendLearnedMemoryEntry({
  query,
  response,
  suggestions = [],
  mode = 'itu',
  context = '',
  sourceType = 'LEARNED_APPROVED',
  source = 'verified_learning',
  evidence = [],
  confidence = 0.92,
  embedding = null,
  customPath = null
}) {
  const filePath = getLearnedMemoryPath(customPath);
  try {
    let entries = [];
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      entries = JSON.parse(raw || '[]');
    }

    const cleanQuery = String(query || '').trim();
    const cleanResponse = String(response || '').trim();
    if (!cleanQuery || !cleanResponse) return;
    if (cleanQuery.toLowerCase() === 'ask an itu question' || cleanQuery.toLowerCase().startsWith('ask an itu')) return;
    if (cleanResponse.endsWith('?') && cleanResponse.length < 150) return;

    const existingIndex = entries.findIndex(
      e => normalizeText(e.query) === normalizeText(cleanQuery)
    );

    const newRecord = {
      query: cleanQuery,
      response: cleanResponse,
      suggestions: Array.isArray(suggestions) ? suggestions : [],
      context: typeof context === 'string' ? context : JSON.stringify(context),
      mode,
      sourceType,
      source,
      evidence: Array.isArray(evidence) ? evidence : [],
      confidence,
      version: 1,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      entries[existingIndex] = {
        ...entries[existingIndex],
        ...newRecord
      };
    } else {
      newRecord.createdAt = new Date().toISOString();
      entries.push(newRecord);
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf-8');

    if (Array.isArray(embedding)) {
      recordLearnedEmbedding(cleanQuery, embedding);
    }
  } catch (err) {
    console.warn('[Learned Memory] Could not append learned entry:', err.message);
  }
}

/**
 * Find the closest matching question from learned memory.
 * 
 * @param {Object} options
 * @param {string} options.message - The incoming user question.
 * @param {number[]} [options.queryEmbedding] - Precomputed embedding of the incoming question.
 * @param {number} [options.minSimilarity=0.78] - Minimum cosine similarity to consider a match.
 * @param {number} [options.minDirectAnswerSimilarity=0.88] - Threshold above which the answer can be directly used.
 * @param {string} [options.customPath] - Optional custom path for learned_memory.json.
 * @returns {Object|null}
 */
export function findLearnedMemoryMatch({
  message,
  queryEmbedding = null,
  minSimilarity = 0.82,
  minDirectAnswerSimilarity = 0.92,
  customPath = null
}) {
  if (!message || !message.trim()) return null;

  const entries = loadLearnedMemory(customPath);
  if (entries.length === 0) return null;

  const normalizedInput = normalizeText(message);

  // 1. Check for exact normalized query match (instant 100% match)
  for (const entry of entries) {
    const normalizedEntry = normalizeText(entry.query);
    if (normalizedEntry === normalizedInput) {
      return {
        match: entry,
        similarity: 1.0,
        matchType: 'exact',
        isDirectAnswer: true,
        matchedQuery: entry.query,
        reason: 'Exact match with previously verified and learned question.'
      };
    }
  }

  // 2. Semantic Vector Match using cached query embeddings
  if (queryEmbedding && Array.isArray(queryEmbedding)) {
    loadEmbeddingCache();

    let bestMatch = null;
    let maxSimilarity = -1;

    for (const entry of entries) {
      const key = normalizeText(entry.query);
      const cachedVec = memoryCacheMap.get(key);

      if (cachedVec) {
        const score = safeSimilarity(queryEmbedding, cachedVec);
        if (score > maxSimilarity) {
          maxSimilarity = score;
          bestMatch = entry;
        }
      }
    }

    if (bestMatch && maxSimilarity >= minSimilarity) {
      // Intent mismatch guards: don't allow cross-topic semantic collisions
      const userAsksAcronym = /\b(full\s*form|stand\s*for|stands\s*for|acronym|abbreviation|meaning\s+of\s+itu)\b/i.test(message);
      const matchAsksAcronym = /\b(full\s*form|stand\s*for|stands\s*for|acronym|abbreviation|meaning\s+of\s+itu)\b/i.test(bestMatch.query);
      if (userAsksAcronym && !matchAsksAcronym) return null;

      const userAsksFee = /\b(fee|tuition|cost|charges?)\b/i.test(message);
      const matchAsksFee = /\b(fee|tuition|cost|charges?)\b/i.test(bestMatch.query);
      if (userAsksFee && !matchAsksFee) return null;

      const roundedScore = Number(maxSimilarity.toFixed(2));
      return {
        match: bestMatch,
        similarity: roundedScore,
        matchType: 'semantic',
        isDirectAnswer: (() => {
          if (maxSimilarity < minDirectAnswerSimilarity) return false;
          const userAsksEligibility = /\b(admission|admissions|eligible|eligibility|percentage|apply|qualify|requirements?)\b/i.test(message);
          const matchAsksOpinion = /\b(right for you|opinion|preference|which (?:is )?better|choice)\b/i.test(bestMatch.query);
          if (userAsksEligibility && matchAsksOpinion) return false;
          return true;
        })(),
        matchedQuery: bestMatch.query,
        reason: `Matched learned question "${bestMatch.query}" with ${(roundedScore * 100).toFixed(0)}% semantic similarity.`
      };
    }
  }

  return null;
}

/**
 * Resets the in-memory cache (primarily for unit tests).
 */
export function resetMemoryCacheForTesting() {
  memoryCacheMap = new Map();
  cacheLoaded = false;
}
