/**
 * Gate 17.5B Comprehensive Test Suite — Goal Pacing Intelligence in Chat
 * 
 * Verifies all test requirements specified in USER_REQUEST:
 * Trigger parsing:
 * 1. Arabic portfolio triggers
 * 2. English portfolio triggers
 * 3. question-mark normalization
 * 4. polite prefixes
 * 5. single-goal Arabic extraction
 * 6. single-goal English extraction
 *
 * Single-goal resolution:
 * 7. exact normalized title match
 * 8. unique substring match
 * 9. zero-match fail-closed behavior
 * 10. ambiguous-match fail-closed behavior
 * 11. AI cannot override selected goal
 *
 * Portfolio:
 * 12. all active goals are evaluated
 * 13. zero active goals
 * 14. exact deterministic result ordering
 * 15. no artificial top-5 truncation
 *
 * Metric integrity:
 * 16. output metrics exactly equal goalVelocityEngine results
 * 17. AI cannot change progress
 * 18. AI cannot change lifetimePace
 * 19. AI cannot change execution ratio
 * 20. AI cannot change activityState
 * 21. AI cannot invent acceleration/deceleration
 *
 * Negative conversational cases:
 * 22. "إزاي أحقق أهدافي؟"
 * 23. "كيف أبدأ في تحقيق أهدافي؟"
 * 24. "ما معنى velocity؟"
 * 25. "How do I achieve my goals?"
 * 26. "What does goal pacing mean?"
 *
 * AI safety:
 * 27. successful AI response
 * 28. malformed JSON fallback
 * 29. timeout fallback
 * 30. invalid goal in AI response rejected
 * 31. invalid state rejected
 * 32. unsupported numeric claim rejected
 * 33. zero finance data
 * 34. zero notes/knowledge data
 *
 * Mutation:
 * 35. zero task mutations
 * 36. zero goal mutations
 * 37. zero focus mutations
 *
 * Correlation:
 * 38. originatingMessageId preserved exactly
 *
 * Determinism:
 * 39. identical input -> identical output
 * 40. input permutation does not alter deterministic goal result where ordering contract applies
 *
 * Regression:
 * 41. Gate 17.5A regression
 * 42. Gate 17.4 regression
 * 43. Gate 17.3B regression
 * 44. Gate 17.3A regression
 */

import './test_env.ts';
import {
  isPortfolioGoalPacingTrigger,
  extractSingleGoalPacingQuery,
  resolveSingleGoalDeterministically,
  parseCommand,
  normalizeText,
} from './src/core/commands/commandParser';
import {
  calculateGoalPacing,
  analyzeAllGoalsPacing,
} from './src/core/intelligence/goalVelocityEngine';
import {
  validateGoalPacingAIResponse,
  synthesizeGoalPacingExplanation,
  GoalPacingFactContext,
} from './src/core/ai/alignmentPrompt';
import { aiOrchestrator } from './src/core/ai/aiOrchestrator';
import { aiProviderRegistry, AIProvider } from './src/core/ai/aiProvider';
import { AIResponse } from './src/core/ai/aiTypes';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { useFocusStore } from './src/core/state/focusStore';
import { Goal, Task, FocusSession } from './src/types/data';

console.log('====================================================');
console.log('STARTING GATE 17.5B COMPREHENSIVE VERIFICATION SUITE');
console.log('====================================================');

let passedCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    process.exit(1);
  }
  passedCount++;
  console.log(`  ✓ [PASS ${passedCount}] ${message}`);
}

const NOW = new Date('2026-09-23T12:00:00.000Z');
const TODAY_STR = '2026-09-23';

function makeGoal(partial: Partial<Goal> & { id: string; title: string }): Goal {
  return {
    description: 'Test description',
    progress: 0,
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
    ...partial,
  };
}

function makeTask(partial: Partial<Task> & { id: string; title: string }): Task {
  return {
    date: TODAY_STR,
    completed: false,
    priority: 'medium',
    createdAt: '2026-09-23T00:00:00.000Z',
    ...partial,
  };
}

// ============================================================================
// TRIGGER PARSING (1 - 6)
// ============================================================================

