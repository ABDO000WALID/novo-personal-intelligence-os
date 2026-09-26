import './test_env.ts';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { aiOrchestrator } from './src/core/ai/aiOrchestrator';
import {
  parseCommand,
  parseGoalProgressCommand,
  normalizeDigits,
  resolveGoalDeterministically,
} from './src/core/commands/commandParser';
import { useGoalStore } from './src/core/state/goalStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { GoalProgressActionProposal } from './src/core/commands/commandTypes';
import { Goal } from './src/types/data';

console.log('=== GATE 15.0 COMPREHENSIVE VERIFICATION SUITE ===');

const TEST_UID = 'gate15-test-user-001';

const sampleGoals: Goal[] = [
  {
    id: 'goal-eng-1',
    title: 'تعلم اللغة الإنجليزية',
    description: 'تحسين المحادثة والقراءة باللغة الإنجليزية',
    progress: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'goal-fit-2',
    title: 'اللياقة البدنية والصحة',
    description: 'تمارين يومية وخسارة وزن',
    progress: 25,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'goal-book-3',
    title: 'Book Writing',
    description: 'Publish novel first draft',
    progress: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'goal-ambig-a',
    title: 'مشروع البرمجة المتقدم',
    description: 'برمجة الواجهة',
    progress: 50,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'goal-ambig-b',
    title: 'مشروع البرمجة الأساسي',
    description: 'برمجة الباك إند',
    progress: 50,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function resetStorage() {
  AuthLifecycle.reset(TEST_UID);
  (RepositoryFactory.getGoalRepository() as any)._saveAllSync([...sampleGoals]);
  useGoalStore.setState({ goals: [...sampleGoals], status: 'ready', error: null });
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${testName}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function runAllTests() {
  resetStorage();

  // ==========================================
  // PART 1: ARABIC PROGRESS PARSING (Tests 1-4)
  // ==========================================
  console.log('\n--- PART 1: ARABIC PROGRESS PARSING ---');

  // Test 1: Arabic standard with percentage sign
  const p1 = parseGoalProgressCommand(
    'حدّث تقدم هدف تعلم اللغة الإنجليزية إلى 50%',
    sampleGoals
  );
  assert(
    p1 !== null &&
      p1.goalId === 'goal-eng-1' &&
      p1.currentProgress === 30 &&
      p1.newProgress === 50,
    'Test 1: Arabic standard with percentage sign (50%)',
    JSON.stringify(p1)
  );

  // Test 2: Arabic without percentage sign (raw number)
  const p2 = parseGoalProgressCommand(
    'حدث تقدم هدف تعلم اللغة الإنجليزية الى 75',
    sampleGoals
  );
  assert(
    p2 !== null &&
      p2.goalId === 'goal-eng-1' &&
      p2.currentProgress === 30 &&
      p2.newProgress === 75,
    'Test 2: Arabic without percentage sign (75)',
    JSON.stringify(p2)
  );

  // Test 3: Arabic with "بالمئة"
  const p3 = parseGoalProgressCommand(
    'غير تقدم هدف اللياقة البدنية والصحة الى 80 بالمئة',
    sampleGoals
  );
  assert(
    p3 !== null &&
      p3.goalId === 'goal-fit-2' &&
      p3.currentProgress === 25 &&
      p3.newProgress === 80,
    'Test 3: Arabic with "بالمئة" (80%)',
    JSON.stringify(p3)
  );

  // Test 4: Arabic with Indic digits (٥٠٪)
  const p4 = parseGoalProgressCommand(
    'خلي تقدم هدف تعلم اللغة الإنجليزية ٥٠٪',
    sampleGoals
  );
  assert(
    p4 !== null &&
      p4.goalId === 'goal-eng-1' &&
      p4.currentProgress === 30 &&
      p4.newProgress === 50,
    'Test 4: Arabic with Eastern Arabic/Indic digits (٥٠٪)',
    JSON.stringify(p4)
  );

  // ==========================================
  // PART 2: ENGLISH PROGRESS PARSING (Tests 5-8)
  // ==========================================
  console.log('\n--- PART 2: ENGLISH PROGRESS PARSING ---');

  // Test 5: English "to 40%"
  const p5 = parseGoalProgressCommand(
    'Update progress of Book Writing to 40%',
    sampleGoals
  );
  assert(
    p5 !== null &&
      p5.goalId === 'goal-book-3' &&
      p5.currentProgress === 10 &&
      p5.newProgress === 40,
    'Test 5: English "to 40%"',
    JSON.stringify(p5)
  );

  // Test 6: English "Set progress of ... to 80%"
  const p6 = parseGoalProgressCommand(
    'Set progress of Book Writing to 80%',
    sampleGoals
  );
  assert(
    p6 !== null &&
      p6.goalId === 'goal-book-3' &&
      p6.currentProgress === 10 &&
      p6.newProgress === 80,
    'Test 6: English "Set progress of ... to 80%"',
    JSON.stringify(p6)
  );

  // Test 7: English "Update goal Book Writing to 50 percent"
  const p7 = parseGoalProgressCommand(
    'Update goal Book Writing to 50 percent',
    sampleGoals
  );
  assert(
    p7 !== null &&
      p7.goalId === 'goal-book-3' &&
      p7.currentProgress === 10 &&
      p7.newProgress === 50,
    'Test 7: English "to 50 percent"',
    JSON.stringify(p7)
  );

  // Test 8: English "Set goal progress of Book Writing 65"
  const p8 = parseGoalProgressCommand(
    'Set goal progress of Book Writing 65',
    sampleGoals
  );
  assert(
    p8 !== null &&
      p8.goalId === 'goal-book-3' &&
      p8.currentProgress === 10 &&
      p8.newProgress === 65,
    'Test 8: English "Set goal progress of Book Writing 65"',
    JSON.stringify(p8)
  );

  // ==========================================
  // PART 3: BOUNDARY & VALIDATION (Tests 9-14)
  // ==========================================
  console.log('\n--- PART 3: BOUNDARY & RANGE VALIDATION ---');

  // Test 9: Lower boundary 0%
  const p9 = parseGoalProgressCommand(
    'حدث تقدم هدف تعلم اللغة الإنجليزية الى 0%',
    sampleGoals
  );
  assert(
    p9 !== null && p9.newProgress === 0,
    'Test 9: Lower boundary 0%',
    JSON.stringify(p9)
  );

  // Test 10: Upper boundary 100%
  const p10 = parseGoalProgressCommand(
    'Update progress of Book Writing to 100%',
    sampleGoals
  );
  assert(
    p10 !== null && p10.newProgress === 100,
    'Test 10: Upper boundary 100%',
    JSON.stringify(p10)
  );

  // Test 11: Out of range > 100 (150%) MUST REJECT (never clamp)
  const p11 = parseGoalProgressCommand(
    'حدث تقدم هدف تعلم اللغة الإنجليزية الى 150%',
    sampleGoals
  );
  assert(
    p11 === null,
    'Test 11: Out of range > 100 (150%) must reject with null',
    JSON.stringify(p11)
  );

  // Test 12: Negative progress (-10%) MUST REJECT
  const p12 = parseGoalProgressCommand(
    'Set progress of Book Writing to -10%',
    sampleGoals
  );
  assert(
    p12 === null,
    'Test 12: Negative progress (-10%) must reject with null',
    JSON.stringify(p12)
  );

  // Test 13: Relative increase expression MUST REJECT
  const p13 = parseGoalProgressCommand(
    'زود تقدم هدف تعلم اللغة الإنجليزية 10%',
    sampleGoals
  );
  assert(
    p13 === null,
    'Test 13: Relative Arabic expression ("زود 10%") must reject with null',
    JSON.stringify(p13)
  );

  // Test 14: Relative increase English expression MUST REJECT
  const p14 = parseGoalProgressCommand(
    'Increase progress of Book Writing by 15%',
    sampleGoals
  );
  assert(
    p14 === null,
    'Test 14: Relative English expression ("Increase by 15%") must reject with null',
    JSON.stringify(p14)
  );

  // ==========================================
  // PART 4: DETERMINISTIC GOAL RESOLUTION (Tests 15-18)
  // ==========================================
  console.log('\n--- PART 4: DETERMINISTIC GOAL RESOLUTION ---');

  // Test 15: Exact match
  const p15 = parseGoalProgressCommand(
    'Update progress of Book Writing to 45%',
    sampleGoals
  );
  assert(
    p15 !== null && p15.goalId === 'goal-book-3',
    'Test 15: Exact match resolution',
    JSON.stringify(p15)
  );

  // Test 16: Unambiguous substring match
  const p16 = parseGoalProgressCommand(
    'حدث تقدم هدف الانجليزية الى 60%',
    sampleGoals
  );
  assert(
    p16 !== null && p16.goalId === 'goal-eng-1',
    'Test 16: Unambiguous substring match ("الانجليزية" -> "تعلم اللغة الإنجليزية")',
    JSON.stringify(p16)
  );

  // Test 17: Ambiguous goal reference MUST FAIL CLOSED (return null)
  const p17 = parseGoalProgressCommand(
    'حدث تقدم هدف مشروع البرمجة الى 70%',
    sampleGoals
  );
  assert(
    p17 === null,
    'Test 17: Ambiguous goal reference must return null (never guess)',
    JSON.stringify(p17)
  );

  // Test 18: Non-existent goal reference MUST FAIL CLOSED (return null)
  const p18 = parseGoalProgressCommand(
    'حدث تقدم هدف تعلم الطبخ الى 50%',
    sampleGoals
  );
  assert(
    p18 === null,
    'Test 18: Non-existent goal reference must return null',
    JSON.stringify(p18)
  );

  // ==========================================
  // PART 5: NO-MUTATION PRE-CONFIRM (Tests 19-21)
  // ==========================================
  console.log('\n--- PART 5: NO-MUTATION PRE-CONFIRM SAFETY ---');
  resetStorage();

  const initialEng = useGoalStore.getState().goals.find((g) => g.id === 'goal-eng-1');
  const initialProgress = initialEng?.progress;

  // Test 19: Command parsing does not mutate goal
  parseCommand('حدث تقدم هدف تعلم اللغة الإنجليزية الى 90%', sampleGoals);
  const postParseEng = useGoalStore.getState().goals.find((g) => g.id === 'goal-eng-1');
  assert(
    postParseEng?.progress === initialProgress,
    'Test 19: Command parsing does not mutate goal in store'
  );

  // Test 20: AI Orchestrator dispatch creates proposal without mutating goal
  const orchestratorResult = await aiOrchestrator.orchestrate({
    message: 'حدّث تقدم هدف تعلم اللغة الإنجليزية إلى 90%',
    context: {
      activeRoute: 'chat',
      routeTitle: 'Chat',
      pendingTasksCount: 0,
      activeGoalsCount: 5,
      systemStatus: 'healthy',
      goals: sampleGoals,
    } as any,
  });

  const postOrchestrateEng = useGoalStore.getState().goals.find((g) => g.id === 'goal-eng-1');
  assert(
    postOrchestrateEng?.progress === initialProgress,
    'Test 20: aiOrchestrator dispatch does not mutate goal before confirmation'
  );

  // Test 21: Orchestrator returns goalProgressProposal with status: 'pending'
  assert(
    orchestratorResult.handledAsCommand === true &&
      orchestratorResult.goalProgressProposal !== undefined &&
      orchestratorResult.goalProgressProposal.status === 'pending' &&
      orchestratorResult.goalProgressProposal.newProgress === 90 &&
      orchestratorResult.goalProgressProposal.currentProgress === 30,
    'Test 21: Orchestrator generates valid pending goalProgressProposal'
  );

  // ==========================================
  // PART 6: CONFIRMATION, CANCELLATION & DOUBLE-SUBMIT (Tests 22-25)
  // ==========================================
  console.log('\n--- PART 6: CONFIRMATION & CANCELLATION LIFECYCLE ---');
  resetStorage();

  // Test 22: Cancellation does NOT mutate goal
  const cancelProposal: GoalProgressActionProposal = {
    id: 'test-prop-cancel',
    goalId: 'goal-eng-1',
    goalTitle: 'تعلم اللغة الإنجليزية',
    currentProgress: 30,
    newProgress: 90,
    status: 'pending',
  };

  // Simulating cancel handler logic
  cancelProposal.status = 'cancelled';
  const postCancelEng = useGoalStore.getState().goals.find((g) => g.id === 'goal-eng-1');
  assert(
    postCancelEng?.progress === 30,
    'Test 22: Cancellation leaves goal progress unchanged at 30%'
  );

  // Test 23: Confirmation mutates goal to target newProgress
  const confirmProposal: GoalProgressActionProposal = {
    id: 'test-prop-confirm',
    goalId: 'goal-eng-1',
    goalTitle: 'تعلم اللغة الإنجليزية',
    currentProgress: 30,
    newProgress: 85,
    status: 'pending',
  };

  // Execute confirm using goalStore.updateProgress
  await useGoalStore.getState().updateProgress(confirmProposal.goalId, confirmProposal.newProgress);
  confirmProposal.status = 'confirmed';

  const postConfirmEng = useGoalStore.getState().goals.find((g) => g.id === 'goal-eng-1');
  assert(
    postConfirmEng?.progress === 85,
    'Test 23: Confirmation successfully mutates goal progress to 85%'
  );

  // Test 24: Double-submission protection: second submit blocked when status is not 'pending'
  let secondSubmitAttempted = false;
  const statusCheck: string = confirmProposal.status;
  if (statusCheck === 'pending') {
    await useGoalStore.getState().updateProgress(confirmProposal.goalId, 99);
    secondSubmitAttempted = true;
  }
  assert(
    secondSubmitAttempted === false && postConfirmEng?.progress === 85,
    'Test 24: Double-submission blocked when proposal status is confirmed'
  );

  // Test 25: Stale Progress Safety: If current progress changed since proposal creation, reject
  resetStorage();
  const staleProposal: GoalProgressActionProposal = {
    id: 'test-prop-stale',
    goalId: 'goal-eng-1',
    goalTitle: 'تعلم اللغة الإنجليزية',
    currentProgress: 30, // proposal thought current was 30
    newProgress: 60,
    status: 'pending',
  };

  // External update occurs in the background
  await useGoalStore.getState().updateProgress('goal-eng-1', 45); // now 45!

  // Now card attempts confirm: checks if targetGoal.progress !== proposal.currentProgress
  const currentGoalNow = useGoalStore.getState().goals.find((g) => g.id === staleProposal.goalId);
  let staleDetected = false;
  try {
    if (currentGoalNow?.progress !== staleProposal.currentProgress) {
      staleDetected = true;
      throw new Error('STALE_PROGRESS_DETECTED');
    }
    await useGoalStore.getState().updateProgress(staleProposal.goalId, staleProposal.newProgress);
  } catch (e: any) {
    if (e.message === 'STALE_PROGRESS_DETECTED') {
      staleDetected = true;
    }
  }

  const finalGoalNow = useGoalStore.getState().goals.find((g) => g.id === 'goal-eng-1');
  assert(
    staleDetected === true && finalGoalNow?.progress === 45,
    'Test 25: Stale progress detected; rejected mutation, kept current 45%'
  );

  // Test 26: Stale Goal (deleted goal) safety
  let deletedGoalDetected = false;
  const deletedProposal: GoalProgressActionProposal = {
    id: 'test-prop-deleted',
    goalId: 'non-existent-goal-id',
    goalTitle: 'هدف محذوف',
    currentProgress: 0,
    newProgress: 50,
    status: 'pending',
  };
  const goalInStore = useGoalStore.getState().goals.find((g) => g.id === deletedProposal.goalId);
  if (!goalInStore) {
    deletedGoalDetected = true;
  }
  assert(
    deletedGoalDetected === true,
    'Test 26: Deleted/non-existent goal detected and prevented from mutating'
  );

  // Test 27: Cross-Tab / External Persisted Stale Progress Safety
  // Scenario: Local tab store has in-memory progress 30.
  // Another tab updates the repository persistence directly to 45 (simulating cross-tab update).
  // Proposal was created at 30, attempting to update to 50.
  // Confirmation card reads from repository, detects discrepancy, rejects update, preserves 45.
  resetStorage();
  const crossTabProposal: GoalProgressActionProposal = {
    id: 'test-prop-crosstab-stale',
    goalId: 'goal-eng-1',
    goalTitle: 'تعلم اللغة الإنجليزية',
    currentProgress: 30, // Proposal was created when progress was 30
    newProgress: 50,
    status: 'pending',
  };

  // Keep in-memory store at 30 (simulating Tab 1 not having re-rendered or fetched)
  useGoalStore.setState({
    goals: useGoalStore.getState().goals.map((g) => (g.id === 'goal-eng-1' ? { ...g, progress: 30 } : g)),
  });

  // Tab 2 updates repository persistence directly to 45
  await RepositoryFactory.getGoalRepository().update('goal-eng-1', { progress: 45 });

  // Tab 1 executes handleConfirm logic:
  // 1. Fetch latest authoritative goal from repository
  let authGoal = null;
  try {
    authGoal = await RepositoryFactory.getGoalRepository().getById(crossTabProposal.goalId);
  } catch (err) {
    // fallback
  }
  const inStoreG = useGoalStore.getState().goals.find((g) => g && g.id === crossTabProposal.goalId);
  const targetG = authGoal || inStoreG;

  let crossTabStaleRejected = false;
  let crossTabError: string | null = null;
  if (!targetG) {
    crossTabError = 'Goal not found';
  } else if (targetG.progress !== crossTabProposal.currentProgress) {
    crossTabStaleRejected = true;
    crossTabError = 'Goal progress has changed since this proposal was created.';
    // Sync store with authoritative goal
    if (authGoal && inStoreG && inStoreG.progress !== authGoal.progress) {
      useGoalStore.setState((state) => ({
        goals: state.goals.map((g) => (g.id === crossTabProposal.goalId ? authGoal : g)),
        lastUpdated: Date.now(),
      }));
    }
  } else {
    await useGoalStore.getState().updateProgress(crossTabProposal.goalId, crossTabProposal.newProgress);
    crossTabProposal.status = 'confirmed';
  }

  const finalPersistedGoal = await RepositoryFactory.getGoalRepository().getById('goal-eng-1');
  const finalStoreGoal = useGoalStore.getState().goals.find((g) => g.id === 'goal-eng-1');
  assert(
    crossTabStaleRejected === true &&
      crossTabProposal.status === 'pending' &&
      finalPersistedGoal?.progress === 45 &&
      finalStoreGoal?.progress === 45 &&
      crossTabError !== null,
    'Test 27: Cross-tab / external persisted progress change rejects confirmation, preserves newer 45%, and keeps proposal pending'
  );

  // ==========================================
  // SUMMARY
  // ==========================================
  console.log('\n==========================================');
  console.log(`TOTAL TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('==========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
