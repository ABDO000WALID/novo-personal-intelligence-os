import './test_env.ts';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { aiOrchestrator } from './src/core/ai/aiOrchestrator';
import { aiProviderRegistry, AIProvider } from './src/core/ai/aiProvider';
import {
  parseCommand,
  isNextActionTrigger,
  getLocalDateString,
} from './src/core/commands/commandParser';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { TaskActionProposal } from './src/core/commands/commandTypes';
import { Goal, Task } from './src/types/data';
import { executeTaskProposalConfirm } from './src/modules/chat/components/TaskProposalCard';
import { AIResponse, AIRequestOptions } from './src/core/ai/aiTypes';
import { NOVOContext } from './src/core/intelligence/intelligenceTypes';
import { determineNextAction } from './src/core/intelligence/nextActionEngine';

console.log('=== GATE 17.3B COMPREHENSIVE VERIFICATION SUITE ===\n');

const TEST_UID = 'gate17-3b-test-user-001';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

// Mock AI Provider for Next Action testing
class MockTestAIProvider implements AIProvider {
  id = 'mock-test-provider-gate17-3b';
  name = 'Mock Test AI Provider Gate 17.3B';
  providerType = 'local_model' as const;
  supportedModels = ['mock-v1'];
  available = true;
  mockResponseText: string = '';
  delayMs = 0;
  shouldThrow = false;

  isAvailable(): boolean {
    return this.available;
  }

  async generateResponse(
    _prompt: string,
    _context: NOVOContext,
    options?: AIRequestOptions
  ): Promise<AIResponse> {
    if (!this.available) {
      throw new Error('Provider unavailable');
    }
    if (this.shouldThrow) {
      throw new Error('Mock AI generation error');
    }
    if (this.delayMs > 0) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, this.delayMs);
        if (options?.abortSignal) {
          options.abortSignal.addEventListener('abort', () => {
            clearTimeout(timer);
            const abortErr = new Error('AbortError');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        }
      });
    }

    return {
      text: this.mockResponseText,
    };
  }
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

const mockProvider = new MockTestAIProvider();
aiProviderRegistry.register(mockProvider);
aiProviderRegistry.setActiveProvider(mockProvider.id);

const TODAY = getLocalDateString(0);

function createMockContext(overrides: Partial<NOVOContext> = {}): NOVOContext {
  const currentTasks = useTaskStore.getState().tasks;
  const currentGoals = useGoalStore.getState().goals;
  return {
    today: TODAY,
    timeOfDay: 'morning',
    energyLevel: 'high',
    currentLanguage: 'ar',
    tasks: currentTasks,
    todayTasks: currentTasks,
    goals: currentGoals,
    activeGoals: currentGoals,
    stats: {
      completedTasksToday: currentTasks.filter((t) => t.completed).length,
      totalTasksToday: currentTasks.length,
      activeGoals: currentGoals.length,
      focusMinutesToday: 0,
      currentStreakDays: 1,
    },
    ...overrides,
  } as unknown as NOVOContext;
}