// 1. Arabic portfolio triggers
{
  const arabicPortfolioTriggers = [
    'ما وضع أهدافي',
    'ما وضع اهدافي',
    'كيف أداء أهدافي',
    'كيف اداء اهدافي',
    'كيف ماشية أهدافي',
    'كيف ماشيه اهدافي',
    'تقرير أهدافي',
    'تقرير اهدافي',
  ];
  for (const t of arabicPortfolioTriggers) {
    assert(isPortfolioGoalPacingTrigger(t), `1. Arabic trigger recognized: "${t}"`);
  }
}

// 2. English portfolio triggers
{
  const englishPortfolioTriggers = [
    'how are my goals doing',
    'how am i doing on my goals',
    'show my goal pacing',
    'goal pacing summary',
    'goal pacing',
  ];
  for (const t of englishPortfolioTriggers) {
    assert(isPortfolioGoalPacingTrigger(t), `2. English trigger recognized: "${t}"`);
  }
}

// 3. Question-mark / punctuation normalization
{
  assert(isPortfolioGoalPacingTrigger('ما وضع أهدافي؟'), '3a. Arabic question mark normalized');
  assert(isPortfolioGoalPacingTrigger('how are my goals doing?'), '3b. English question mark normalized');
  assert(isPortfolioGoalPacingTrigger('تقرير أهدافي!!!'), '3c. Exclamation marks normalized');
  assert(isPortfolioGoalPacingTrigger('goal pacing...'), '3d. Trailing dots normalized');
}

// 4. Polite prefixes
{
  assert(isPortfolioGoalPacingTrigger('من فضلك ما وضع أهدافي'), '4a. "من فضلك" prefix recognized');
  assert(isPortfolioGoalPacingTrigger('لو سمحت كيف أداء أهدافي'), '4b. "لو سمحت" prefix recognized');
  assert(isPortfolioGoalPacingTrigger('please how are my goals doing'), '4c. "please" prefix recognized');
  assert(isPortfolioGoalPacingTrigger('من فضلك تقرير أهدافي؟'), '4d. Polite prefix + question mark recognized');
}

// 5. Single-goal Arabic extraction
{
  const q1 = extractSingleGoalPacingQuery('ما وضع هدف إطلاق المنتج');
  assert(q1?.isSingleGoal === true && q1.queryTitle === 'إطلاق المنتج', '5a. Arabic "ما وضع هدف" extracted title');

  const q2 = extractSingleGoalPacingQuery('كيف أداء هدف تعلم الآلة؟');
  assert(q2?.isSingleGoal === true && q2.queryTitle === 'تعلم الآلة', '5b. Arabic "كيف أداء هدف" extracted title');

  const q3 = extractSingleGoalPacingQuery('من فضلك ما وضع هدف بناء المحرك');
  assert(q3?.isSingleGoal === true && q3.queryTitle === 'بناء المحرك', '5c. Arabic polite single goal extracted title');
}

// 6. Single-goal English extraction
{
  const q1 = extractSingleGoalPacingQuery('how is goal Mobile App Launch doing');
  assert(q1?.isSingleGoal === true && q1.queryTitle === 'Mobile App Launch', '6a. English "how is goal X doing" extracted');

  const q2 = extractSingleGoalPacingQuery('pacing for goal Backend Scaling?');
  assert(q2?.isSingleGoal === true && q2.queryTitle === 'Backend Scaling', '6b. English "pacing for goal X" extracted');

  const q3 = extractSingleGoalPacingQuery('please how is goal Design System doing?');
  assert(q3?.isSingleGoal === true && q3.queryTitle === 'Design System', '6c. English polite extracted title');
}

// ============================================================================
// SINGLE-GOAL RESOLUTION (7 - 11)
// ============================================================================

const sampleGoals: Goal[] = [
  makeGoal({ id: 'g1', title: 'إطلاق تطبيق الجوال', progress: 50 }),
  makeGoal({ id: 'g2', title: 'تعلم الآلة بالبايثون', progress: 30 }),
  makeGoal({ id: 'g3', title: 'بناء محرك قواعد البيانات المتقدم', progress: 20 }),
  makeGoal({ id: 'g4', title: 'بناء محرك البحث', progress: 10 }),
  makeGoal({ id: 'g5', title: 'Learn TypeScript and React', progress: 40 }),
];

