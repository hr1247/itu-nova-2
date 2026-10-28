import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getRelevantApprovedCorrection,
  migrateUnverifiedCorrections,
  listReviewableLearningFeedback,
  reviewLearningFeedback,
  submitLearningFeedback
} from '../src/services/learningService.js';

async function withTemporaryStore(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'itu-learning-test-'));
  const storePath = path.join(directory, 'learning_feedback.json');
  try {
    await run(storePath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('submitted corrections remain pending and only reviewer-approved corrections match paraphrases', async () => {
  await withTemporaryStore(async storePath => {
    const embedder = async text => {
      if (/what is the bscs fee/i.test(text)) return [1, 0];
      if (/computer science degree/i.test(text)) return [0.72, Math.sqrt(1 - 0.72 ** 2)];
      return [0, 1];
    };
    const entry = await submitLearningFeedback({
      question: 'What is the BSCS fee per credit hour at ITU?',
      answer: 'PKR 9000',
      rating: 'not_helpful',
      correction: 'The BSCS fee is PKR 9200 per credit hour.'
    }, storePath);

    assert.equal(entry.status, 'pending');
    assert.equal(entry.validationStatus, 'PENDING');
    assert.equal(listReviewableLearningFeedback(storePath).length, 1);
    assert.equal(
      await getRelevantApprovedCorrection('How much does the Computer Science degree cost per credit hour?', storePath, embedder),
      null
    );
    await reviewLearningFeedback(entry.id, 'approve', storePath, embedder);
    const persistedEntry = JSON.parse(fs.readFileSync(storePath, 'utf8'))[0];
    assert.equal(persistedEntry.approvalSource, 'human_review');
    assert.deepEqual(persistedEntry.questionEmbedding, [1, 0]);
    assert.deepEqual(
      await getRelevantApprovedCorrection('what is the bscs fee per credit hour at itu!!!', storePath, embedder),
      {
        question: 'What is the BSCS fee per credit hour at ITU?',
        correction: 'The BSCS fee is PKR 9200 per credit hour.',
        matchType: 'exact'
      }
    );
    const paraphrase = await getRelevantApprovedCorrection('How much does the Computer Science degree cost per credit hour?', storePath, embedder);
    assert.equal(paraphrase?.correction, 'The BSCS fee is PKR 9200 per credit hour.');
    assert.equal(paraphrase?.matchType, 'semantic');
    assert.ok(paraphrase.similarity >= 0.68);
    assert.equal(await getRelevantApprovedCorrection('Where is the campus located?', storePath, embedder), null);

    await reviewLearningFeedback(entry.id, 'reject', storePath, embedder);
    assert.equal(await getRelevantApprovedCorrection('What is the BSCS fee per credit hour at ITU?', storePath, embedder), null);
  });
});

test('ratings without corrections are recorded but never retrieved as facts', async () => {
  await withTemporaryStore(async storePath => {
    const entry = await submitLearningFeedback({
      question: 'What are ITU admission dates?',
      answer: 'June 1',
      rating: 'helpful'
    }, storePath);

    assert.equal(entry.status, 'feedback');
    assert.equal(await getRelevantApprovedCorrection('What are ITU admission dates?', storePath), null);
  });
});

test('ambiguous semantic matches do not apply a correction', async () => {
  await withTemporaryStore(async storePath => {
    const corrections = [
      ['What is the BSCS fee per credit hour?', 'BSCS fee is PKR 9,200.'],
      ['What is the BSAI fee per credit hour?', 'BSAI fee is PKR 9,500.']
    ];
    const embedder = async text => {
      if (text.startsWith('What is the BSCS')) return [1, 0];
      if (text.startsWith('What is the BSAI')) return [0.99, Math.sqrt(1 - 0.99 ** 2)];
      return [0.995, Math.sqrt(1 - 0.995 ** 2)];
    };

    for (const [question, correction] of corrections) {
      const entry = submitLearningFeedback({ question, answer: 'Incorrect', rating: 'not_helpful', correction }, storePath);
      await reviewLearningFeedback(entry.id, 'approve', storePath, embedder);
    }

    assert.equal(await getRelevantApprovedCorrection('What is the undergraduate fee per credit hour?', storePath, embedder), null);
  });
});

test('identity paraphrases do not match higher-scoring wellbeing corrections', async () => {
  await withTemporaryStore(async storePath => {
    const nameQuestion = 'what is your name?';
    const wellbeingQuestion = 'how are you?';
    const embedder = async text => {
      if (text === nameQuestion) return [1, 0, 0];
      if (text === wellbeingQuestion) return [0.71, Math.sqrt(1 - 0.71 ** 2), 0];
      if (text === 'who are you?') return [0.71, Math.sqrt(1 - 0.71 ** 2), 0];
      return [0, 0, 1];
    };

    const identityEntry = submitLearningFeedback({
      question: nameQuestion,
      answer: 'Sorry, I cannot answer that.',
      rating: 'not_helpful',
      correction: 'I am ITU Nova.'
    }, storePath);
    await reviewLearningFeedback(identityEntry.id, 'approve', storePath, embedder);
    const wellbeingEntry = submitLearningFeedback({
      question: wellbeingQuestion,
      answer: 'I do not have feelings.',
      rating: 'not_helpful',
      correction: 'I am good, thanks for asking.'
    }, storePath);
    await reviewLearningFeedback(wellbeingEntry.id, 'approve', storePath, embedder);

    const result = await getRelevantApprovedCorrection('who are you?', storePath, embedder);
    assert.equal(result?.correction, 'I am ITU Nova.');
    assert.equal(result?.question, nameQuestion);
  });
});

test('invalid feedback is rejected', async () => {
  await withTemporaryStore(async storePath => {
    assert.throws(() => submitLearningFeedback({
      question: 'Question',
      answer: 'Answer',
      rating: 'maybe'
    }, storePath), /Rating must be/);
  });
});

test('legacy auto-approved corrections are migrated to pending review', async () => {
  await withTemporaryStore(async storePath => {
    fs.writeFileSync(storePath, JSON.stringify([{
      id: 'legacy-correction',
      question: 'What is your name?',
      answer: 'Wrong answer',
      correction: 'I am ITU Nova.',
      rating: 'not_helpful',
      status: 'approved',
      approvalSource: 'automatic_semantic_match',
      createdAt: new Date().toISOString()
    }]));

    assert.equal(migrateUnverifiedCorrections(storePath), true);
    const migrated = JSON.parse(fs.readFileSync(storePath, 'utf8'))[0];
    assert.equal(migrated.status, 'pending');
    assert.equal(migrated.validationStatus, 'PENDING');
    assert.equal(await getRelevantApprovedCorrection('Who are you?', storePath, async () => [1, 0]), null);
  });
});