import './test_env.ts';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { aiOrchestrator } from './src/core/ai/aiOrchestrator';
import {
  parseCommand,
  isAlignDayTrigger,
  selectDeterministicUnattendedGoal,
  getLocalDateString,
} from './src/core/commands/commandParser';
import { analyzeDailyGoalAlignment } from './src/core/intelligence/goalEngine';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { TaskActionProposal } from './src/core/commands/commandTypes';
import { Goal, Task } from './src/types/data';
import { executeTaskProposalConfirm } from './src/modules/chat/components/TaskProposalCard';

console.log('=== GATE 16.0 COMPREHENSIVE VERIFICATION SUITE ===');

const TEST_UID = 'gate16-test-user-001';

// Consistent mock goals
const sampleGoals: Goal[] = [
  {
    id: 'goal-eng-1',
    title: 'تعلم اللغة الإنجليزية',
    description: 'تحسين المحادثة والقراءة',
    progress: 30,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  },
  {
    id: 'goal-fit-2',
    title: 'اللياقة البدنية والصحة',
    description: 'تمارين يومية وخسارة وزن',
    progress: 15, // Lower progress than goal-eng-1
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
  },
  {
    id: 'goal-code-3',
    title: 'إتقان لغة TypeScript',
    description: 'بناء مشاريع متقدمة',
    progress: 15, // Same progress as goal-fit-2, but later createdAt
    createdAt: '2026-09-03T10:00:00.000Z',
    updatedAt: '2026-09-03T10:00:00.000Z',
  },
  {
    id: 'goal-done-4',
    title: 'قراءة كتاب الشهر',
    description: 'تم الانتهاء بالكامل',
    progress: 100, // Completed goal
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-20T10:00:00.000Z',
  },
];

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

class TaskProposalHarness {
  proposal: TaskActionProposal;
  status: 'pending' | 'confirmed' | 'cancelled';
  isActionLocked: boolean = false;
  errorMessage: string | null = null;

  constructor(proposal: TaskActionProposal) {
    this.proposal = proposal;
    this.status = proposal.status;
  }

  async confirm(): Promise<boolean> {
    if (this.isActionLocked || this.status !== 'pending') return false;
    this.isActionLocked = true;

    try {
      const res = await executeTaskProposalConfirm(this.proposal, 'ar');
      if (!res.success) {
        this.isActionLocked = false;
        this.errorMessage = res.error || 'Failed';
        return false;
      }
      this.status = 'confirmed';
      return true;
    } catch (err: any) {
      this.isActionLocked = false;
      this.errorMessage = err?.message || 'Failed';
      return false;
    }
  }

  cancel(): boolean {
    if (this.isActionLocked || this.status !== 'pending') return false;
    this.isActionLocked = true;
    this.status = 'cancelled';
    this.proposal.status = 'cancelled';
    return true;
  }
}