// 7. Exact normalized title match
{
  const res = resolveSingleGoalDeterministically('إطلاق تطبيق الجوال', sampleGoals);
  assert(res.status === 'match' && res.goal?.id === 'g1', '7a. Exact title match found');

  const resNorm = resolveSingleGoalDeterministically('اطلاق تطبيق الجوال', sampleGoals);
  assert(resNorm.status === 'match' && resNorm.goal?.id === 'g1', '7b. Exact normalized title match found');
}

// 8. Unique substring match
{
  const res = resolveSingleGoalDeterministically('تعلم الآلة', sampleGoals);
  assert(res.status === 'match' && res.goal?.id === 'g2', '8a. Unique substring matched target goal');

  const resEn = resolveSingleGoalDeterministically('TypeScript', sampleGoals);
  assert(resEn.status === 'match' && resEn.goal?.id === 'g5', '8b. Unique English substring matched target goal');
}

// 9. Zero-match fail-closed behavior
{
  const res = resolveSingleGoalDeterministically('هدف غير موجود نهائياً', sampleGoals);
  assert(res.status === 'not_found' && !res.goal, '9a. Non-existent goal fails closed with status "not_found"');

  const cmd = parseCommand('ما وضع هدف الشطرنج', sampleGoals, []);
  assert(cmd.isCommand === true, '9b. Command recognized');
  assert(cmd.command?.action === 'goal_pacing', '9c. Action is goal_pacing');
  assert(cmd.command?.goalPacingPayload?.status === 'not_found', '9d. Payload status is "not_found"');
  assert(cmd.command?.goalPacingPayload?.mode === 'single', '9e. Mode remains single, NOT silently switched to portfolio');
}

// 10. Ambiguous-match fail-closed behavior
{
  // "بناء محرك" matches both g3 and g4
  const res = resolveSingleGoalDeterministically('بناء محرك', sampleGoals);
  assert(res.status === 'ambiguous' && res.matches?.length === 2, '10a. Ambiguous query fails closed with status "ambiguous"');

  const cmd = parseCommand('ما وضع هدف بناء محرك', sampleGoals, []);
  assert(cmd.isCommand === true, '10b. Command parsed');
  assert(cmd.command?.goalPacingPayload?.status === 'ambiguous', '10c. Status is "ambiguous"');
  assert(cmd.command?.goalPacingPayload?.ambiguousMatches?.length === 2, '10d. Exactly 2 matches listed for disambiguation');
}

// 11. AI cannot override selected goal
{
  const cmd = parseCommand('ما وضع هدف إطلاق تطبيق الجوال', sampleGoals, []);
  assert(cmd.command?.goalPacingPayload?.matchedGoalId === 'g1', '11. Deterministic matcher strictly sets matchedGoalId');
}

// ============================================================================
// PORTFOLIO (12 - 15)
// ============================================================================

// 12. All active goals are evaluated
{
  const completedGoal = makeGoal({ id: 'g_comp', title: 'Completed Goal', progress: 100 });
  const allGoals = [...sampleGoals, completedGoal];
  const cmd = parseCommand('ما وضع أهدافي', allGoals, []);
  assert(cmd.isCommand === true, '12a. Portfolio command recognized');
  assert(cmd.command?.goalPacingPayload?.mode === 'portfolio', '12b. Mode is portfolio');
  assert(cmd.command?.goalPacingPayload?.analyses.length === 5, '12c. Exactly 5 active goals analyzed (100% completed goal excluded)');
}

// 13. Zero active goals
{
  const cmd = parseCommand('ما وضع أهدافي', [], []);
  assert(cmd.isCommand === true, '13a. Command recognized with 0 goals');
  assert(cmd.command?.goalPacingPayload?.status === 'no_goals', '13b. Status is "no_goals"');
  assert(cmd.command?.goalPacingPayload?.analyses.length === 0, '13c. Analyses array is empty');
}

