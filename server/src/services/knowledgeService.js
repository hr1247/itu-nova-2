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

/**
 * Simple context builder for RAG generation
 */
function summarizeAcademicPrograms(programs) {
  if (!Array.isArray(programs)) return programs;

  return programs.map(program => ({
    name: program.name,
    code: program.code,
    degreeDurationYears: program.degreeDurationYears,
    semesters: program.semesters,
    totalCreditHours: program.totalCreditHours,
    overview: program.overview,
    keywords: program.keywords,
    feeStructure: program.feeStructure ? {
      perCreditHour: program.feeStructure.perCreditHour,
      admissionFee: program.feeStructure.admissionFee,
      securityDeposit: program.feeStructure.securityDeposit,
      estimatedSemesterTuition: program.feeStructure.estimatedSemesterTuition
    } : undefined,
    meritFormula: program.meritFormula ? {
      formula: program.meritFormula.formula,
      weights: program.meritFormula.weights,
      previousClosingMerit: program.meritFormula.previousClosingMerit
    } : undefined,
    eligibility: program.eligibility ? {
      minimumIntermediate: program.eligibility.minimumIntermediate,
      requirements: program.eligibility.requirements,
      preferredBackground: program.eligibility.preferredBackground
    } : undefined
  }));
}

function summarizeCampusInfo(campus) {
  if (!campus) return campus;

  return {
    researchLabs: Array.isArray(campus.researchLabs)
      ? campus.researchLabs.map(item => ({ name: item.name, focus: item.focus }))
      : campus.researchLabs,
    studentSocieties: campus.studentSocieties,
    library: campus.library,
    incubationAndIndustry: campus.incubationAndIndustry
  };
}

function deriveRelevantSections(kb, userQuery) {
  const q = (userQuery || '').toLowerCase();
  const selected = {};

  if (!kb) {
    return selected;
  }

  if (/program|degree|course|curriculum|bscs|bsai|computer science|artificial intelligence|undergraduate|major/i.test(q)) {
    selected.academicPrograms = summarizeAcademicPrograms(kb.academicPrograms?.undergraduate);
  }

  if (/fee|tuition|credit hour|cost|scholarship|financial aid|semester|admission fee|security deposit/i.test(q)) {
    selected.academicPrograms = summarizeAcademicPrograms(kb.academicPrograms?.undergraduate);
  }

  if (/merit|eligibility|aggregate|entry test|nat|usat|intermediate|a-level|matric|requirements/i.test(q)) {
    selected.academicPrograms = summarizeAcademicPrograms(kb.academicPrograms?.undergraduate);
  }

  if (/campus|facility|facilities|lab|library|society|sports|student life|research|plan9|incubation|industry/i.test(q)) {
    selected.campusLifeAndFacilities = summarizeCampusInfo(kb.campusLifeAndFacilities);
  }

  if (/transport|route|bus|metro|shuttle|pickup|travel|journey/i.test(q)) {
    selected.transportation = kb.transportation;
  }

  if (/admission|apply|deadline|date|open|intake|merit list|orientation|classes|spring|fall/i.test(q)) {
    selected.admissionsCycle = kb.admissionsCycle;
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
    context: compactContext.length > 7000 ? `${compactContext.slice(0, 7000)}...` : compactContext,
    sources: ['ITU Knowledge Base']
  };
}