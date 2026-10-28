import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRequireLiveWeb, testOpenAIConnection } from '../src/services/openaiService.js';

test('shouldRequireLiveWeb detects queries that need real-time information', () => {
  // Questions containing real-time keywords
  assert.equal(shouldRequireLiveWeb("What's today's weather in Lahore?"), true);
  assert.equal(shouldRequireLiveWeb('What is the current gold rate in Pakistan?'), true);
  assert.equal(shouldRequireLiveWeb('What is the latest tomato price today?'), true);
  assert.equal(shouldRequireLiveWeb('Are there any recent university announcements?'), true);
  assert.equal(shouldRequireLiveWeb('What is the latest fee schedule for 2025?'), true);
  assert.equal(shouldRequireLiveWeb('What is happening this week at ITU?'), true);
  assert.equal(shouldRequireLiveWeb('What is currently the dollar exchange rate?'), true);

  // Static / timeless questions should NOT trigger live web search
  assert.equal(shouldRequireLiveWeb('Explain binary search algorithm in Python.'), false);
  assert.equal(shouldRequireLiveWeb('What is object-oriented programming?'), false);
  assert.equal(shouldRequireLiveWeb('Write a poem about computers.'), false);
  assert.equal(shouldRequireLiveWeb('What is the capital of France?'), false);
});

test('testOpenAIConnection returns structured safe diagnostic data without leaking keys', async () => {
  const diag = await testOpenAIConnection();

  assert.ok(typeof diag === 'object');
  assert.ok('connected' in diag);
  assert.ok('configured' in diag);
  assert.ok('model' in diag);
  assert.ok('webSearchAvailable' in diag);
  assert.ok('status' in diag);

  // Critical security check: Ensure API keys are never leaked in diagnostic output
  const jsonStr = JSON.stringify(diag);
  assert.equal(jsonStr.includes('sk-'), false);
  assert.equal(jsonStr.includes('gsk_'), false);
});

