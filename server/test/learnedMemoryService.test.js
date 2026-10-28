import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadLearnedMemory,
  findLearnedMemoryMatch,
  warmLearnedMemoryIndex,
  recordLearnedEmbedding,
  resetMemoryCacheForTesting
} from '../src/services/learnedMemoryService.js';

test('loadLearnedMemory filters out short or generic boilerplate responses', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itu-learned-mem-test-'));
  const testFile = path.join(dir, 'learned_memory.json');

  const mockData = [
    { query: 'Valid query 1', response: 'This is a detailed, informative answer about ITU scholarships and eligibility.', mode: 'itu' },
    { query: 'Generic query', response: 'Here is the requested information.', mode: 'itu' },
    { query: 'Short query', response: 'Too short', mode: 'itu' },
    { query: 'Failed query', response: 'Sorry, I could not generate an answer right now.', mode: 'itu' },
    { query: 'Valid query 2', response: 'ITU offers BS Computer Science and BS Artificial Intelligence degree programs.', mode: 'itu' }
  ];

  fs.writeFileSync(testFile, JSON.stringify(mockData), 'utf-8');

  try {
    const loaded = loadLearnedMemory(testFile);
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].query, 'Valid query 1');
    assert.equal(loaded[1].query, 'Valid query 2');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('findLearnedMemoryMatch returns exact direct answer match regardless of case/punctuation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itu-learned-mem-test-'));
  const testFile = path.join(dir, 'learned_memory.json');

  const mockData = [
    { query: 'What programs does ITU offer?', response: 'ITU offers BSCS and BSAI undergraduate degrees.', mode: 'itu' }
  ];

  fs.writeFileSync(testFile, JSON.stringify(mockData), 'utf-8');

  try {
    const match = findLearnedMemoryMatch({
      message: 'what programs does itu offer',
      customPath: testFile
    });

    assert.ok(match);
    assert.equal(match.matchType, 'exact');
    assert.equal(match.similarity, 1.0);
    assert.equal(match.isDirectAnswer, true);
    assert.equal(match.match.response, 'ITU offers BSCS and BSAI undergraduate degrees.');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('findLearnedMemoryMatch performs semantic vector match with cached embeddings', () => {
  resetMemoryCacheForTesting();

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itu-learned-mem-test-'));
  const testFile = path.join(dir, 'learned_memory.json');

  const mockData = [
    { query: 'What is the tuition fee for BSCS?', response: 'The BSCS tuition fee is PKR 9,200 per credit hour.', mode: 'itu' }
  ];

  fs.writeFileSync(testFile, JSON.stringify(mockData), 'utf-8');

  // Vector for fee query
  recordLearnedEmbedding('What is the tuition fee for BSCS?', [1, 0, 0]);

  try {
    // Query with similar vector [0.95, 0.05, 0]
    const match = findLearnedMemoryMatch({
      message: 'How much do I pay for BS Computer Science?',
      queryEmbedding: [0.95, 0.05, 0],
      customPath: testFile
    });

    assert.ok(match);
    assert.equal(match.matchType, 'semantic');
    assert.ok(match.similarity >= 0.88);
    assert.equal(match.isDirectAnswer, true);
    assert.equal(match.match.response, 'The BSCS tuition fee is PKR 9,200 per credit hour.');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    resetMemoryCacheForTesting();
  }
});

test('findLearnedMemoryMatch returns null when similarity is below threshold', () => {
  resetMemoryCacheForTesting();

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itu-learned-mem-test-'));
  const testFile = path.join(dir, 'learned_memory.json');

  const mockData = [
    { query: 'What is the tuition fee for BSCS?', response: 'The BSCS tuition fee is PKR 9,200 per credit hour.', mode: 'itu' }
  ];

  fs.writeFileSync(testFile, JSON.stringify(mockData), 'utf-8');
  recordLearnedEmbedding('What is the tuition fee for BSCS?', [1, 0, 0]);

  try {
    // Orthogonal vector [0, 1, 0] (similarity 0)
    const match = findLearnedMemoryMatch({
      message: 'Tell me about French history',
      queryEmbedding: [0, 1, 0],
      minSimilarity: 0.78,
      customPath: testFile
    });

    assert.equal(match, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    resetMemoryCacheForTesting();
  }
});

test('submitLearningFeedback with autoApprove activates and embeds correction immediately without manual review', async () => {
  const { submitLearningFeedback, getRelevantApprovedCorrection } = await import('../src/services/learningService.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itu-auto-learn-test-'));
  const storePath = path.join(dir, 'feedback.json');
  const embedder = async () => [1, 0];

  try {
    const entry = submitLearningFeedback({
      question: 'What is the new campus library timing?',
      answer: 'Standard hours',
      rating: 'not_helpful',
      correction: 'The library is open from 8:00 AM to 11:00 PM during finals.',
      autoApprove: true
    }, storePath, embedder);

    assert.equal(entry.status, 'approved');
    assert.equal(entry.validationStatus, 'AUTO_APPROVED');
    assert.equal(entry.approvalSource, 'autonomous_self_learning');

    // Give background promise a tick
    await new Promise(resolve => setTimeout(resolve, 50));

    const matched = await getRelevantApprovedCorrection('What is the new campus library timing?', storePath, embedder);
    assert.ok(matched);
    assert.equal(matched.correction, 'The library is open from 8:00 AM to 11:00 PM during finals.');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

