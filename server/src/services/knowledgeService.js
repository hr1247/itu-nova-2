import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '../../../');
const candidateKnowledgePaths = [
  path.resolve(projectRoot, 'src/data/itu_knowledge.json'),
  path.resolve(projectRoot, 'server/src/data/itu_knowledge.json'),
  path.resolve(projectRoot, 'client/src/data/itu_knowledge.json')
];
const knowledgePath = candidateKnowledgePaths.find(filePath => fs.existsSync(filePath)) || candidateKnowledgePaths[0];

let cachedKnowledge = null;

/**
 * Reads and returns the ITU knowledge base JSON data.
 */
export function loadKnowledge() {
  if (cachedKnowledge) {
    return cachedKnowledge;
  }
  try {
    const rawData = fs.readFileSync(knowledgePath, 'utf8');
    cachedKnowledge = JSON.parse(rawData);
    return cachedKnowledge;
  } catch (err) {
    console.error('Error loading ITU Knowledge Base:', err.message);
    return null;
  }
}

export function getKnowledgeAgeDays(now = Date.now()) {
  try {
    const modifiedAt = fs.statSync(knowledgePath).mtimeMs;
    return Math.max(0, (now - modifiedAt) / (24 * 60 * 60 * 1000));
  } catch {
    return null;
  }
}

/**
 * Simple context builder for RAG generation
 */
function summarizeAcademicPrograms(programs, userQuery = '') {
  if (!Array.isArray(programs)) return programs;

  const normalizedQuery = userQuery.toLowerCase();
  const matchedPrograms = programs.filter(program =>
    normalizedQuery.includes(program.code?.toLowerCase() || '')
  );
  const requestedPrograms = matchedPrograms.length > 0 ? matchedPrograms : programs;
  const includeCurriculum = /curriculum|course outline|courses|semester courses/i.test(normalizedQuery);

  return requestedPrograms.map(program => ({
    name: program.name,
    code: program.code,
    degreeDurationYears: program.degreeDurationYears,
    semesters: program.semesters,
    totalCreditHours: program.totalCreditHours,
    overview: program.overview,
    keywords: program.keywords,
    feeStructure: program.feeStructure ? {
      currency: program.feeStructure.currency,
      feePerCreditHour: program.feeStructure.feePerCreditHour,
      admissionFeeOneTime: program.feeStructure.admissionFeeOneTime,
      securityDepositRefundable: program.feeStructure.securityDepositRefundable,
      registrationFeePerSemester: program.feeStructure.registrationFeePerSemester,
      typicalSemesterCreditHours: program.feeStructure.typicalSemesterCreditHours,
      estimatedTuitionPerSemester: program.feeStructure.estimatedTuitionPerSemester,
      estimatedFirstSemesterTotal: program.feeStructure.estimatedFirstSemesterTotal,
      subsequentSemesterAverage: program.feeStructure.subsequentSemesterAverage,
      totalDegreeCostEstimate: program.feeStructure.totalDegreeCostEstimate,
      scholarshipsAvailable: program.feeStructure.scholarshipsAvailable
    } : undefined,
    meritFormula: program.meritFormula ? {
      breakdown: program.meritFormula.breakdown,
      formulaText: program.meritFormula.formulaText,
      example: program.meritFormula.example,
      previousClosingMerits: program.meritFormula.previousClosingMerits
    } : undefined,
    eligibility: program.eligibility ? {
      academicQualifications: program.eligibility.academicQualifications,
      minimumPercentage: program.eligibility.minimumPercentage,
      testRequirements: program.eligibility.testRequirements
    } : undefined,
    ...(includeCurriculum ? { curriculumOutline: program.curriculumOutline } : {})
  }));
}

export function isCampusLocationQuery(query) {
  const normalizedQuery = String(query || '').toLowerCase();
  const asksWhere = /\bwhere\s+(?:is|are)\b/i.test(normalizedQuery);
  const asksForCampusAddress = /\b(?:main|new|permanent)?\s*campus\s+(?:location|address)\b|\b(?:location|address)\s+of\b.*\b(?:campus|itu|university|astp|arfa)\b|\bdirections?\s+to\b.*\b(?:campus|itu|university|astp|arfa)\b|\bhow\s+(?:do|can)\s+i\s+get\s+to\b.*\b(?:campus|itu|university|astp|arfa)\b/i.test(normalizedQuery);
  const asksForLibraryLocation = /\blibrary\b/i.test(normalizedQuery)
    && (asksWhere || /\blibrary\s+(?:location|address)\b/i.test(normalizedQuery));
  const asksWhereForCampus = asksWhere
    && /\b(?:campus|itu|university|lahore|astp|arfa)\b/i.test(normalizedQuery)
    && !asksForLibraryLocation;

  return asksForCampusAddress || asksWhereForCampus;
}

