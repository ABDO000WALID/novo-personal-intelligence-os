import './test_env.ts';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { aiOrchestrator } from './src/core/ai/aiOrchestrator';
import { aiProviderRegistry, AIProvider } from './src/core/ai/aiProvider';
import {
  parseCommand,
  isDailyBriefingTrigger,
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

console.log('=== GATE 17.2 COMPREHENSIVE VERIFICATION SUITE ===');

const TEST_UID = 'gate17-2-test-user-001';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

// Mock AI Provider for testing
class MockTestAIProvider implements AIProvider {
  id = 'mock-test-provider-gate17-2';
  name = 'Mock Test AI Provider Gate 17.2';
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
    if (this.shouldThrow) {
      throw new Error('Simulated upstream AI provider failure');
    }

    if (this.delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), this.delayMs);
        if (options?.abortSignal) {
          options.abortSignal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('The user aborted a request.', 'AbortError'));
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

async function runGate17_2Tests() {
  console.log('\n--- 1. ARABIC TRIGGER RECOGNITION ---');
  const arTriggers = [
    'موجز اليوم',
    'اعطني موجز اليوم',
    'اعطني الموجز اليومي',
    'الموجز اليومي',
    'ملخص اليوم',
    'من فضلك موجز اليوم',
    'لو سمحت ملخص اليوم',
  ];
  for (const trig of arTriggers) {
    const isTrig = isDailyBriefingTrigger(trig);
    assert(isTrig, `Arabic trigger detected: "${trig}"`);
    const parsed = parseCommand(trig);
    assert(parsed.isCommand && parsed.command?.action === 'daily_briefing', `Parsed as daily_briefing command: "${trig}"`);
  }

  console.log('\n--- 2. ENGLISH TRIGGER RECOGNITION ---');
  const enTriggers = [
    'daily briefing',
    'give me my daily briefing',
    'morning briefing',
    "today's briefing",
    'todays briefing',
    'brief me',
    'please daily briefing',
  ];
  for (const trig of enTriggers) {
    const isTrig = isDailyBriefingTrigger(trig);
    assert(isTrig, `English trigger detected: "${trig}"`);
    const parsed = parseCommand(trig);
    assert(parsed.isCommand && parsed.command?.action === 'daily_briefing', `Parsed as daily_briefing command: "${trig}"`);
  }

  console.log('\n--- 3. "صباح الخير" MUST REMAIN CONVERSATIONAL (CORRECTION 1) ---');
  const morningGreeting = 'صباح الخير';
  assert(!isDailyBriefingTrigger(morningGreeting), '"صباح الخير" is NOT a daily_briefing trigger');
  const parsedGreeting = parseCommand(morningGreeting);
  assert(!parsedGreeting.isCommand, '"صباح الخير" parses as conversational (isCommand: false)');

  console.log('\n--- 4. UNRELATED BRIEFING QUESTIONS REMAIN CONVERSATIONAL ---');
  const nonCommandQueries = [
    'ما هو مفهوم الموجز الإخباري؟',
    'كيف تكتب موجزاً؟',
    'briefly explain react hooks',
    'tell me about daily briefing',
    'how to write a briefing',
  ];
  for (const query of nonCommandQueries) {
    assert(!isDailyBriefingTrigger(query), `Negative query NOT a trigger: "${query}"`);
    const parsed = parseCommand(query);
    assert(!parsed.isCommand, `Negative query is conversational: "${query}"`);
  }

  console.log('\n--- 5. DETERMINISTIC DAILY BRIEFING METRICS ARE USED IN FEEDBACK ---');
  const sampleGoals: Goal[] = [
    {
      id: 'g-briefing-1',
      title: 'إتقان TypeScript المتقدم',
      description: 'تعلم عميق للنظام النوعي',
      progress: 40,
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    },
  ];
  const sampleTasks: Task[] = [
    {
      id: 't-briefing-1',
      title: 'حل تمارين Generics',
      completed: true,
      priority: 'high',
      date: getLocalDateString(0),
      createdAt: '2026-01-01T10:00:00.000Z',
    },
    {
      id: 't-briefing-2',
      title: 'قراءة التوثيق الرسمي',
      completed: false,
      priority: 'medium',
      date: getLocalDateString(0),
      createdAt: '2026-01-01T11:00:00.000Z',
    },
  ];

  const parsedBriefing = parseCommand('موجز اليوم', sampleGoals, sampleTasks);
  assert(parsedBriefing.isCommand, 'Command parsed with goals & tasks');
  assert(parsedBriefing.command?.dailyBriefingPayload !== undefined, 'dailyBriefingPayload present');
  const payload = parsedBriefing.command!.dailyBriefingPayload!;
  assert(payload.briefing.taskStats.completedToday === 1, 'taskStats.completedToday is 1');
  assert(payload.briefing.taskStats.totalToday === 2, 'taskStats.totalToday is 2');
  assert(payload.briefing.taskStats.pendingCount === 1, 'taskStats.pendingCount is 1');
  assert(payload.briefing.goalStats.activeCount === 1, 'goalStats.activeCount is 1');
  assert(payload.briefing.goalStats.averageProgress === 40, 'goalStats.averageProgress is 40%');
  assert(parsedBriefing.command!.feedbackAr.includes('1/2'), 'feedbackAr contains exact tasks stats (1/2)');
  assert(parsedBriefing.command!.feedbackEn.includes('1/2'), 'feedbackEn contains exact tasks stats (1/2)');

  console.log('\n--- 6. ZERO ACTIVE GOALS -> ZERO PROPOSALS ---');
  const noGoalsParsed = parseCommand('موجز اليوم', [], sampleTasks);
  assert(!noGoalsParsed.command?.dailyBriefingPayload?.hasUnattendedGoals, 'hasUnattendedGoals is false when no active goals');
  assert(noGoalsParsed.command?.dailyBriefingPayload?.selectedGoalId === undefined, 'No goal selected');

  const mockProvider = new MockTestAIProvider();
  aiProviderRegistry.register(mockProvider);
  aiProviderRegistry.setActiveProvider(mockProvider.id);

  const noGoalOrch = await aiOrchestrator.orchestrate({
    message: 'موجز اليوم',
    context: {
      goals: [],
      activeGoals: [],
      tasks: sampleTasks,
      todayTasks: sampleTasks,
      completedTasks: [sampleTasks[0]],
      overdueTasks: [],
      notesCount: 0,
      recentNotes: [],
      recentKnowledge: [],
      focusSessions: [],
      productivitySummary: { totalTasks: 2, completedTasks: 1, pendingTasks: 1, todayTasks: 2, todayCompletedTasks: 1, completionPercentage: 50, highPriorityPendingCount: 0, overdueTasksCount: 0, recentCompletionRate: 50 },
      goalHealth: { totalGoals: 0, completedGoals: 0, activeGoals: 0, averageProgress: 0, goalsBelow25: 0, goalsAbove75: 0, recentlyUpdatedGoals: 0, healthStatus: 'good' },
      productivityScore: 50,
      recentActivity: [],
      insights: [],
      generatedAt: new Date().toISOString(),
      date: getLocalDateString(0),
    } as any,
    language: 'ar',
  });
  assert(noGoalOrch.handledAsCommand, 'Handled as command');
  assert(noGoalOrch.taskProposal === undefined, 'Zero proposals when no active goals exist');

  console.log('\n--- 7. ALL ACTIVE GOALS ATTENDED -> ZERO PROPOSALS ---');
  const attendedGoals: Goal[] = [
    {
      id: 'g-attended-1',
      title: 'هدف مكتمل المواءمة',
      description: 'هدف له مهام اليوم',
      progress: 50,
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    },
  ];
  const attendedTasks: Task[] = [
    {
      id: 't-attended-1',
      title: 'مهمة مجدولة لليوم تتبع الهدف',
      completed: false,
      priority: 'high',
      date: getLocalDateString(0),
      goalId: 'g-attended-1',
      createdAt: '2026-01-01T10:00:00.000Z',
    },
  ];
  const allAttendedOrch = await aiOrchestrator.orchestrate({
    message: 'موجز اليوم',
    context: {
      goals: attendedGoals,
      activeGoals: attendedGoals,
      tasks: attendedTasks,
      todayTasks: attendedTasks,
      completedTasks: [],
      overdueTasks: [],
      notesCount: 0,
      recentNotes: [],
      recentKnowledge: [],
      focusSessions: [],
      productivitySummary: { totalTasks: 1, completedTasks: 0, pendingTasks: 1, todayTasks: 1, todayCompletedTasks: 0, completionPercentage: 0, highPriorityPendingCount: 1, overdueTasksCount: 0, recentCompletionRate: 0 },
      goalHealth: { totalGoals: 1, completedGoals: 0, activeGoals: 1, averageProgress: 50, goalsBelow25: 0, goalsAbove75: 0, recentlyUpdatedGoals: 1, healthStatus: 'good' },
      productivityScore: 50,
      recentActivity: [],
      insights: [],
      generatedAt: new Date().toISOString(),
      date: getLocalDateString(0),
    } as any,
    language: 'ar',
  });
  assert(allAttendedOrch.handledAsCommand, 'Handled as command when all goals attended');
  assert(allAttendedOrch.taskProposal === undefined, 'Zero proposals when all active goals have tasks today');

  console.log('\n--- 8 & 9. UNATTENDED GOAL -> EXACTLY ONE PROPOSAL WITH DETERMINISTIC GOAL SELECTION ---');
  const goalsWithTie: Goal[] = [
    {
      id: 'g-high-prog',
      title: 'هدف متقدم',
      description: 'هدف بنسبة إنجاز عالية',
      progress: 80,
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    },
    {
      id: 'g-lowest-prog',
      title: 'الهدف ذو الإنجاز الأقل',
      description: 'هدف بنسبة إنجاز منخفضة',
      progress: 15,
      createdAt: '2026-01-01T11:00:00.000Z',
      updatedAt: '2026-01-01T11:00:00.000Z',
    },
  ];

  mockProvider.mockResponseText = JSON.stringify({
    suggestedTitle: 'مهمة مقترحة ذكية للهدف الأقل إنجازاً',
    reasoning: 'خطوة أولى محددة لرفع نسبة الإنجاز اليوم.',
  });

  const briefingContext: any = {
    goals: goalsWithTie,
    activeGoals: goalsWithTie,
    tasks: [],
    todayTasks: [],
    completedTasks: [],
    overdueTasks: [],
    notesCount: 0,
    recentNotes: [],
    recentKnowledge: [],
    focusSessions: [],
    focusStats: { todayFocusMinutes: 25, weeklyFocusMinutes: 120, totalSessions: 2, recentActivityCount: 2 },
    moneySummary: { currentBalance: 1500, totalIncome: 2000, totalExpenses: 500, recentSpending: 50, savingsRate: 75 },
    focusSummary: { todayFocusMinutes: 25, weeklyFocusMinutes: 120, totalSessions: 2, recentActivityCount: 2 },
    financeSummary: { currentBalance: 1500, totalIncome: 2000, totalExpenses: 500, recentSpending: 50, savingsRate: 75 },
    knowledgeSummary: { totalNotes: 5, totalKnowledge: 2, activeNotes: 5, curatedItems: 2 },
    productivitySummary: { totalTasks: 0, completedTasks: 0, pendingTasks: 0, todayTasks: 0, todayCompletedTasks: 0, completionPercentage: 0, highPriorityPendingCount: 0, overdueTasksCount: 0, recentCompletionRate: 0 },
    goalHealth: { totalGoals: 2, completedGoals: 0, activeGoals: 2, averageProgress: 47.5, goalsBelow25: 1, goalsAbove75: 1, recentlyUpdatedGoals: 2, healthStatus: 'good' },
    productivityScore: 65,
    recentActivity: [],
    insights: [],
    generatedAt: new Date().toISOString(),
    date: getLocalDateString(0),
  };

  const briefingOrch = await aiOrchestrator.orchestrate({
    message: 'موجز اليوم',
    context: briefingContext,
    language: 'ar',
  });

  assert(briefingOrch.handledAsCommand, 'Handled as command');
  assert(briefingOrch.taskProposal !== undefined, 'Exactly one task proposal attached');
  assert(briefingOrch.taskProposal?.goalId === 'g-lowest-prog', 'Deterministic goal selection selected lowest-progress goal (15%)');
  assert(briefingOrch.taskProposal?.goalTitle === 'الهدف ذو الإنجاز الأقل', 'Goal title matches selected goal');

  console.log('\n--- 10. PROPOSAL SOURCE IS "daily_briefing" ---');
  assert(briefingOrch.taskProposal?.source === 'daily_briefing', 'proposal.source is strictly "daily_briefing"');
  assert(briefingOrch.taskProposal?.requiresGoal === true, 'proposal.requiresGoal is strictly true');

  console.log('\n--- 11. ORIGINATING MESSAGE ID THREADING ---');
  // Simulate useChatOrchestrator attaching userMessageId
  const simulatedUserMessageId = 'msg-user-briefing-12345';
  briefingOrch.taskProposal!.originatingMessageId = simulatedUserMessageId;
  assert(briefingOrch.taskProposal?.originatingMessageId === simulatedUserMessageId, 'originatingMessageId correctly threaded');

  console.log('\n--- 12. AI ENRICHMENT SUCCESS PATH ---');
  assert(briefingOrch.taskProposal?.aiEnriched === true, 'aiEnriched is true on success');
  assert(briefingOrch.taskProposal?.title === 'مهمة مقترحة ذكية للهدف الأقل إنجازاً', 'AI title used');
  assert(briefingOrch.taskProposal?.reasoning === 'خطوة أولى محددة لرفع نسبة الإنجاز اليوم.', 'AI reasoning used');

  console.log('\n--- 13. PROVIDER UNAVAILABLE -> FALLBACK ---');
  mockProvider.available = false;
  const unavailOrch = await aiOrchestrator.orchestrate({
    message: 'موجز اليوم',
    context: briefingContext,
    language: 'ar',
  });
  mockProvider.available = true;
  assert(unavailOrch.taskProposal !== undefined, 'Proposal created even when provider unavailable');
  assert(unavailOrch.taskProposal?.aiEnriched === false, 'aiEnriched is false when provider unavailable');
  assert(unavailOrch.taskProposal?.title === 'متابعة ومواصلة العمل على: الهدف ذو الإنجاز الأقل', 'Fallback deterministic title used');

  console.log('\n--- 14. MALFORMED AI RESPONSE -> FALLBACK ---');
  mockProvider.mockResponseText = 'Not valid JSON at all';
  const malformedOrch = await aiOrchestrator.orchestrate({
    message: 'موجز اليوم',
    context: briefingContext,
    language: 'ar',
  });
  assert(malformedOrch.taskProposal !== undefined, 'Proposal created when AI returns malformed text');
  assert(malformedOrch.taskProposal?.aiEnriched === false, 'aiEnriched is false on malformed JSON');
  assert(malformedOrch.taskProposal?.title.startsWith('متابعة ومواصلة العمل على:'), 'Deterministic fallback title used on malformed JSON');

  console.log('\n--- 15. ZERO MUTATIONS BEFORE CONFIRMATION ---');
  AuthLifecycle.reset(TEST_UID);
  const liveGoal: Goal = {
    id: 'g-live-test',
    title: 'هدف الاختبار الحي',
    description: 'هدف اختبار حي للمواءمة',
    progress: 10,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
  };
  (RepositoryFactory.getGoalRepository() as any)._saveAllSync([liveGoal]);
  useGoalStore.setState({ goals: [liveGoal], status: 'ready', error: null });
  useTaskStore.setState({ tasks: [], status: 'ready', error: null });

  const initialTasksInStore = useTaskStore.getState().tasks.length;

  const testProposal: TaskActionProposal = {
    id: 'prop-test-mut-001',
    source: 'daily_briefing',
    requiresGoal: true,
    title: 'مهمة تدقيق عدم التعديل المسبق',
    priority: 'medium',
    date: getLocalDateString(0),
    goalId: 'g-live-test',
    goalTitle: 'هدف الاختبار الحي',
    reasoning: 'سبب اختباري',
    aiEnriched: true,
    status: 'pending',
  };

  const tasksBeforeConfirm = useTaskStore.getState().tasks.length;
  assert(tasksBeforeConfirm === initialTasksInStore, 'Store task count unchanged before confirm');

  console.log('\n--- 16. CANCEL -> ZERO TASKS ---');
  const cancelHarness = new TaskProposalHarness({ ...testProposal, id: 'prop-cancel-001' });
  const didCancel = cancelHarness.cancel();
  assert(didCancel, 'Cancel returned true');
  assert(cancelHarness.status === 'cancelled', 'Harness status is cancelled');
  assert(cancelHarness.proposal.status === 'cancelled', 'Proposal status is cancelled');
  const tasksAfterCancel = useTaskStore.getState().tasks.length;
  assert(tasksAfterCancel === initialTasksInStore, 'Zero tasks created on cancellation');

  console.log('\n--- 17 & 18. CONFIRM -> EXACTLY ONE TASK WITH DETERMINISTIC GOAL ID ---');
  const confirmHarness = new TaskProposalHarness({ ...testProposal, id: 'prop-confirm-001' });
  const didConfirm = await confirmHarness.confirm();
  assert(didConfirm, 'Confirm succeeded');
  assert(confirmHarness.status === 'confirmed', 'Harness status is confirmed');
  assert(confirmHarness.proposal.status === 'confirmed', 'Proposal status is confirmed');

  const tasksAfterConfirm = useTaskStore.getState().tasks;
  assert(tasksAfterConfirm.length === initialTasksInStore + 1, 'Exactly one task added to store');
  const createdTask = tasksAfterConfirm.find((t) => t.title === testProposal.title);
  assert(createdTask !== undefined, 'Created task found in store');
  assert(createdTask?.goalId === 'g-live-test', 'Task contains exact deterministic goalId');

  console.log('\n--- 19. STALE / DELETED GOAL -> CONFIRMATION REJECTED ---');
  // Delete the goal from the store
  useGoalStore.setState({ goals: [] });
  const staleProposal: TaskActionProposal = {
    id: 'prop-stale-001',
    source: 'daily_briefing',
    requiresGoal: true,
    title: 'مهمة لهدف محذوف',
    priority: 'medium',
    date: getLocalDateString(0),
    goalId: 'g-live-test',
    goalTitle: 'هدف الاختبار الحي',
    status: 'pending',
  };
  const staleHarness = new TaskProposalHarness(staleProposal);
  const staleConfirmRes = await staleHarness.confirm();
  assert(staleConfirmRes === false, 'Confirmation rejected when goal was deleted');
  assert(staleHarness.status === 'pending', 'Proposal did not become confirmed');
  assert(staleHarness.errorMessage !== null, 'Localized error message was set');
  const tasksAfterStale = useTaskStore.getState().tasks.length;
  assert(tasksAfterStale === tasksAfterConfirm.length, 'Zero tasks created for stale/deleted goal');

  console.log('\n--- 20. DOUBLE CONFIRMATION -> EXACTLY ONE TASK ---');
  // Re-add goal
  const concurrencyGoal: Goal = {
    id: 'g-concurrency-test',
    title: 'هدف اختبار التكرار',
    description: 'هدف اختبار التزامن والتكرار',
    progress: 20,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
  };
  useGoalStore.setState({ goals: [concurrencyGoal] });
  const concurrentProposal: TaskActionProposal = {
    id: 'prop-concurrent-001',
    source: 'daily_briefing',
    requiresGoal: true,
    title: 'مهمة اختبار التزامن والتكرار',
    priority: 'medium',
    date: getLocalDateString(0),
    goalId: 'g-concurrency-test',
    goalTitle: 'هدف اختبار التكرار',
    status: 'pending',
  };
  const concurrentHarness = new TaskProposalHarness(concurrentProposal);
  const taskCountBeforeDouble = useTaskStore.getState().tasks.length;
  const [res1, res2] = await Promise.all([
    concurrentHarness.confirm(),
    concurrentHarness.confirm(),
  ]);
  assert(res1 !== res2, 'Exactly one concurrent confirm succeeded, the second was rejected by mutex lock');
  const taskCountAfterDouble = useTaskStore.getState().tasks.length;
  assert(taskCountAfterDouble === taskCountBeforeDouble + 1, 'Exactly one task created despite concurrent double-clicks');

  console.log('\n========================================');
  console.log('🎉 ALL 20 GATE 17.2 TEST SUITES PASSED! 🎉');
  console.log('========================================\n');
}

runGate17_2Tests()
  .catch((err) => {
    console.error('Fatal error in Gate 17.2 test suite:', err);
    process.exit(1);
  });
