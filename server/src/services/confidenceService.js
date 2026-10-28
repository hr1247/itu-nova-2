export function calculateResponseConfidence({
  mode,
  routingConfidence = 0,
  retrievalScore = 0,
  sources = [],
  hasGroundedContext = false,
  fallbackUsed = false,
  knowledgeAgeDays = null
}) {
  const routeSignal = mode === 'general'
    ? Math.max(0.65, clamp(routingConfidence))
    : clamp(routingConfidence);
  const retrievalSignal = mode === 'itu'
    ? clamp(retrievalScore || (hasGroundedContext ? 0.55 : 0.2))
    : hasGroundedContext ? 0.7 : 0.6;
  const sourceSignal = sources.includes('ITU Knowledge Base')
    ? 0.95
    : sources.some(source => /learned correction/i.test(source))
      ? 0.9
      : sources.length > 0 ? 0.65 : mode === 'general' ? 0.65 : 0.4;
  const freshnessSignal = knowledgeAgeDays == null
    ? 0.6
    : Math.exp(-Math.max(0, knowledgeAgeDays) / 365);

  let score = 0.4 * routeSignal
    + 0.3 * retrievalSignal
    + 0.2 * sourceSignal
    + 0.1 * freshnessSignal;
  if (fallbackUsed) score -= 0.15;
  if (!hasGroundedContext && mode === 'itu') score -= 0.1;

  score = clamp(score);
  return {
    score: Number(score.toFixed(3)),
    band: score >= 0.78 ? 'HIGH' : score >= 0.55 ? 'MEDIUM' : 'LOW',
    signals: {
      route: Number(routeSignal.toFixed(3)),
      retrieval: Number(retrievalSignal.toFixed(3)),
      sources: Number(sourceSignal.toFixed(3)),
      freshness: Number(freshnessSignal.toFixed(3)),
      fallbackUsed: Boolean(fallbackUsed)
    }
  };
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