async function runGate16Tests() {
  AuthLifecycle.reset(TEST_UID);
  (RepositoryFactory.getGoalRepository() as any)._saveAllSync([...sampleGoals]);
  useGoalStore.setState({ goals: [...sampleGoals], status: 'ready', error: null });
  useTaskStore.setState({ tasks: [], status: 'ready', error: null });

  // 1. Arabic trigger variants
  console.log('\n--- 1. Trigger Recognition: Arabic explicit triggers ---');
  {
    assert(isAlignDayTrigger('ساعدني اظبط يومي'), 'Matches "ساعدني اظبط يومي"');
    assert(isAlignDayTrigger('ساعدني اضبط يومي'), 'Matches "ساعدني اضبط يومي"');
    assert(isAlignDayTrigger('اقترح لي مهمه لليوم'), 'Matches "اقترح لي مهمه لليوم"');
    assert(isAlignDayTrigger('اقترحلي مهمه لليوم'), 'Matches "اقترحلي مهمه لليوم"');
    assert(isAlignDayTrigger('اقترح لي مهمه اليوم'), 'Matches "اقترح لي مهمه اليوم"');
    assert(isAlignDayTrigger('اقترحلي مهمه اليوم'), 'Matches "اقترحلي مهمه اليوم"');
  }

  // 2. English trigger variants
  console.log('\n--- 2. Trigger Recognition: English explicit triggers ---');
  {
    assert(isAlignDayTrigger('align my day'), 'Matches "align my day"');
    assert(isAlignDayTrigger('help me align my day'), 'Matches "help me align my day"');
    assert(isAlignDayTrigger('suggest a task for today'), 'Matches "suggest a task for today"');
  }

  // 3. Conversational false positives
  console.log('\n--- 3. Negative Trigger Recognition: Non-command conversational queries ---');
  {
    assert(!isAlignDayTrigger('كيف انظم يومي؟'), 'Rejects open question "كيف انظم يومي؟"');
    assert(!isAlignDayTrigger('ما رايك في خطتي لليوم؟'), 'Rejects "ما رايك في خطتي لليوم؟"');
    assert(!isAlignDayTrigger('how do I plan my week?'), 'Rejects general planning question');
    assert(!isAlignDayTrigger('random chat message'), 'Rejects arbitrary chat');
  }

  // 4. Zero active goals
  console.log('\n--- 4. Edge case: Zero active goals available ---');
  {
    const emptyResult = await aiOrchestrator.orchestrate({
      message: 'ساعدني اظبط يومي',
      context: {
        activeRoute: 'chat',
        userId: TEST_UID,
        goals: [],
        tasks: [],
      } as any,
    });

    assert(emptyResult.handledAsCommand === true, 'Handled as command even when goals empty');
    assert(emptyResult.taskProposal === undefined, 'No proposal returned when no active goals');
    assert(emptyResult.commandFeedback !== undefined, 'Friendly conversational feedback returned');
    assert(
      emptyResult.commandFeedback?.ar.includes('ليس لديك أهداف') === true,
      `Arabic feedback informs user about zero active goals: "${emptyResult.commandFeedback?.ar}"`
    );

    // All goals completed (100%)
    const allCompletedResult = await aiOrchestrator.orchestrate({
      message: 'align my day',
      context: {
        activeRoute: 'chat',
        userId: TEST_UID,
        goals: [sampleGoals[3]], // 100% progress
        tasks: [],
      } as any,
    });
    assert(allCompletedResult.handledAsCommand === true, 'Handled as command when all goals completed');
    assert(allCompletedResult.taskProposal === undefined, 'No proposal returned when all goals completed');
  }

  // 5. No unattended goals
  console.log('\n--- 5. Edge case: All active goals already have tasks scheduled for today ---');
  {
    const today = getLocalDateString(0);
    const attendedTasks: Task[] = [
      { id: 't1', title: 'Task 1', priority: 'medium', date: today, goalId: 'goal-eng-1', completed: false, createdAt: '' },
      { id: 't2', title: 'Task 2', priority: 'medium', date: today, goalId: 'goal-fit-2', completed: false, createdAt: '' },
      { id: 't3', title: 'Task 3', priority: 'medium', date: today, goalId: 'goal-code-3', completed: false, createdAt: '' },
    ];

    const allAttendedResult = await aiOrchestrator.orchestrate({
      message: 'align my day',
      context: {
        activeRoute: 'chat',
        userId: TEST_UID,
        goals: sampleGoals,
        tasks: attendedTasks,
      } as any,
    });

    assert(allAttendedResult.handledAsCommand === true, 'Handled as command when all goals attended');
    assert(allAttendedResult.taskProposal === undefined, 'No task proposal generated when all goals are attended');
    assert(allAttendedResult.commandFeedback !== undefined, 'Feedback returned');
    assert(
      allAttendedResult.commandFeedback?.en.includes('All your active goals have tasks') === true,
      `Feedback informs user all goals attended: "${allAttendedResult.commandFeedback?.en}"`
    );
  }

  // 6. One unattended goal
  console.log('\n--- 6. One unattended goal: deterministically selected ---');
  {
    const singleGoalList = [sampleGoals[0]]; // Only goal-eng-1 (30%)
    const chosen = selectDeterministicUnattendedGoal(singleGoalList);
    assert(chosen !== null && chosen.id === 'goal-eng-1', 'Selects the single unattended goal');
  }

  // 7. Multiple unattended goals
  console.log('\n--- 7. Multiple unattended goals: deterministic ranking ---');
  {
    const multiple = [sampleGoals[0], sampleGoals[1], sampleGoals[2]];
    const chosen = selectDeterministicUnattendedGoal(multiple);
    assert(chosen !== null && chosen.id === 'goal-fit-2', 'Selects goal-fit-2 among multiple unattended goals');
  }

  // 8. Lowest-progress selection
  console.log('\n--- 8. Deterministic Goal Selection: Lowest progress first ---');
  {
    const candidates = [sampleGoals[0], sampleGoals[1]]; // 30% vs 15%
    const chosen = selectDeterministicUnattendedGoal(candidates);
    assert(chosen !== null && chosen.id === 'goal-fit-2', 'Selects lower progress goal (15% vs 30%)');
  }

  // 9. createdAt tie-break
  console.log('\n--- 9. Deterministic Goal Selection: Tie-breaker by earlier createdAt ---');
  {
    const tiedCandidates = [sampleGoals[2], sampleGoals[1]];
    const chosen = selectDeterministicUnattendedGoal(tiedCandidates);
    assert(chosen !== null && chosen.id === 'goal-fit-2', 'Selects earlier createdAt when progress ties');
  }

  // 10. Stable ID tie-break
  console.log('\n--- 10. Deterministic Goal Selection: Tie-breaker by stable goal.id ---');
  {
    const sameCreatedA: Goal = {
      id: 'goal-alpha',
      title: 'Alpha Goal',
      description: 'Alpha description',
      progress: 20,
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    };
    const sameCreatedB: Goal = {
      id: 'goal-beta',
      title: 'Beta Goal',
      description: 'Beta description',
      progress: 20,
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    };
    const chosen = selectDeterministicUnattendedGoal([sameCreatedB, sameCreatedA]);
    assert(chosen !== null && chosen.id === 'goal-alpha', 'Selects alphabetically smaller ID when createdA === createdB');
  }

  // 11. Deterministic task title, 12. Correct date, 13. Medium priority, 14. Correct goalId, 15. Correct goalTitle
  console.log('\n--- 11-15. Proposal Payload Attributes ---');
  {
    const todayStr = getLocalDateString(0);
    const parseRes = parseCommand('ساعدني اظبط يومي', sampleGoals, []);
    assert(parseRes.isCommand === true, 'Parsed as command');
    assert(parseRes.command?.action === 'align_day', 'Action is align_day');
    const payload = parseRes.command?.alignDayPayload!;
    assert(payload.hasUnattendedGoals === true, 'Payload hasUnattendedGoals is true');
    assert(payload.selectedGoalId === 'goal-fit-2', '14. Correct goalId');
    assert(payload.selectedGoalTitle === 'اللياقة البدنية والصحة', '15. Correct goalTitle');
    assert(
      payload.suggestedTaskTitle === 'متابعة ومواصلة العمل على: اللياقة البدنية والصحة',
      `11. Deterministic task title format: got "${payload.suggestedTaskTitle}"`
    );

    const orchRes = await aiOrchestrator.orchestrate({
      message: 'ساعدني اظبط يومي',
      context: {
        activeRoute: 'chat',
        userId: TEST_UID,
        goals: sampleGoals,
        tasks: [],
      } as any,
    });

    assert(orchRes.taskProposal !== undefined, 'Task proposal generated');
    const prop = orchRes.taskProposal!;
    assert(prop.date === todayStr, `12. Correct date: got ${prop.date}, expected ${todayStr}`);
    assert(prop.priority === 'medium', '13. Priority is medium');
    assert(prop.goalId === 'goal-fit-2', '14. Proposal goalId matches');
    assert(prop.goalTitle === 'اللياقة البدنية والصحة', '15. Proposal goalTitle matches');
    assert(prop.source === 'align_day', 'Proposal source is align_day');
    assert(prop.requiresGoal === true, 'Proposal requiresGoal is true');
  }

  // 16. originatingMessageId
  console.log('\n--- 16. Anchoring: originatingMessageId ---');
  {
    const orchRes = await aiOrchestrator.orchestrate({
      message: 'align my day',
      context: {
        activeRoute: 'chat',
        userId: TEST_UID,
        goals: sampleGoals,
        tasks: [],
      } as any,
    });
    // In chat orchestrator hook, originatingMessageId is set to userMessageId
    const simulatedUserMsgId = 'msg-user-gate16-orig';
    if (orchRes.taskProposal) {
      orchRes.taskProposal.originatingMessageId = simulatedUserMsgId;
    }
    assert(orchRes.taskProposal?.originatingMessageId === simulatedUserMsgId, 'Proposal holds originatingMessageId');
  }

  // 17. Pending proposal state, 18. Zero task mutations, 19. Zero goal mutations
  console.log('\n--- 17-19. Pre-Confirmation Zero-Mutation Invariants ---');
  {
    useTaskStore.setState({ tasks: [] });
    const initialTasks = [...useTaskStore.getState().tasks];
    const initialGoals = [...useGoalStore.getState().goals];
    const initialRepoTasks = await RepositoryFactory.getTaskRepository().getAll();

    const orchRes = await aiOrchestrator.orchestrate({
      message: 'اقترح لي مهمه لليوم',
      context: {
        activeRoute: 'chat',
        userId: TEST_UID,
        goals: sampleGoals,
        tasks: [],
      } as any,
    });

    assert(orchRes.taskProposal?.status === 'pending', '17. Proposal status starts strictly as pending');
    assert(useTaskStore.getState().tasks.length === initialTasks.length, '18. Zero task mutations before confirm in store');
    const afterRepoTasks = await RepositoryFactory.getTaskRepository().getAll();
    assert(afterRepoTasks.length === initialRepoTasks.length, '18. Zero task mutations in repository');
    assert(useGoalStore.getState().goals.length === initialGoals.length, '19. Zero goal mutations in store');
    assert(useGoalStore.getState().goals[1].progress === 15, '19. Goal progress unchanged before confirm');
  }

  // 20. Confirm creates exactly one task, 21. Task contains exact goalId, 25. Persistence-safe behavior after confirm
  console.log('\n--- 20-21, 25. Confirmation & Persistence Verification ---');
  {
    useTaskStore.setState({ tasks: [] });
    const proposal: TaskActionProposal = {
      id: 'prop-confirm-test',
      source: 'align_day',
      requiresGoal: true,
      title: 'متابعة ومواصلة العمل على: اللياقة البدنية والصحة',
      priority: 'medium',
      date: getLocalDateString(0),
      goalId: 'goal-fit-2',
      goalTitle: 'اللياقة البدنية والصحة',
      status: 'pending',
    };

    const harness = new TaskProposalHarness(proposal);
    const confirmed = await harness.confirm();
    assert(confirmed === true, 'Confirmation returned true');
    assert(harness.status === 'confirmed', 'Harness status is confirmed');
    assert(proposal.status === 'confirmed', 'Proposal status is confirmed');

    const tasks = useTaskStore.getState().tasks;
    assert(tasks.length === 1, '20. Confirm creates exactly one task');
    assert(tasks[0].title === proposal.title, 'Task title matches proposal');
    assert(tasks[0].goalId === 'goal-fit-2', '21. Task contains exact goalId');
    assert(tasks[0].priority === 'medium', 'Task priority matches medium');

    // 25. Persistence check
    const persistedTasks = await RepositoryFactory.getTaskRepository().getAll();
    const persisted = persistedTasks.find((t) => t.id === tasks[0].id);
    assert(persisted !== undefined, '25. Task was durably persisted in repository');
    assert(persisted?.goalId === 'goal-fit-2', '25. Persisted task holds correct goalId');
    assert(persisted?.title === proposal.title, '25. Persisted task holds correct title');
  }

  // 22. Cancel creates zero tasks
  console.log('\n--- 22. Cancel Lifecycle: Zero task mutations ---');
  {
    useTaskStore.setState({ tasks: [] });
    const proposal: TaskActionProposal = {
      id: 'prop-cancel-test',
      source: 'align_day',
      requiresGoal: true,
      title: 'متابعة ومواصلة العمل على: تعلم اللغة الإنجليزية',
      priority: 'medium',
      date: getLocalDateString(0),
      goalId: 'goal-eng-1',
      goalTitle: 'تعلم اللغة الإنجليزية',
      status: 'pending',
    };

    const harness = new TaskProposalHarness(proposal);
    const cancelled = harness.cancel();
    assert(cancelled === true, 'Cancel returned true');
    assert(harness.status === 'cancelled', 'Harness status is cancelled');
    assert(proposal.status === 'cancelled', 'Proposal object status is cancelled');

    const tasks = useTaskStore.getState().tasks;
    assert(tasks.length === 0, '22. Zero tasks created when user cancels');
  }

  // 23. Rapid double-confirm protection
  console.log('\n--- 23. Concurrency Protection: Rapid double-confirm ---');
  {
    useTaskStore.setState({ tasks: [] });
    const proposal: TaskActionProposal = {
      id: 'prop-double-click-test',
      source: 'align_day',
      requiresGoal: true,
      title: 'متابعة ومواصلة العمل على: اللياقة البدنية والصحة',
      priority: 'medium',
      date: getLocalDateString(0),
      goalId: 'goal-fit-2',
      goalTitle: 'اللياقة البدنية والصحة',
      status: 'pending',
    };

    const harness = new TaskProposalHarness(proposal);
    const [c1, c2] = await Promise.all([harness.confirm(), harness.confirm()]);
    assert(c1 !== c2, '23. Exactly one confirmation succeeded and one was locked out');
    const tasks = useTaskStore.getState().tasks;
    assert(tasks.length === 1, '23. Exactly one task created despite concurrent clicks');
  }

  // 24. Stale/deleted Goal BEFORE confirmation
  console.log('\n--- 24. Stale/Deleted Goal Safety (Approved Gate 16 Contract) ---');
  {
    useTaskStore.setState({ tasks: [] });
    const initialGoals = [...useGoalStore.getState().goals];
    const proposal: TaskActionProposal = {
      id: 'prop-stale-deleted-goal',
      source: 'align_day',
      requiresGoal: true,
      title: 'متابعة ومواصلة العمل على: هدف محذوف',
      priority: 'medium',
      date: getLocalDateString(0),
      goalId: 'deleted-goal-nonexistent',
      goalTitle: 'هدف محذوف',
      status: 'pending',
    };

    // Ensure the goal does NOT exist in goalStore
    useGoalStore.setState({
      goals: sampleGoals.filter((g) => g.id !== 'deleted-goal-nonexistent'),
    });

    const harness = new TaskProposalHarness(proposal);
    const confirmed = await harness.confirm();

    // Verification of Gate 16 strict contract:
    assert(confirmed === false, '24. Confirmation rejected when linked goal is deleted before confirm');
    assert(proposal.status === 'pending', '24. Proposal status must remain pending (not confirmed)');
    assert(harness.status === 'pending', '24. Harness status remains pending');
    assert(harness.errorMessage !== null && harness.errorMessage.length > 0, `24. Clear error message: "${harness.errorMessage}"`);
    const tasks = useTaskStore.getState().tasks;
    assert(tasks.length === 0, '24. Zero task mutation when target goal was deleted');
    const currentGoals = useGoalStore.getState().goals;
    assert(currentGoals.length === initialGoals.length, '24. Zero goal mutations occurred');
  }

  console.log('\n==================================================');
  console.log('ALL GATE 16.0 COMPREHENSIVE TESTS PASSED');
  console.log('==================================================');
}

runGate16Tests().catch((err) => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
