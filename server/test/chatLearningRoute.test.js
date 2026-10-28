import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

test('feedback correction is returned by chat for the same question immediately', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'itu-learning-route-test-'));
  const storePath = path.join(directory, 'learning_feedback.json');
  process.env.ITU_LEARNING_STORE_PATH = storePath;
  process.env.ITU_SELF_LEARNING_PATH = path.join(directory, 'self_learning.json');

  let server;
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input, options) => {
      if (String(input).includes('/api/embeddings')) {
        return new Response(JSON.stringify({ embedding: [1, 0] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return originalFetch(input, options);
    };

    const { default: chatRoutes } = await import('../src/routes/chat.js');
    const app = express();
    app.use(express.json());
    app.use('/api', chatRoutes);
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}/api`;
    const feedbackResponse = await fetch(`${baseUrl}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'How much is BSCS tuition per credit hour?',
        answer: 'PKR 9,000',
        rating: 'not_helpful',
        correction: 'The corrected BSCS tuition is PKR 9,200 per credit hour.'
      })
    });

    assert.equal(feedbackResponse.status, 201);
    const feedbackResult = await feedbackResponse.json();
    assert.equal(feedbackResult.status, 'pending');
    assert.match(feedbackResult.message, /pending candidate/i);

    const { reviewLearningFeedback } = await import('../src/services/learningService.js');
    await reviewLearningFeedback(feedbackResult.id, 'approve', storePath);

    const chatResponse = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'How much does tuition cost for the Computer Science degree per unit?',
        mode: 'auto'
      })
    });
    const chatResult = await chatResponse.json();

    assert.equal(chatResponse.status, 200);
    assert.equal(chatResult.reply, 'The corrected BSCS tuition is PKR 9,200 per credit hour.');
    assert.deepEqual(chatResult.sources, ['Semantically learned correction']);
    assert.match(chatResult.reason, /semantically similar/i);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    globalThis.fetch = originalFetch;
    delete process.env.ITU_LEARNING_STORE_PATH;
    delete process.env.ITU_SELF_LEARNING_PATH;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});