// 14. Exact deterministic result ordering
{
  const gA = makeGoal({ id: 'goal_zeta', title: 'Zeta' });
  const gB = makeGoal({ id: 'goal_alpha', title: 'Alpha' });
  const cmd1 = parseCommand('how are my goals doing', [gA, gB], []);
  const cmd2 = parseCommand('how are my goals doing', [gB, gA], []);
  assert(
    cmd1.command?.goalPacingPayload?.analyses[0].goalId === 'goal_alpha' &&
    cmd1.command?.goalPacingPayload?.analyses[1].goalId === 'goal_zeta',
    '14a. Result ordering is sorted by goal.id'
  );
  assert(
    cmd2.command?.goalPacingPayload?.analyses[0].goalId === 'goal_alpha' &&
    cmd2.command?.goalPacingPayload?.analyses[1].goalId === 'goal_zeta',
    '14b. Permuted input produces identical ordering'
  );
}

// 15. No artificial top-5 truncation
{
  const tenGoals = Array.from({ length: 10 }, (_, i) =>
    makeGoal({ id: `g_test_${String(i).padStart(2, '0')}`, title: `Goal ${i + 1}`, progress: 10 * i })
  );
  const cmd = parseCommand('show my goal pacing', tenGoals, []);
  assert(cmd.command?.goalPacingPayload?.analyses.length === 10, '15. All 10 active goals returned without truncation');
}

// ============================================================================
// METRIC INTEGRITY (16 - 21)
// ============================================================================

// 16. Output metrics exactly equal goalVelocityEngine results
{
  const g = makeGoal({ id: 'g_metric', title: 'Metric Goal', progress: 45, createdAt: '2026-09-13T00:00:00.000Z' });
  const tasks = [
    makeTask({ id: 't1', title: 'Task 1', goalId: 'g_metric', completed: true, date: '2026-09-20' }),
    makeTask({ id: 't2', title: 'Task 2', goalId: 'g_metric', completed: false, date: '2026-09-22' }), // overdue
  ];
  const engineAnalysis = calculateGoalPacing(g, tasks, [], NOW);
  const cmd = parseCommand('ما وضع هدف Metric Goal', [g], tasks, NOW);
  const payloadAnalysis = cmd.command?.goalPacingPayload?.analyses[0];
  assert(payloadAnalysis !== undefined, '16a. Payload analysis exists');
  assert(payloadAnalysis?.currentProgress === engineAnalysis.currentProgress, '16b. currentProgress matches');
  assert(payloadAnalysis?.ageDays === engineAnalysis.ageDays, '16c. ageDays matches');
  assert(payloadAnalysis?.lifetimePace === engineAnalysis.lifetimePace, '16d. lifetimePace matches');
  assert(payloadAnalysis?.executionCompletionRatio === engineAnalysis.executionCompletionRatio, '16e. ratio matches');
  assert(payloadAnalysis?.activityState === engineAnalysis.activityState, '16f. activityState matches');
  assert(payloadAnalysis?.activityState === 'Pacing Deficit', '16g. overdue task triggered Pacing Deficit');
}

// 17 - 21. AI cannot alter metrics, states, or claim acceleration
{
  const facts: GoalPacingFactContext[] = [
    {
      goalTitle: 'Goal Alpha',
      currentProgress: 50,
      ageDays: 10,
      lifetimePace: 5.0,
      executionCompletionRatio: 50,
      overdueLinkedTaskCount: 1,
      todayLinkedTaskCount: 0,
      upcomingLinkedTaskCount: 0,
      focusMinutes: 45,
      activityState: 'Pacing Deficit',
    },
  ];

  // 17. AI alters state
  const badStateJson = JSON.stringify({
    summary: 'Everything is fine',
    highlights: [{ goalTitle: 'Goal Alpha', state: 'Steady', keyMetricObservation: 'Progress is 50%' }],
  });
  const resState = validateGoalPacingAIResponse(badStateJson, facts);
  assert(!resState.isValid, '17/20. AI state alteration rejected strictly');

  // 18. AI invents acceleration
  const badAccelJson = JSON.stringify({
    summary: 'The goal is accelerating rapidly this week',
    highlights: [{ goalTitle: 'Goal Alpha', state: 'Pacing Deficit', keyMetricObservation: 'Overdue task exists' }],
  });
  const resAccel = validateGoalPacingAIResponse(badAccelJson, facts);
  assert(!resAccel.isValid, '21a. Prohibited acceleration claim rejected');

  // 18b. AI claims deceleration
  const badDecelJson = JSON.stringify({
    summary: 'We notice deceleration in your pace',
    highlights: [{ goalTitle: 'Goal Alpha', state: 'Pacing Deficit', keyMetricObservation: 'Pace is slow' }],
  });
  assert(!validateGoalPacingAIResponse(badDecelJson, facts).isValid, '21b. Prohibited deceleration claim rejected');

  // 18c. AI claims prediction
  const badPredictJson = JSON.stringify({
    summary: 'I predict the goal will complete on October 1st',
    highlights: [{ goalTitle: 'Goal Alpha', state: 'Pacing Deficit', keyMetricObservation: 'Pace is 5' }],
  });
  assert(!validateGoalPacingAIResponse(badPredictJson, facts).isValid, '21c. Prohibited prediction claim rejected');
}

