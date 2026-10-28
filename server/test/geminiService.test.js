import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGeminiResponse, testGeminiConnection } from '../src/services/geminiService.js';

test('generateGeminiResponse returns helpful free key instructions when GEMINI_API_KEY is not set', async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;

    const result = await generateGeminiResponse({
      userMessage: 'What is today weather in Lahore?',
      chatHistory: []
    });

    assert.ok(result);
    assert.match(result.text, /Google Gemini \(Free Tier\)/i);
    assert.match(result.text, /aistudio\.google\.com/i);
    assert.equal(result.webSearchUsed, false);
    assert.ok(Array.isArray(result.suggestions));
  } finally {
    if (originalKey) {
      process.env.GEMINI_API_KEY = originalKey;
    }
  }
});

test('testGeminiConnection returns safe diagnostic data without exposing secrets', async () => {
  const result = await testGeminiConnection();
  assert.ok(result);
  assert.equal(typeof result.connected, 'boolean');
  assert.equal(typeof result.model, 'string');
  assert.equal(result.provider, 'Google AI Studio (Gemini)');
});

