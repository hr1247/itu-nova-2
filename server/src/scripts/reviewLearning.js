import { listReviewableLearningFeedback, reviewLearningFeedback } from '../services/learningService.js';
import { dismissLearningCandidate, getLearningSummary, listLearningCandidates } from '../services/selfLearningService.js';

const [command, entryId] = process.argv.slice(2);

if (command === 'summary') {
  console.log(JSON.stringify(getLearningSummary(), null, 2));
} else if (command === 'candidates') {
  console.log(JSON.stringify(listLearningCandidates(), null, 2));
} else if (command === 'dismiss-candidate' && entryId) {
  try {
    dismissLearningCandidate(entryId);
    console.log(`Learning candidate dismissed: ${entryId}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
} else if (command === 'list') {
  const reviewable = listReviewableLearningFeedback();
  if (reviewable.length === 0) {
    console.log('No corrections to review.');
  } else {
    for (const entry of reviewable) {
      console.log(`\nID: ${entry.id}\nStatus: ${entry.status}\nQuestion: ${entry.question}\nSuggested correction: ${entry.correction}\nSubmitted: ${entry.createdAt}`);
    }
  }
} else if (['approve', 'reject'].includes(command) && entryId) {
  try {
    const entry = await reviewLearningFeedback(entryId, command);
    const result = command === 'approve' ? 'approved' : 'rejected';
    console.log(`Correction ${result}: ${entry.id}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
} else {
  console.log('Usage:');
  console.log('  npm run review-learning -- summary');
  console.log('  npm run review-learning -- candidates');
  console.log('  npm run review-learning -- dismiss-candidate <id>');
  console.log('  npm run review-learning -- list');
  console.log('  npm run review-learning -- approve <id>');
  console.log('  npm run review-learning -- reject <id>');
  process.exitCode = 1;
}