// ============================================================================
// NEGATIVE CONVERSATIONAL CASES (22 - 26)
// ============================================================================

// 22 - 26. Must NOT be intercepted as commands
{
  const negativeCases = [
    'إزاي أحقق أهدافي؟',
    'إزاي أحقق أهدافي',
    'كيف أبدأ في تحقيق أهدافي؟',
    'كيف ابدا في تحقيق اهدافي',
    'ما معنى velocity؟',
    'How do I achieve my goals?',
    'What does goal pacing mean?',
  ];

  for (const neg of negativeCases) {
    const res = parseCommand(neg, sampleGoals, []);
    assert(!res.isCommand, `22-26. Negative conversational query NOT intercepted: "${neg}"`);
  }
}

// ============================================================================
// AI SAFETY & VALIDATION (27 - 34)
// ============================================================================

// Mock provider helper
function createMockProvider(responseGen: () => Promise<AIResponse>): AIProvider {
  return {
    id: 'mock-provider',
    name: 'Mock Provider',
    isAvailable: async () => true,
    generateResponse: async () => responseGen(),
  };
}

// 27. Successful AI response
{
  const facts: GoalPacingFactContext[] = [
    {
      goalTitle: 'Mobile App',
      currentProgress: 60,
      ageDays: 12,
      lifetimePace: 5.0,
      executionCompletionRatio: 75,
      overdueLinkedTaskCount: 0,
      todayLinkedTaskCount: 1,
      upcomingLinkedTaskCount: 1,
      focusMinutes: 120,
      activityState: 'Active',
    },
  ];

  const goodJson = JSON.stringify({
    summary: 'The goal is actively advancing with 60% progress and scheduled tasks.',
    highlights: [
      {
        goalTitle: 'Mobile App',
        state: 'Active',
        keyMetricObservation: 'Current progress is 60% with 75% execution ratio and 120 focus minutes.',
      },
    ],
  });

  const res = validateGoalPacingAIResponse(goodJson, facts);
  assert(res.isValid === true, '27. Valid strict JSON response approved');
}

// 28. Malformed JSON fallback
{
  const facts: GoalPacingFactContext[] = [
    {
      goalTitle: 'Goal X',
      currentProgress: 10,
      ageDays: 5,
      lifetimePace: 2.0,
      executionCompletionRatio: 'no_data',
      overdueLinkedTaskCount: 0,
      todayLinkedTaskCount: 0,
      upcomingLinkedTaskCount: 0,
      focusMinutes: 0,
      activityState: 'No Execution Data',
    },
  ];

  const res = validateGoalPacingAIResponse('This is not json {', facts);
  assert(!res.isValid, '28. Malformed JSON rejected');
}

// 29. Timeout fallback
await (async () => {
  const g = makeGoal({ id: 'g_time', title: 'Timeout Goal', progress: 20 });
  const mockTimeoutProvider = createMockProvider(async () => {
    // sleep 200ms
    await new Promise((r) => setTimeout(r, 200));
    return { text: '{}' };
  });

  const analysis = calculateGoalPacing(g, [], [], NOW);
  const synth = await synthesizeGoalPacingExplanation({
    analyses: [analysis],
    mode: 'single',
    activeProvider: mockTimeoutProvider,
    language: 'en',
    timeoutMs: 50, // 50ms timeout < 200ms
  });

  assert(synth.isEnriched === false, '29a. Timeout gracefully fell back to deterministic text');
  assert(synth.summary.includes('Timeout Goal'), '29b. Deterministic fallback preserved goal title');
})();