function summarizeCampusInfo(campus, userQuery = '') {
  if (!campus) return campus;

  const query = userQuery.toLowerCase();
  const requested = {};
  const asksForLabs = /\blabs?\b|\bresearch\b/i.test(query);
  const asksForSocieties = /societ|club|sports/i.test(query);
  const asksForLibrary = /library|book|resource/i.test(query);
  const asksForIndustry = /plan\s*9|incubat|industry|innovation/i.test(query);
  const broadFacilitiesRequest = /facilit|campus life|student life|campus overview/i.test(query);
  const includeAll = broadFacilitiesRequest
    && !asksForLabs
    && !asksForSocieties
    && !asksForLibrary
    && !asksForIndustry;

  if (asksForLabs || includeAll) {
    requested.researchLabs = Array.isArray(campus.researchLabs)
      ? campus.researchLabs.map(item => ({ name: item.name, focus: item.focus }))
      : campus.researchLabs;
  }
  if (asksForSocieties || includeAll) requested.studentSocieties = campus.studentSocieties;
  if (asksForLibrary || includeAll) requested.library = campus.library;
  if (asksForIndustry || includeAll) requested.incubationAndIndustry = campus.incubationAndIndustry;

  return Object.keys(requested).length > 0
    ? requested
    : {
        researchLabs: Array.isArray(campus.researchLabs)
          ? campus.researchLabs.map(item => ({ name: item.name, focus: item.focus }))
          : campus.researchLabs,
        studentSocieties: campus.studentSocieties,
        library: campus.library,
        incubationAndIndustry: campus.incubationAndIndustry
      };
}

function summarizeCampusLocations(university) {
  return (university?.campuses || []).map(campus => ({
    name: campus.name,
    location: campus.location,
    status: campus.status,
    description: campus.description
  }));
}

function summarizeAdmissionsCycle(admissionsCycle, query) {
  if (!admissionsCycle) return admissionsCycle;

  const yearMatch = query.match(/\b(20\d{2})\b/);
  const requestedYear = yearMatch?.[1];
  const historicalYear = requestedYear
    ? admissionsCycle.history?.[`year${requestedYear}`]
    : null;

  if (historicalYear) {
    return {
      requestedYear,
      history: historicalYear
    };
  }

  return {
    academicYear: admissionsCycle.academicYear,
    schedules: admissionsCycle.schedules
  };
}

function deriveRelevantSections(kb, userQuery) {
  const q = (userQuery || '').toLowerCase();
  const selected = {};

  if (!kb) {
    return selected;
  }

  if (isCampusLocationQuery(q)) {
    selected.campuses = summarizeCampusLocations(kb.university);
    return selected;
  }

  if (/program|degree|course|curriculum|bscs|bsai|computer science|artificial intelligence|undergraduate|major/i.test(q)) {
    selected.academicPrograms = summarizeAcademicPrograms(kb.academicPrograms?.undergraduate, q);
  }

  if (/fee|tuition|credit hour|cost|scholarship|financial aid|semester|admission fee|security deposit/i.test(q)) {
    selected.academicPrograms = summarizeAcademicPrograms(kb.academicPrograms?.undergraduate, q);
  }

  if (/merit|eligibility|aggregate|entry test|nat|usat|intermediate|a-level|matric|requirements/i.test(q)) {
    selected.academicPrograms = summarizeAcademicPrograms(kb.academicPrograms?.undergraduate, q);
  }

  if (/\bfacilities?\b|\blabs?\b|\blibrary\b|\bsociet(?:y|ies)\b|\bsports\b|student life|\bresearch\b|plan\s*9|\bincubation\b|\bindustry\b/i.test(q)) {
    selected.campusLifeAndFacilities = summarizeCampusInfo(kb.campusLifeAndFacilities, q);
  }

  if (/transport|route|bus|metro|shuttle|pickup|travel|journey/i.test(q)) {
    selected.transportation = kb.transportation;
  }

  if (/admission|apply|deadline|date|open|intake|merit list|orientation|classes|spring|fall/i.test(q)) {
    selected.admissionsCycle = summarizeAdmissionsCycle(kb.admissionsCycle, q);
  }

  if (Object.keys(selected).length === 0) {
    selected.university = {
      name: kb.university?.name,
      acronym: kb.university?.acronym,
      city: kb.university?.city,
      website: kb.university?.contact?.website
    };
    selected.campusLifeAndFacilities = summarizeCampusInfo(kb.campusLifeAndFacilities);
  }

  return selected;
}

export function getRelevantITUContext(userQuery) {
  const kb = loadKnowledge();
  if (!kb) {
    return {
      context: 'No knowledge base loaded.',
      sources: []
    };
  }

  const relevantSections = deriveRelevantSections(kb, userQuery);
  const compactContext = JSON.stringify(relevantSections, null, 2);

  return {
    context: compactContext,
    sources: ['ITU Knowledge Base']
  };
}