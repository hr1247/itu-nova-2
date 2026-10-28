import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSourceTrust,
  createSourceProvenance,
  extractDomain,
  TRUST_LEVELS,
  SOURCE_TYPES
} from '../src/services/sourceTrustService.js';

test('extractDomain correctly normalizes hostnames', () => {
  assert.equal(extractDomain('https://itu.edu.pk/admissions'), 'itu.edu.pk');
  assert.equal(extractDomain('https://www.itu.edu.pk/index.php'), 'itu.edu.pk');
  assert.equal(extractDomain('portal.itu.edu.pk/student'), 'portal.itu.edu.pk');
  assert.equal(extractDomain('https://admissions.itu.edu.pk/apply?id=123'), 'admissions.itu.edu.pk');
});

test('evaluateSourceTrust prioritizes official ITU domains', () => {
  const main = evaluateSourceTrust('https://itu.edu.pk');
  assert.equal(main.trustLevel, TRUST_LEVELS.AUTHORITATIVE_ITU);
  assert.equal(main.isItuAuthoritative, true);
  assert.equal(main.sourceType, SOURCE_TYPES.OFFICIAL_ITU);

  const portal = evaluateSourceTrust('https://portal.itu.edu.pk');
  assert.equal(portal.trustLevel, TRUST_LEVELS.AUTHORITATIVE_ITU);
  assert.equal(portal.isItuAuthoritative, true);
});

test('evaluateSourceTrust identifies official government and accreditation authorities', () => {
  const hec = evaluateSourceTrust('https://www.hec.gov.pk/english/scholarships');
  assert.equal(hec.trustLevel, TRUST_LEVELS.OFFICIAL_GOVERNMENT);
  assert.equal(hec.sourceType, SOURCE_TYPES.OFFICIAL_GOV);

  const nceac = evaluateSourceTrust('https://nceac.org.pk');
  assert.equal(nceac.trustLevel, TRUST_LEVELS.OFFICIAL_GOVERNMENT);
});

test('evaluateSourceTrust classifies Reddit, Quora, and social blogs as untrusted', () => {
  const reddit = evaluateSourceTrust('https://www.reddit.com/r/pakistan/itu_fees');
  assert.equal(reddit.trustLevel, TRUST_LEVELS.UNTRUSTED);
  assert.equal(reddit.isItuAuthoritative, false);

  const blog = evaluateSourceTrust('https://randomstudent.blogspot.com/itu-review');
  assert.equal(blog.trustLevel, TRUST_LEVELS.UNTRUSTED);

  const twitter = evaluateSourceTrust('https://x.com/random_user/status/123');
  assert.equal(twitter.trustLevel, TRUST_LEVELS.UNTRUSTED);
});

test('createSourceProvenance attaches full audit metadata and content hash', () => {
  const prov = createSourceProvenance({
    url: 'https://admissions.itu.edu.pk/fee-structure',
    title: 'ITU Official Fee Structure 2025',
    snippet: 'BSCS Tuition per credit hour is 6,000 PKR'
  });

  assert.equal(prov.domain, 'admissions.itu.edu.pk');
  assert.equal(prov.isItuAuthoritative, true);
  assert.equal(prov.trustLevel, 1.0);
  assert.ok(prov.contentHash);
  assert.ok(prov.retrievedAt);
});