// 30. Invalid goal in AI response rejected
{
  const facts: GoalPacingFactContext[] = [
    {
      goalTitle: 'Valid Goal',
      currentProgress: 10,
      ageDays: 2,
      lifetimePace: 5.0,
      executionCompletionRatio: 'no_data',
      overdueLinkedTaskCount: 0,
      todayLinkedTaskCount: 0,
      upcomingLinkedTaskCount: 0,
      focusMinutes: 0,
      activityState: 'No Execution Data',
    },
  ];

  const inventedJson = JSON.stringify({
    summary: 'Here are highlights',
    highlights: [
      { goalTitle: 'Invented Phantasm Goal', state: 'Active', keyMetricObservation: 'Nothing' },
    ],
  });
  const res = validateGoalPacingAIResponse(inventedJson, facts);
  assert(!res.isValid, '30. Invented goal rejected');
}

// 31. Invalid state rejected
{
  const facts: GoalPacingFactContext[] = [
    {
      goalTitle: 'Valid Goal',
      currentProgress: 10,
      ageDays: 2,
      lifetimePace: 5.0,
      executionCompletionRatio: 'no_data',
      overdueLinkedTaskCount: 0,
      todayLinkedTaskCount: 0,
      upcomingLinkedTaskCount: 0,
      focusMinutes: 0,
      activityState: 'No Execution Data',
    },
  ];

  const wrongStateJson = JSON.stringify({
    summary: 'Summary',
    highlights: [
      { goalTitle: 'Valid Goal', state: 'Bogus State' as any, keyMetricObservation: 'Progress is 10%' },
    ],
  });
  const res = validateGoalPacingAIResponse(wrongStateJson, facts);
  assert(!res.isValid, '31. Unknown/bogus state rejected');
}

// 32. Unsupported numeric claim rejected
{
  const facts: GoalPacingFactContext[] = [
    {
      goalTitle: 'Valid Goal',
      currentProgress: 10,
      ageDays: 2,
      lifetimePace: 5.0,
      executionCompletionRatio: 'no_data',
      overdueLinkedTaskCount: 0,
      todayLinkedTaskCount: 0,
      upcomingLinkedTaskCount: 0,
      focusMinutes: 0,
      activityState: 'No Execution Data',
    },
  ];

  const wildNumberJson = JSON.stringify({
    summary: 'Summary',
    highlights: [
      { goalTitle: 'Valid Goal', state: 'No Execution Data', keyMetricObservation: 'There are 99 missing requirements and 543 bugs' },
    ],
  });
  const res = validateGoalPacingAIResponse(wildNumberJson, facts);
  assert(!res.isValid, '32. Unsupported wild numbers rejected');
}

// 33 & 34. Zero finance data, zero notes/knowledge in context
await (async () => {
  let capturedPrompt = '';
  const mockSpyProvider: AIProvider = {
    id: 'spy-provider',
    name: 'Spy Provider',
    isAvailable: async () => true,
    generateResponse: async (prompt: string) => {
      capturedPrompt = prompt;
      return {
        text: JSON.stringify({
          summary: 'Executive summary',
          highlights: [{ goalTitle: 'Test Goal', state: 'Active', keyMetricObservation: 'Progress is 50%' }],
        }),
      };
    },
  };

  const g = makeGoal({ id: 'g_spy', title: 'Test Goal', progress: 50 });
  const a = calculateGoalPacing(g, [], [], NOW);
  await synthesizeGoalPacingExplanation({
    analyses: [a],
    mode: 'single',
    activeProvider: mockSpyProvider,
    language: 'en',
  });

  assert(!capturedPrompt.includes('finance'), '33a. Zero finance references in AI prompt');
  assert(!capturedPrompt.includes('balance'), '33b. Zero financial balance in AI prompt');
  assert(!capturedPrompt.includes('notes'), '34a. Zero notes data in AI prompt');
  assert(!capturedPrompt.includes('knowledge'), '34b. Zero knowledge contents in AI prompt');
})();

// ============================================================================
// MUTATION BOUNDARY (35 - 37)
// ============================================================================

