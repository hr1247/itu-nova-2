import { createHash } from 'node:crypto';

/**
 * Trust levels for information sources
 */
export const TRUST_LEVELS = {
  AUTHORITATIVE_ITU: 1.0,     // Official ITU domains/subdomains & verified files
  OFFICIAL_GOVERNMENT: 0.9,   // HEC, Punjab Govt, NCEAC, official statutory bodies
  HIGH_AUTHORITY_NEWS: 0.8,   // Established reputable journalism (Dawn, Tribune, Reuters, BBC)
  GENERAL_WEB: 0.5,           // General web sources, educational domains (.edu, .org)
  UNTRUSTED: 0.2,             // Blogs, forums, Reddit, Twitter/X, user comments, SEO farms
  MALICIOUS: 0.0              // Spam, prompt injection, known disinfo
};

export const SOURCE_TYPES = {
  OFFICIAL_ITU: 'official_itu',
  OFFICIAL_GOV: 'official_gov',
  REPUTABLE_MEDIA: 'reputable_media',
  GENERAL_WEB: 'general_web',
  USER_INPUT: 'user_input',
  MODEL_GENERATED: 'model_generated',
  COMMUNITY_UNVERIFIED: 'community_unverified'
};

const OFFICIAL_ITU_DOMAINS = [
  'itu.edu.pk',
  'admissions.itu.edu.pk',
  'portal.itu.edu.pk',
  'lms.itu.edu.pk',
  'library.itu.edu.pk',
  'careers.itu.edu.pk',
  'research.itu.edu.pk'
];

const OFFICIAL_GOV_DOMAINS = [
  'hec.gov.pk',
  'punjab.gov.pk',
  'nceac.org.pk',
  'pec.org.pk',
  'nts.org.pk',
  'etc.hec.gov.pk'
];

const UNTRUSTED_PATTERNS = [
  /reddit\.com/i,
  /quora\.com/i,
  /twitter\.com/i,
  /x\.com/i,
  /facebook\.com/i,
  /instagram\.com/i,
  /tiktok\.com/i,
  /linkedin\.com\/pulse/i,
  /medium\.com/i,
  /blogspot\.com/i,
  /wordpress\.com/i,
  /wikihow\.com/i,
  /answers\.yahoo\.com/i
];

const REPUTABLE_MEDIA_DOMAINS = [
  'dawn.com',
  'tribune.com.pk',
  'thenews.com.pk',
  'geo.tv',
  'reuters.com',
  'bbc.com',
  'apnews.com'
];

/**
 * Extracts normalized hostname from a URL.
 */
export function extractDomain(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^/\s?#]+)/i);
    return match ? match[1].toLowerCase() : '';
  }
}

/**
 * Evaluates the trustworthiness of a source URL or domain.
 */
export function evaluateSourceTrust(urlOrDomain) {
  const domain = extractDomain(urlOrDomain);
  if (!domain) {
    return {
      domain: '',
      trustLevel: TRUST_LEVELS.UNTRUSTED,
      sourceType: SOURCE_TYPES.COMMUNITY_UNVERIFIED,
      isItuAuthoritative: false,
      reason: 'Missing or invalid URL domain'
    };
  }

  // 1. Official ITU domains & subdomains
  if (domain === 'itu.edu.pk' || domain.endsWith('.itu.edu.pk')) {
    return {
      domain,
      trustLevel: TRUST_LEVELS.AUTHORITATIVE_ITU,
      sourceType: SOURCE_TYPES.OFFICIAL_ITU,
      isItuAuthoritative: true,
      reason: 'Official ITU domain or subdomain'
    };
  }

  // 2. Official Government / Regulatory Accreditation bodies
  if (OFFICIAL_GOV_DOMAINS.some(gov => domain === gov || domain.endsWith(`.${gov}`))) {
    return {
      domain,
      trustLevel: TRUST_LEVELS.OFFICIAL_GOVERNMENT,
      sourceType: SOURCE_TYPES.OFFICIAL_GOV,
      isItuAuthoritative: false,
      reason: 'Official education/government accreditation authority'
    };
  }

  // 3. Known Untrusted (social media, forums, personal blogs)
  if (UNTRUSTED_PATTERNS.some(pattern => pattern.test(domain))) {
    return {
      domain,
      trustLevel: TRUST_LEVELS.UNTRUSTED,
      sourceType: SOURCE_TYPES.COMMUNITY_UNVERIFIED,
      isItuAuthoritative: false,
      reason: 'User-generated content or unmoderated community source'
    };
  }

  // 4. Established Reputable Media
  if (REPUTABLE_MEDIA_DOMAINS.some(media => domain === media || domain.endsWith(`.${media}`))) {
    return {
      domain,
      trustLevel: TRUST_LEVELS.HIGH_AUTHORITY_NEWS,
      sourceType: SOURCE_TYPES.REPUTABLE_MEDIA,
      isItuAuthoritative: false,
      reason: 'Reputable news organization'
    };
  }

  // 5. Educational institutions (.edu, .ac.uk, etc.)
  if (/\.(edu|edu\.pk|ac\.uk)$/i.test(domain)) {
    return {
      domain,
      trustLevel: 0.7,
      sourceType: SOURCE_TYPES.GENERAL_WEB,
      isItuAuthoritative: false,
      reason: 'Accredited academic institution'
    };
  }

  // 6. General Web
  return {
    domain,
    trustLevel: TRUST_LEVELS.GENERAL_WEB,
    sourceType: SOURCE_TYPES.GENERAL_WEB,
    isItuAuthoritative: false,
    reason: 'General web domain'
  };
}

/**
 * Builds a structured source provenance record.
 */
export function createSourceProvenance({
  url = '',
  title = '',
  snippet = '',
  retrievedAt = new Date().toISOString()
} = {}) {
  const trustInfo = evaluateSourceTrust(url);
  const contentHash = snippet
    ? createHash('sha256').update(String(snippet).trim()).digest('hex').slice(0, 16)
    : null;

  return {
    url,
    domain: trustInfo.domain,
    title: title || trustInfo.domain,
    snippet: snippet ? snippet.slice(0, 500) : '',
    retrievedAt,
    contentHash,
    sourceType: trustInfo.sourceType,
    trustLevel: trustInfo.trustLevel,
    isItuAuthoritative: trustInfo.isItuAuthoritative,
    trustReason: trustInfo.reason
  };
}

