import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateResponseConfidence } from '../src/services/confidenceService.js';

test('grounded high-similarity answer receives higher confidence than a fallback', () => {
  const grounded = calculateResponseConfidence({
    mode: 'itu',
    routingConfidence: 0.9,
    retrievalScore: 0.9,
    sources: ['ITU Knowledge Base'],
    hasGroundedContext: true,
    knowledgeAgeDays: 1
  });
  const fallback = calculateResponseConfidence({
    mode: 'itu',
    routingConfidence: 0.4,
    retrievalScore: 0.2,
    sources: [],
    hasGroundedContext: false,
    fallbackUsed: true,
    knowledgeAgeDays: 400
  });

  assert.equal(grounded.band, 'HIGH');
  assert.ok(grounded.score > fallback.score);
  assert.equal(fallback.band, 'LOW');
});

test('successful general generation gets a moderate score without RAG evidence', () => {
  const result = calculateResponseConfidence({
    mode: 'general',
    routingConfidence: 0.5,
    sources: [],
    hasGroundedContext: false
  });

  assert.equal(result.band, 'MEDIUM');
  assert.ok(result.score >= 0.55);
});