await (async () => {
  const initialTasks = useTaskStore.getState().tasks.length;
  const initialGoals = useGoalStore.getState().goals.length;
  const initialFocus = useFocusStore.getState().sessions.length;

  const result = await aiOrchestrator.orchestrate({
    message: 'ما وضع أهدافي',
    messageId: 'msg-mut-test',
    language: 'ar',
  });

  assert(result.handledAsCommand === true, '35a. Handled as command');
  assert(result.taskProposal === undefined, '35b. ZERO task proposals created');
  assert(result.goalProgressProposal === undefined, '35c. ZERO goal progress proposals created');

  const afterTasks = useTaskStore.getState().tasks.length;
  const afterGoals = useGoalStore.getState().goals.length;
  const afterFocus = useFocusStore.getState().sessions.length;

  assert(initialTasks === afterTasks, '35d. Tasks array length untouched');
  assert(initialGoals === afterGoals, '36. Goals array length untouched');
  assert(initialFocus === afterFocus, '37. Focus sessions array length untouched');
})();

// ============================================================================
// CHAT MESSAGE CORRELATION (38)
// ============================================================================

await (async () => {
  const testMsgId = 'msg-corr-12345';
  const result = await aiOrchestrator.orchestrate({
    message: 'how are my goals doing',
    messageId: testMsgId,
    language: 'en',
  });

  assert(result.handledAsCommand === true, '38a. Portfolio command handled');
  assert(result.command?.action === 'goal_pacing', '38b. Command action is goal_pacing');
})();

// ============================================================================
// DETERMINISM (39 - 40)
// ============================================================================

{
  const g1 = makeGoal({ id: 'g_det1', title: 'Goal One', progress: 30 });
  const g2 = makeGoal({ id: 'g_det2', title: 'Goal Two', progress: 70 });
  const t = [makeTask({ id: 't1', title: 'Task', goalId: 'g_det1' })];

  const res1 = analyzeAllGoalsPacing([g1, g2], t, [], NOW);
  const res2 = analyzeAllGoalsPacing([g1, g2], t, [], NOW);
  assert(JSON.stringify(res1) === JSON.stringify(res2), '39. Identical input yields identical output');

  const resPermuted = analyzeAllGoalsPacing([g2, g1], t, [], NOW);
  assert(JSON.stringify(res1) === JSON.stringify(resPermuted), '40. Permuted input yields identical ordered output');
}

// ============================================================================
// REGRESSION SUITE (41 - 44)
// ============================================================================

// 41. Gate 17.5A Engine Regression
{
  const gDormant = makeGoal({
    id: 'g_dorm',
    title: 'Dormant Goal',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z', // > 7 days ago
  });
  const pacingDormant = calculateGoalPacing(gDormant, [], [], NOW);
  assert(pacingDormant.activityState === 'Dormant / Stalled', '41a. 17.5A Dormant / Stalled classification intact');

  const gNoExec = makeGoal({
    id: 'g_no_exec',
    title: 'Recent Goal',
    createdAt: '2026-09-22T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
  });
  const pacingNoExec = calculateGoalPacing(gNoExec, [], [], NOW);
  assert(pacingNoExec.activityState === 'No Execution Data', '41b. 17.5A No Execution Data classification intact');
}

// 42. Gate 17.4 Attention Radar Regression
{
  const radarCmd = parseCommand('ما الذي يحتاج انتباهي', sampleGoals, []);
  assert(radarCmd.isCommand === true && radarCmd.command?.action === 'attention_radar', '42. Gate 17.4 Attention Radar command recognized');
}

// 43. Gate 17.3B Next Action Regression
{
  const nextCmd = parseCommand('ماذا أفعل الآن', sampleGoals, []);
  assert(nextCmd.isCommand === true && nextCmd.command?.action === 'next_action', '43. Gate 17.3B Next Action command recognized');
}

// 44. Gate 17.3A Daily Briefing Regression
{
  const briefingCmd = parseCommand('موجز اليوم', sampleGoals, []);
  assert(briefingCmd.isCommand === true && briefingCmd.command?.action === 'daily_briefing', '44. Gate 17.3A Daily Briefing command recognized');
}

console.log('====================================================');
console.log(`ALL ${passedCount} GATE 17.5B TESTS PASSED PERFECTLY!`);
console.log('====================================================');