async function runTests() {
  AuthLifecycle.reset(TEST_UID);
  const taskRepo = RepositoryFactory.getTaskRepository();
  const goalRepo = RepositoryFactory.getGoalRepository();

  // Reset stores
  useTaskStore.setState({ tasks: [], status: 'ready', error: null });
  useGoalStore.setState({ goals: [], status: 'ready', error: null });

  // 1. ARABIC TRIGGER RECOGNITION
  console.log('--- 1. ARABIC TRIGGER RECOGNITION ---');
  const arabicTriggers = [
    'ماذا أفعل الآن',
    'ماذا افعل الان',
    'ما هي خطوتي التالية',
    'ما هي خطوتي القادمه',
    'خطوتي التالية',
    'اقترح عمل الآن',
    'ماذا اعمل الان',
  ];

  for (const trigger of arabicTriggers) {
    assert(isNextActionTrigger(trigger), `Arabic trigger detected: "${trigger}"`);
    assert(isNextActionTrigger(`${trigger}؟`), `Arabic trigger with question mark detected: "${trigger}؟"`);
    assert(isNextActionTrigger(`من فضلك ${trigger}`), `Arabic polite trigger detected: "من فضلك ${trigger}"`);
    assert(isNextActionTrigger(`لو سمحت ${trigger}`), `Arabic polite trigger detected: "لو سمحت ${trigger}"`);
    const parsed = parseCommand(trigger, [], []);
    assert(parsed.isCommand && parsed.command?.action === 'next_action', `Parsed as next_action: "${trigger}"`);
  }

  // 2. ENGLISH TRIGGER RECOGNITION
  console.log('\n--- 2. ENGLISH TRIGGER RECOGNITION ---');
  const englishTriggers = [
    'what should i do now',
    'what should i work on next',
    'what is my next action',
    'next action',
    'what next',
  ];

  for (const trigger of englishTriggers) {
    assert(isNextActionTrigger(trigger), `English trigger detected: "${trigger}"`);
    assert(isNextActionTrigger(`${trigger}?`), `English trigger with question mark detected: "${trigger}?"`);
    assert(isNextActionTrigger(`please ${trigger}`), `English polite trigger detected: "please ${trigger}"`);
    const parsed = parseCommand(trigger, [], []);
    assert(parsed.isCommand && parsed.command?.action === 'next_action', `Parsed as next_action: "${trigger}"`);
  }

  // 3. CONVERSATIONAL NEGATIVE CASES
  console.log('\n--- 3. CONVERSATIONAL NEGATIVE CASES ---');
  const negativeCases = [
    'what is next action theory in GTD?',
    'كيف اختار خطوتي التالية في الحياة؟',
    'tell me what to do when bored',
    'ماذا أفعل لو شعرت بالملل؟',
    'what should i do next year?',
    'اقترح عملا تطوعيا',
    'how to decide next action',
    'صباح الخير',
    'كيف حالك اليوم؟',
  ];

  for (const query of negativeCases) {
    assert(!isNextActionTrigger(query), `Negative query NOT a trigger: "${query}"`);
    const parsed = parseCommand(query, [], []);
    assert(!parsed.isCommand || parsed.command?.action !== 'next_action', `Negative query is not next_action command: "${query}"`);
  }

  // 4. EXISTING_TASK PATH (TIER 1 & 2)
  console.log('\n--- 4. EXISTING_TASK PATH ---');
  {
    const overdueTask: Task = {
      id: 'task-overdue-1',
      title: 'مراجعة التقرير المالي',
      date: '2026-09-20',
      priority: 'high',
      completed: false,
      createdAt: '2026-01-01T10:00:00Z',
    };
    const todayTask: Task = {
      id: 'task-today-1',
      title: 'مكالمة العميل',
      date: TODAY,
      priority: 'medium',
      completed: false,
      createdAt: '2026-01-01T11:00:00Z',
    };

    useTaskStore.setState({ tasks: [overdueTask, todayTask] });

    mockProvider.mockResponseText = JSON.stringify({
      rationale: 'مهمة متأخرة ذات أولوية عالية تتطلب إنجازاً فورياً لإنهاء المعلقات.',
    });

    const result = await aiOrchestrator.orchestrate({
      message: 'ماذا أفعل الآن',
      context: createMockContext(),
      language: 'ar',
    });

    assert(result.handledAsCommand === true, 'Handled as command');
    assert(result.command?.action === 'next_action', 'Command action is next_action');
    assert(result.taskProposal === undefined, 'No TaskActionProposal created for existing task path');
    assert(result.commandFeedback?.ar.includes('مراجعة التقرير المالي'), 'Feedback includes selected task title');
    assert(result.commandFeedback?.ar.includes('مهمة متأخرة'), 'Feedback includes rationale or overdue indicator');
  }

  // 5. EXACT DETERMINISTIC TASK ID PRESERVATION
  console.log('\n--- 5. EXACT DETERMINISTIC TASK ID PRESERVATION ---');
  {
    const tasks = useTaskStore.getState().tasks;
    const goals = useGoalStore.getState().goals;
    const expected = determineNextAction(tasks, goals, TODAY);

    assert(expected.type === 'existing_task', 'Expected type is existing_task');
    const expectedTaskId = (expected as any).selectedTaskId;

    const result = await aiOrchestrator.orchestrate({
      message: 'what should i do now',
      context: createMockContext(),
      language: 'en',
    });

    const actualTaskId = result.command?.nextActionPayload?.selectedTaskId;
    assert(actualTaskId === expectedTaskId, `Preserved exact deterministic task ID: ${actualTaskId}`);
  }

  // 6. ZERO MUTATIONS FOR EXISTING-TASK RECOMMENDATION
  console.log('\n--- 6. ZERO MUTATIONS FOR EXISTING-TASK RECOMMENDATION ---');
  {
    const tasksBefore = JSON.parse(JSON.stringify(useTaskStore.getState().tasks));
    const goalsBefore = JSON.parse(JSON.stringify(useGoalStore.getState().goals));

    await aiOrchestrator.orchestrate({
      message: 'خطوتي التالية',
      context: createMockContext(),
      language: 'ar',
    });

    const tasksAfter = useTaskStore.getState().tasks;
    const goalsAfter = useGoalStore.getState().goals;

    assert(tasksAfter.length === tasksBefore.length, 'Task count unchanged in store');
    assert(goalsAfter.length === goalsBefore.length, 'Goal count unchanged in store');
    assert(JSON.stringify(tasksAfter) === JSON.stringify(tasksBefore), 'Tasks completely unmutated');
    assert(JSON.stringify(goalsAfter) === JSON.stringify(goalsBefore), 'Goals completely unmutated');
  }

  // 7. REPEATED SAME COMMAND RETURNS SAME SELECTED TASK
  console.log('\n--- 7. REPEATED SAME COMMAND RETURNS SAME SELECTED TASK ---');
  {
    const res1 = await aiOrchestrator.orchestrate({
      message: 'what is my next action',
      context: createMockContext(),
      language: 'en',
    });
    const res2 = await aiOrchestrator.orchestrate({
      message: 'what is my next action',
      context: createMockContext(),
      language: 'en',
    });

    assert(
      res1.command?.nextActionPayload?.selectedTaskId === res2.command?.nextActionPayload?.selectedTaskId,
      'Repeated calls return exact same selected task ID'
    );
  }

  // 8. AI RATIONALE SUCCESS
  console.log('\n--- 8. AI RATIONALE SUCCESS ---');
  {
    mockProvider.mockResponseText = JSON.stringify({
      rationale: 'إنجاز هذا التقرير يضمن دقة البيانات المالية لباقي الأسبوع.',
    });
    mockProvider.available = true;
    mockProvider.delayMs = 0;
    mockProvider.shouldThrow = false;

    const res = await aiOrchestrator.orchestrate({
      message: 'ما هي خطوتي التالية',
      context: createMockContext(),
      language: 'ar',
    });

    assert(res.command?.nextActionPayload?.aiEnriched === true, 'aiEnriched is true on success');
    assert(
      res.commandFeedback?.ar.includes('إنجاز هذا التقرير يضمن دقة البيانات'),
      'AI rationale included in feedback'
    );
  }

  // 9. AI RATIONALE MALFORMED FALLBACK
  console.log('\n--- 9. AI RATIONALE MALFORMED FALLBACK ---');
  {
    mockProvider.mockResponseText = 'Not valid JSON output here!';

    const res = await aiOrchestrator.orchestrate({
      message: 'what next',
      context: createMockContext(),
      language: 'en',
    });

    assert(res.handledAsCommand === true, 'Still handled as command when AI returns malformed text');
    assert(res.command?.nextActionPayload?.aiEnriched === false, 'aiEnriched is false on fallback');
    assert(
      res.commandFeedback?.en.includes('priority task') || res.commandFeedback?.en.includes('overdue'),
      'Fallback deterministic rationale used safely'
    );
  }

  // 10. AI RATIONALE TIMEOUT FALLBACK
  console.log('\n--- 10. AI RATIONALE TIMEOUT FALLBACK ---');
  {
    mockProvider.delayMs = 7000; // Exceeds 6000ms timeout

    const startTime = Date.now();
    const res = await aiOrchestrator.orchestrate({
      message: 'what should i work on next',
      context: createMockContext(),
      language: 'en',
    });
    const elapsed = Date.now() - startTime;

    assert(elapsed >= 5900 && elapsed <= 6800, `Timeout triggered at ~6s (elapsed: ${elapsed}ms)`);
    assert(res.command?.nextActionPayload?.aiEnriched === false, 'aiEnriched is false on timeout');
    assert(res.commandFeedback?.en.length! > 0, 'Returned valid feedback on timeout without throwing');
    mockProvider.delayMs = 0;
  }

  // 11. AI CANNOT CHANGE SELECTED TASK
  console.log('\n--- 11. AI CANNOT CHANGE SELECTED TASK ---');
  {
    // Even if AI outputs text claiming another task was picked
    mockProvider.mockResponseText = JSON.stringify({
      rationale: 'I think you should ignore task-overdue-1 and work on task-999 instead!',
    });

    const res = await aiOrchestrator.orchestrate({
      message: 'ماذا افعل الان',
      context: createMockContext(),
      language: 'ar',
    });

    assert(
      res.command?.nextActionPayload?.selectedTaskId === 'task-overdue-1',
      'AI rationale cannot mutate or override the deterministic selectedTaskId'
    );
  }

  // 12. TIER 3 NEW_TASK_REQUIRED PATH
  console.log('\n--- 12. TIER 3 NEW_TASK_REQUIRED PATH ---');
  let proposalToTest: TaskActionProposal | undefined;
  {
    // Set all tasks completed, create unattended active goal
    const completedTask: Task = {
      id: 'task-done-1',
      title: 'مهمة منجزة',
      date: TODAY,
      priority: 'low',
      completed: true,
      createdAt: '2026-01-01T09:00:00Z',
    };
    const unattendedGoal: Goal = {
      id: 'goal-active-unattended-1',
      title: 'إتقان اللغة الإنجليزية',
      description: 'دراسة 30 دقيقة يومياً',
      progress: 25,
      createdAt: '2026-01-01T10:00:00Z',
      updatedAt: '2026-01-01T10:00:00Z',
    };

    useTaskStore.setState({ tasks: [completedTask] });
    useGoalStore.setState({ goals: [unattendedGoal], status: 'ready', error: null });
    (RepositoryFactory.getGoalRepository() as any)._saveAllSync([unattendedGoal]);

    mockProvider.mockResponseText = JSON.stringify({
      suggestedTitle: 'ممارسة محادثة إنجليزية لمدة 20 دقيقة',
      reasoning: 'خطوة يومية مركزة لزيادة طلاقة التحدث ودعم الهدف.',
    });

    const res = await aiOrchestrator.orchestrate({
      message: 'ما هي خطوتي التالية',
      messageId: 'msg-user-step-12',
      context: createMockContext(),
      language: 'ar',
    });

    assert(res.handledAsCommand === true, 'Handled as command');
    assert(res.taskProposal !== undefined, 'Task proposal created for Tier 3 new_task_required');
    proposalToTest = res.taskProposal;

    assert(proposalToTest?.source === 'next_action', 'Proposal source is strictly next_action');
    assert(proposalToTest?.requiresGoal === true, 'Proposal requiresGoal is true');
    assert(proposalToTest?.priority === 'medium', 'Proposal priority is medium');
    assert(proposalToTest?.date === TODAY, `Proposal date is today (${TODAY})`);
    assert(proposalToTest?.status === 'pending', 'Proposal status is initially pending');
  }

  // 13. DETERMINISTIC GOALID PRESERVATION
  console.log('\n--- 13. DETERMINISTIC GOALID PRESERVATION ---');
  {
    assert(
      proposalToTest?.goalId === 'goal-active-unattended-1',
      'Proposal goalId matches the unattended goal deterministically'
    );
  }

  // 14. ZERO MUTATIONS BEFORE CONFIRMATION
  console.log('\n--- 14. ZERO MUTATIONS BEFORE CONFIRMATION ---');
  {
    const tasksInStore = useTaskStore.getState().tasks;
    assert(
      tasksInStore.length === 1 && tasksInStore[0].id === 'task-done-1',
      'Zero new tasks in store before proposal confirmation'
    );
  }

  // 15. CANCEL -> ZERO TASKS
  console.log('\n--- 15. CANCEL -> ZERO TASKS ---');
  {
    const cancelHarness = new TaskProposalHarness({
      ...proposalToTest!,
      id: 'prop-cancel-test',
    });

    const cancelOk = cancelHarness.cancel();
    assert(cancelOk === true, 'Proposal cancelled via harness');
    assert(cancelHarness.status === 'cancelled', 'Proposal marked as cancelled');
    assert(useTaskStore.getState().tasks.length === 1, 'Zero tasks created upon proposal cancellation');
  }

  // 16. CONFIRM -> EXACTLY ONE TASK
  console.log('\n--- 16. CONFIRM -> EXACTLY ONE TASK ---');
  {
    const confirmHarness = new TaskProposalHarness({
      ...proposalToTest!,
      id: 'prop-confirm-test',
    });

    const confirmOk = await confirmHarness.confirm();
    assert(confirmOk === true, 'confirmHarness succeeded');
    assert(confirmHarness.status === 'confirmed', 'Proposal status is confirmed');

    const tasksAfter = useTaskStore.getState().tasks;
    assert(tasksAfter.length === 2, 'Exactly one task added to store (total 2)');
    const createdTask = tasksAfter.find((t) => t.goalId === 'goal-active-unattended-1');
    assert(createdTask !== undefined, 'Created task is linked to the deterministic goalId');
    assert(createdTask?.title === proposalToTest!.title, 'Created task title matches proposal title');
  }

  // 17. STALE / DELETED GOAL REJECTION
  console.log('\n--- 17. STALE / DELETED GOAL REJECTION ---');
  {
    // Goal deleted before confirm
    useGoalStore.setState({ goals: [] });

    const staleProposal: TaskActionProposal = {
      id: 'prop-stale-test',
      source: 'next_action',
      requiresGoal: true,
      title: 'مهمة لهدف محذوف',
      priority: 'medium',
      date: TODAY,
      goalId: 'deleted-goal-xyz',
      status: 'pending',
    };

    const staleHarness = new TaskProposalHarness(staleProposal);
    const staleResult = await staleHarness.confirm();
    assert(staleResult === false, 'Stale goal confirmation failed closed');
    assert(staleHarness.status === 'pending', 'Proposal status remains pending (not confirmed)');
    assert(staleHarness.errorMessage !== null, 'Clear error message returned');
    assert(
      useTaskStore.getState().tasks.length === 2,
      'Zero tasks created when confirming proposal with deleted goal'
    );
  }

  // 18. RAPID DOUBLE CONFIRMATION
  console.log('\n--- 18. RAPID DOUBLE CONFIRMATION ---');
  {
    // Restore goal in store
    const goal: Goal = {
      id: 'goal-double-confirm',
      title: 'هدف اختبار التزامن',
      description: 'وصف هدف اختبار التزامن',
      progress: 50,
      createdAt: '2026-01-01T10:00:00Z',
      updatedAt: '2026-01-01T10:00:00Z',
    };
    useGoalStore.setState({ goals: [goal] });

    const doubleProposal: TaskActionProposal = {
      id: 'prop-double-test',
      source: 'next_action',
      requiresGoal: true,
      title: 'مهمة منع التكرار التزامني',
      priority: 'medium',
      date: TODAY,
      goalId: goal.id,
      status: 'pending',
    };

    const concurrentHarness = new TaskProposalHarness(doubleProposal);
    const countBefore = useTaskStore.getState().tasks.length;

    // Concurrent double-confirm
    const [res1, res2] = await Promise.all([
      concurrentHarness.confirm(),
      concurrentHarness.confirm(),
    ]);

    assert(res1 !== res2, 'Exactly one concurrent confirm succeeded, second was rejected by mutex lock');

    const countAfter = useTaskStore.getState().tasks.length;
    assert(countAfter === countBefore + 1, `Exactly one task created in store (${countBefore} -> ${countAfter})`);
  }

  // 19. ALL_CLEAR PATH
  console.log('\n--- 19. ALL_CLEAR PATH ---');
  {
    // Mark all tasks completed and ensure all goals have tasks today
    const currentTasks = useTaskStore.getState().tasks.map((t) => ({ ...t, completed: true, date: TODAY }));
    useTaskStore.setState({ tasks: currentTasks });

    // Goals are attended by today's completed tasks
    const res = await aiOrchestrator.orchestrate({
      message: 'what next',
      context: createMockContext(),
      language: 'en',
    });

    assert(res.handledAsCommand === true, 'Handled as command on all_clear');
    assert(res.taskProposal === undefined, 'No task proposal on all_clear');
    assert(
      res.commandFeedback?.en.includes('All clear') || res.commandFeedback?.en.includes('all clear'),
      'All clear feedback message returned'
    );
  }

  // 20. CHAT MESSAGE CORRELATION
  console.log('\n--- 20. CHAT MESSAGE CORRELATION ---');
  {
    // Set up unattended goal to trigger new_task_required
    const unattendedG: Goal = {
      id: 'goal-corr-test',
      title: 'هدف ترابط المحادثة',
      description: 'وصف هدف ترابط المحادثة',
      progress: 10,
      createdAt: '2026-01-01T10:00:00Z',
      updatedAt: '2026-01-01T10:00:00Z',
    };
    useTaskStore.setState({ tasks: [] });
    useGoalStore.setState({ goals: [unattendedG] });

    mockProvider.mockResponseText = JSON.stringify({
      suggestedTitle: 'مهمة ترابط معرف الرسالة',
      reasoning: 'اختبار ترابط الرسائل بدقة.',
    });

    const userMessageId = 'msg-user-correlation-9988';
    const res = await aiOrchestrator.orchestrate({
      message: 'اقترح عمل الآن',
      messageId: userMessageId,
      context: createMockContext(),
      language: 'ar',
    });

    assert(res.taskProposal !== undefined, 'Proposal created');
    assert(
      res.taskProposal?.originatingMessageId === userMessageId,
      `originatingMessageId strictly preserved: got "${res.taskProposal?.originatingMessageId}", expected "${userMessageId}"`
    );
  }

  console.log('\n========================================');
  console.log('🎉 ALL 20 GATE 17.3B TESTS PASSED! 🎉');
  console.log('========================================');
}

runTests().catch((err) => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
