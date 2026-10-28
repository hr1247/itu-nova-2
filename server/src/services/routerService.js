import cosineSimilarity from 'compute-cosine-similarity';
import { loadKnowledge } from './knowledgeService.js';
import {
  findLearnedMemoryMatch,
  warmLearnedMemoryIndex,
  recordLearnedEmbedding
} from './learnedMemoryService.js';

let knowledgeEmbeddings = [];

/**
 * Fetch vector embedding from local Ollama
 */
export async function fetchEmbedding(text) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'nomic-embed-text',
        prompt: text
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      throw new Error(
        `Embedding request failed with status ${res.status}${errorBody ? `: ${errorBody}` : ''}`
      );
    }

    const data = await res.json();

    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw new Error('Ollama returned an invalid embedding');
    }

    return data.embedding;
  } catch (err) {
    const message = err?.name === 'AbortError'
      ? 'Ollama embedding request timed out after 15s.'
      : err.message;

    console.warn('Ollama embedding request failed:', message);

    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Safely convert an object into text for embedding.
 */
function stringify(value) {
  if (!value) {
    return '';
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Initializes ITU knowledge base vectors.
 *
 * Each important knowledge area gets its own embedding.
 * This gives much better semantic routing than embedding
 * the entire academicPrograms object repeatedly.
 */
export async function initializeVectorStore() {
  console.log('Indexing ITU Knowledge Base via local Ollama...');

  try {
    const kb = loadKnowledge();

    if (!kb) {
      console.warn('Could not load ITU knowledge JSON.');
      return;
    }

    knowledgeEmbeddings = [];

    const sectionsToEmbed = [];

    /*
     * UNIVERSITY INFORMATION
     */
    if (kb.university) {
      sectionsToEmbed.push({
        category: 'university',
        text: `
Information Technology University ITU Lahore.
University information, name, acronym, location, city, province,
country, establishment, charter, recognition, HEC, NCEAC,
campuses, main campus, ASTP, Barki campus, contact information,
admissions email, general email, website.

${stringify(kb.university)}
        `
      });
    }

    /*
     * CURRENT ADMISSION SCHEDULE
     */
    if (kb.admissionsCycle) {
      sectionsToEmbed.push({
        category: 'admissions',
        text: `
ITU admissions.
Information Technology University Lahore admission schedule,
admission cycle, academic year, Fall admissions, Spring admissions,
application opening dates, application deadlines, admission tests,
merit lists, orientation, classes commencement.

${stringify({
  academicYear: kb.admissionsCycle.academicYear,
  schedules: kb.admissionsCycle.schedules
})}
        `
      });
    }

    /*
     * HISTORICAL ADMISSION DATES
     *
     * This is especially important for questions such as:
     * "What were ITU admission dates in 2024?"
     */
    if (kb.admissionsCycle?.history) {
      sectionsToEmbed.push({
        category: 'admission_history',
        text: `
ITU historical admission dates.
Past ITU admission dates, previous admission cycles,
Fall admission history, Spring admission history,
application start dates, application deadlines,
entry test dates, merit list dates and class starting dates.

Historical years include:
2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018,
2017 and 2016.

${stringify(kb.admissionsCycle.history)}
        `
      });
    }

    /*
     * ENTRY TEST
     */
    if (kb.admissionsCycle?.entryTestDetails) {
      sectionsToEmbed.push({
        category: 'entry_test',
        text: `
ITU admission entry test.
ITU entrance examination, test format, duration,
mathematics, quantitative reasoning, analytical reasoning,
logical reasoning, English comprehension,
NTS NAT, USAT, SAT, ACT and alternative admission tests.

${stringify(kb.admissionsCycle.entryTestDetails)}
        `
      });
    }

    /*
     * UNDERGRADUATE PROGRAMS
     */
    if (kb.academicPrograms?.undergraduate) {
      for (const program of kb.academicPrograms.undergraduate) {
        sectionsToEmbed.push({
          category: `program_${program.code?.toLowerCase() || 'unknown'}`,
          text: `
ITU undergraduate degree program.

Program name: ${program.name || ''}
Program code: ${program.code || ''}
Keywords: ${stringify(program.keywords)}
Degree duration: ${program.degreeDurationYears || ''}
Semesters: ${program.semesters || ''}
Credit hours: ${program.totalCreditHours || ''}
Accreditation: ${program.accreditation || ''}
Overview: ${program.overview || ''}

${stringify({
  name: program.name,
  code: program.code,
  degreeDurationYears: program.degreeDurationYears,
  semesters: program.semesters,
  totalCreditHours: program.totalCreditHours,
  accreditation: program.accreditation,
  overview: program.overview,
  keywords: program.keywords
})}
          `
        });
      }
    }

    /*
     * FEES
     */
    if (kb.academicPrograms?.undergraduate) {
      for (const program of kb.academicPrograms.undergraduate) {
        if (!program.feeStructure) {
          continue;
        }

        sectionsToEmbed.push({
          category: `fees_${program.code?.toLowerCase() || 'unknown'}`,
          text: `
ITU university fees and tuition.

Program: ${program.name || ''}
Code: ${program.code || ''}

Fee per credit hour.
Admission fee.
Security deposit.
Registration fee.
Semester tuition.
First semester cost.
Subsequent semester cost.
Total degree cost.
Scholarships.
Financial aid.

${stringify(program.feeStructure)}
          `
        });
      }
    }

    /*
     * MERIT
     */
    if (kb.academicPrograms?.undergraduate) {
      for (const program of kb.academicPrograms.undergraduate) {
        if (!program.meritFormula) {
          continue;
        }

        sectionsToEmbed.push({
          category: `merit_${program.code?.toLowerCase() || 'unknown'}`,
          text: `
ITU admission merit calculation.

Program: ${program.name || ''}
Code: ${program.code || ''}

Merit formula.
Matric percentage.
O-Level percentage.
Intermediate percentage.
A-Level percentage.
ITU entry test.
NTS NAT.
Test weightage.
Aggregate merit.
Previous closing merit.

${stringify(program.meritFormula)}
          `
        });
      }
    }

    /*
     * ELIGIBILITY
     */
    if (kb.academicPrograms?.undergraduate) {
      for (const program of kb.academicPrograms.undergraduate) {
        if (!program.eligibility) {
          continue;
        }

        sectionsToEmbed.push({
          category: `eligibility_${program.code?.toLowerCase() || 'unknown'}`,
          text: `
ITU admission eligibility requirements.

Program: ${program.name || ''}
Code: ${program.code || ''}

Intermediate.
HSSC.
Pre-Engineering.
ICS.
Pre-Medical.
A-Levels.
Mathematics requirements.
Minimum percentage.
Admission test requirements.

${stringify(program.eligibility)}
          `
        });
      }
    }

    /*
     * ACADEMIC POLICIES
     */
    if (kb.academicPolicies) {
      sectionsToEmbed.push({
        category: 'academic_policies',
        text: `
ITU academic policies.
Grading system.
CGPA.
Minimum passing grade.
Attendance requirements.
Academic probation.
Add/drop deadline.
Course withdrawal.
Semester policies.

${stringify(kb.academicPolicies)}
        `
      });
    }

    /*
     * TRANSPORT
     */
    if (kb.transportation) {
      sectionsToEmbed.push({
        category: 'transport',
        text: `
ITU student transportation.
ITU buses.
Bus routes.
Transport fee.
Semester transport fee.
Bus stops.
Morning departure times.
Evening departure times.
Lahore transport.
Thokar Niaz Baig.
Canal.
Shahdara.
Mall Road.
DHA.
Cantt.
Wapda Town.
Johar Town.
Township.
Arfa Software Technology Park.
Metro Bus.

${stringify(kb.transportation)}
        `
      });
    }

    /*
     * ADMISSION GUIDELINES
     */
    if (kb.admissionGuidelines) {
      sectionsToEmbed.push({
        category: 'admission_guidelines',
        text: `
How to apply to ITU.
ITU admission application process.
Online admission portal.
Academic records.
Application fee.
Challan.
Bank of Punjab.
1Link.
Admission test selection.
Admit card.
Merit list.
Required documents.
CNIC.
B-Form.
Photographs.

${stringify(kb.admissionGuidelines)}
        `
      });
    }

    /*
     * CAMPUS LIFE AND FACILITIES
     *
     * IMPORTANT:
     * The JSON property is campusLifeAndFacilities,
     * not campusInfo.
     */
    if (kb.campusLifeAndFacilities) {
      sectionsToEmbed.push({
        category: 'campus',
        text: `
ITU campus life and facilities.
Campus facilities.
Research labs.
Artificial Intelligence lab.
Machine Learning lab.
Computer Vision lab.
Cyber Security.
CSaLT.
Student societies.
ACM.
Robotics.
Debating.
Sports.
Music and Arts.
Library.
Books.
IEEE.
ACM Digital Library.
Research.
Incubation.
Plan9.
Industry internships.
ASTP.

${stringify(kb.campusLifeAndFacilities)}
        `
      });
    }

    /*
     * FAQ
     */
    if (Array.isArray(kb.frequentlyAskedQuestions)) {
      sectionsToEmbed.push({
        category: 'faq',
        text: `
Frequently asked questions about Information Technology University Lahore.

ITU fees.
Admission dates.
Merit formula.
Transport.
Pre-medical eligibility.
HEC recognition.
NCEAC accreditation.
Hostel.
Attendance.
CGPA.

${stringify(kb.frequentlyAskedQuestions)}
        `
      });
    }

    /*
     * CREATE EMBEDDINGS
     */
    console.log(
      `Preparing ${sectionsToEmbed.length} ITU knowledge sections...`
    );

    for (const item of sectionsToEmbed) {
      const embedding = await fetchEmbedding(item.text);

      if (embedding) {
        knowledgeEmbeddings.push({
          category: item.category,
          content: item.text,
          embedding
        });

        console.log(`Indexed: ${item.category}`);
      } else {
        console.warn(`Could not create embedding for: ${item.category}`);
      }
    }

    console.log(
      `ITU Vector Store Ready: ${knowledgeEmbeddings.length}/${sectionsToEmbed.length} sections indexed.`
    );

    // Warm and load cached embeddings for learned memory queries
    await warmLearnedMemoryIndex(fetchEmbedding).catch(err => {
      console.warn('[VectorStore] Memory index warming notice:', err.message);
    });
  } catch (error) {
    console.error(
      'Vector Store Initialization Error:',
      error.message
    );
  }
}

/**
 * Semantic Router
 *
 * Determines whether a question should use ITU knowledge
 * or general AI.
 */
export async function classifyQuery(message, explicitMode = 'auto') {
  if (!message || !message.trim()) {
    return {
      mode: 'general',
      confidence: 0,
      reason: 'Empty query.'
    };
  }

  const normalized = message.toLowerCase().trim();

  if (/^(hi|hello|hey|salam|assalamualaikum|aoa|good morning|good evening|good afternoon|greetings)\b/i.test(normalized)) {
    return {
      mode: 'itu',
      confidence: 0.90,
      category: 'greeting',
      reason: 'Greeting handled locally without requiring embedding lookup.'
    };
  }

  /*
   * MANUAL MODE
   */
  if (explicitMode === 'itu') {
    return {
      mode: 'itu',
      confidence: 1.0,
      reason: 'Forced to ITU Mode by user.'
    };
  }

  if (explicitMode === 'general') {
    return {
      mode: 'general',
      confidence: 1.0,
      reason: 'Forced to General Mode by user.'
    };
  }

  const transportIntent = /\b(transport|bus|buses|shuttle|metro|pickup|commute)\b/.test(normalized)
    || /\broute\s*(?:number\s*)?[1-4]\b/.test(normalized);
  if (transportIntent) {
    return {
      mode: 'itu',
      confidence: 0.95,
      category: 'transport',
      reason: 'ITU transport or numbered route intent detected.'
    };
  }

  /*
   * EMBEDDING SEARCH
   */
  const queryEmbedding = await fetchEmbedding(message);

  if (queryEmbedding && knowledgeEmbeddings.length > 0) {
    let maxSimilarity = -1;
    let bestMatch = null;

    for (const item of knowledgeEmbeddings) {
      const similarity = cosineSimilarity(
        queryEmbedding,
        item.embedding
      );

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        bestMatch = item;
      }
    }

    // Check learned memory store using semantic similarity
    const learnedMemory = findLearnedMemoryMatch({ message, queryEmbedding });

    /*
     * ITU threshold
     *
     * 0.50 is used as a reasonable starting point.
     */
    const ITU_THRESHOLD = 0.50;

    if (maxSimilarity >= ITU_THRESHOLD) {
      const combinedConfidence = learnedMemory
        ? Math.max(maxSimilarity, learnedMemory.similarity)
        : maxSimilarity;

      return {
        mode: 'itu',
        confidence: Number(combinedConfidence.toFixed(2)),
        category: bestMatch?.category || null,
        queryEmbedding,
        learnedMemory,
        reason: learnedMemory
          ? `Matched ITU knowledge category "${bestMatch?.category}" (${maxSimilarity.toFixed(2)}) with learned memory support (${learnedMemory.similarity.toFixed(2)}).`
          : `Matched ITU knowledge category "${bestMatch?.category}" with semantic similarity ${maxSimilarity.toFixed(2)}.`
      };
    }

    // If static knowledge didn't hit threshold, but learned memory matched an ITU question strongly
    if (learnedMemory && (learnedMemory.match.mode === 'itu' || !learnedMemory.match.mode) && learnedMemory.similarity >= 0.75) {
      return {
        mode: 'itu',
        confidence: Number(learnedMemory.similarity.toFixed(2)),
        category: 'learned_memory',
        queryEmbedding,
        learnedMemory,
        reason: `Matched previously learned ITU question "${learnedMemory.matchedQuery}" with semantic similarity ${learnedMemory.similarity.toFixed(2)}.`
      };
    }

    return {
      mode: 'general',
      confidence: Number(maxSimilarity.toFixed(2)),
      category: null,
      queryEmbedding,
      learnedMemory,
      reason: `No sufficiently relevant ITU knowledge found. Best similarity was ${maxSimilarity.toFixed(2)}.`
    };
  }

  // If embeddings were not available, check for exact match in learned memory
  const exactMemoryMatch = findLearnedMemoryMatch({ message });
  if (exactMemoryMatch && exactMemoryMatch.match.mode === 'itu') {
    return {
      mode: 'itu',
      confidence: 0.95,
      category: 'learned_memory',
      learnedMemory: exactMemoryMatch,
      reason: exactMemoryMatch.reason
    };
  }

  /*
   * FALLBACK KEYWORD DETECTION
   *
   * This prevents obvious ITU questions from becoming
   * General AI when Ollama embeddings are temporarily unavailable.
   */
  const ituKeywords = [
    'itu',
    'information technology university',
    'itu lahore',
    'arfa',
    'astp',
    'admission',
    'admissions',
    'merit',
    'bscs',
    'bsai',
    'computer science',
    'artificial intelligence',
    'tuition',
    'fee',
    'fees',
    'scholarship',
    'eligibility',
    'entry test',
    'entrance test',
    'nat',
    'usat',
    'campus',
    'hostel',
    'transport',
    'bus route',
    'bus routes',
    'attendance',
    'cgpa',
    'semester',
    'program',
    'programs',
    'curriculum',
    'nceac',
    'hec',
    'plan9',
    'library'
  ];

  const matchedKeyword = ituKeywords.find(keyword =>
    normalized.includes(keyword)
  );

  if (matchedKeyword) {
    return {
      mode: 'itu',
      confidence: 0.85,
      category: null,
      reason: `ITU keyword "${matchedKeyword}" detected while embeddings were unavailable.`
    };
  }

  /*
   * GREETINGS
   */
  if (/^(hi|hello|hey|salam|aoa|assalamualaikum)\b/i.test(normalized)) {
    return {
      mode: 'itu',
      confidence: 0.80,
      category: 'greeting',
      reason: 'Greeting handled by ITU chatbot persona.'
    };
  }

  /*
   * DEFAULT
   */
  return {
    mode: 'general',
    confidence: 0.50,
    category: null,
    reason: 'No strong ITU relevance detected.'
  };
}