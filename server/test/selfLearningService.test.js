import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  enqueueInteraction,
  getLearnedRoutingHint,
  getLearningSummary,
  waitForLearningQueue
} from '../src/services/selfLearningService.js';

async function withStore(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'itu-self-learning-test-'));
  const storePath = path.join(directory, 'self_learning.json');
  try {
    await run(storePath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const embeddingFor = question => /fee|tuition/i.test(question)
  ? [1, 0]
  : /where.*parking/i.test(question)
    ? [0, 1]
    : [0, 0.95];

test('normal interactions are persisted and semantically similar questions cluster', async () => {
  await withStore(async storePath => {
    const embedder = async question => embeddingFor(question);
    const first = {
      question: 'What is BSCS fee?',
      answer: 'PKR 9,200 per credit hour.',
      requestedMode: 'auto',
      detectedMode: 'itu',
      routeReason: 'fee keyword',
      confidence: 0.82,
      retrievalScore: 0.81,
      sources: ['ITU Knowledge Base'],
      groundedContext: '{"academicPrograms":[]}',
      model: 'ollama/llama3.2'
    };
    enqueueInteraction(first, { storePath, embedder });
    await waitForLearningQueue();
    enqueueInteraction({ ...first, question: 'How much is BSCS tuition?' }, { storePath, embedder });
    await waitForLearningQueue();

    const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    assert.equal(store.interactions.length, 2);
    assert.equal(store.interactions[0].retrievedSections[0], 'academicPrograms');
    assert.equal(store.topics.length, 1);
    assert.equal(store.topics[0].occurrences, 2);
    assert.equal(store.knowledgeGaps.length, 0);
    assert.equal((await getLearnedRoutingHint('How much is BSCS fee?', embeddingFor('fee'), { storePath, embedder }))?.mode, 'itu');
  });
});

test('low-confidence normal interaction detects a gap but never trusts its generated answer', async () => {
  await withStore(async storePath => {
    enqueueInteraction({
      question: 'Where is parking for students at ITU Barki campus?',
      answer: 'Students can park near the building.',
      requestedMode: 'itu',
      detectedMode: 'itu',
      routeReason: 'keyword fallback',
      confidence: 0.41,
      retrievalScore: 0.39,
      sources: ['ITU Knowledge Base'],
      groundedContext: '{}',
      model: 'ollama/llama3.2',
      answerFallback: true
    }, { storePath, embedder: async () => embeddingFor('parking') });
    await waitForLearningQueue();

    const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    assert.equal(store.knowledgeGaps.length, 1);
    assert.equal(store.knowledgeGaps[0].frequency, 1);
    assert.equal(store.candidates.length, 1);
    assert.equal(store.candidates[0].validationStatus, 'PENDING');
    assert.equal(store.candidates[0].source, 'model_generated_unverified');
    assert.equal(store.verifiedKnowledge.length, 0);
    assert.equal(getLearningSummary(storePath).pendingCandidateCount, 1);
  });
});

test('frequent low-quality paraphrases update the same knowledge gap cluster', async () => {
  await withStore(async storePath => {
    const embedder = async () => [0, 1];
    for (const question of [
      'Where can students park at Barki?',
      'Is parking available at Barki campus?'
    ]) {
      enqueueInteraction({
        question,
        answer: 'Unable to generate an answer.',
        requestedMode: 'itu',
        detectedMode: 'itu',
        confidence: 0.32,
        retrievalScore: 0.28,
        sources: [],
        groundedContext: '',
        answerFallback: true
      }, { storePath, embedder });
      await waitForLearningQueue();
    }

    const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    assert.equal(store.topics.length, 1);
    assert.equal(store.knowledgeGaps.length, 1);
    assert.equal(store.knowledgeGaps[0].frequency, 2);
    assert.equal(store.candidates.length, 1);
  });
});

test('interaction logging enqueue returns before slow embedding work completes', async () => {
  await withStore(async storePath => {
    let releaseEmbedding;
    const slowEmbedder = () => new Promise(resolve => { releaseEmbedding = resolve; });
    const start = Date.now();
    enqueueInteraction({ question: 'General question', answer: 'Answer', confidence: 0.8 }, {
      storePath,
      embedder: slowEmbedder
    });

    assert.ok(Date.now() - start < 50);
    while (!releaseEmbedding) await new Promise(resolve => setImmediate(resolve));
    releaseEmbedding([1, 0]);
    await waitForLearningQueue();
    assert.equal(JSON.parse(fs.readFileSync(storePath, 'utf8')).interactions.length, 1);
  });
});
