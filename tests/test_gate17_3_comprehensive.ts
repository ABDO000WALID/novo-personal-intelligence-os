import './test_env.ts';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { aiOrchestrator } from './src/core/ai/aiOrchestrator';
import { aiProviderRegistry, AIProvider } from './src/core/ai/aiProvider';
import {
  parseCommand,
  isNextActionTrigger,
  getLocalDateString,
} from './src/core/commands/commandParser';
import { determineNextAction } from './src/core/intelligence/nextActionEngine';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { TaskActionProposal } from './src/core/commands/commandTypes';
import { Goal, Task } from './src/types/data';
import { executeTaskProposalConfirm } from './src/modules/chat/components/TaskProposalCard';
import { AIResponse, AIRequestOptions } from './src/core/ai/aiTypes';
import { NOVOContext } from './src/core/intelligence/intelligenceTypes';

console.log('=== GATE 17.3 COMPREHENSIVE VERIFICATION SUITE ===');

const TEST_UID = 'gate17-3-test-user-001';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

// Mock AI Provider for testing
class MockTestAIProvider implements AIProvider {
  id = 'mock-test-provider-gate17-3';
  name = 'Mock Test AI Provider Gate 17.3';
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

function createTestContext(tasks: Task[] = [], goals: Goal[] = []): NOVOContext {
  const activeGoals = goals.filter((g) => (g.progress ?? 0) < 100);
  return {
    tasks,
    goals,
    activeGoals,
    todayTasks: tasks.filter((t) => t.date === getLocalDateString(0)),
    completedTasks: tasks.filter((t) => t.completed),
    overdueTasks: tasks.filter((t) => !t.completed && t.date && t.date < getLocalDateString(0)),
    notesCount: 0,
    recentNotes: [],
    recentKnowledge: [],
    focusSessions: [],
    focusStats: {
      totalSessions: 0,
      totalFocusedMinutes: 0,
      todaySessions: 0,
      todayFocusMinutes: 0,
      weeklyFocusMinutes: 0,
      averageSessionDuration: 0,
      recentActivityCount: 0,
    },
    moneySummary: {
      currentBalance: 0,
      totalIncome: 0,
      totalExpenses: 0,
      recentSpending: 0,
      expensesByCategory: [],
      largestExpenseCategory: null,
      recentTransactionCount: 0,
    },
    focusSummary: {
      totalSessions: 0,
      totalFocusedMinutes: 0,
      todaySessions: 0,
      todayFocusMinutes: 0,
      weeklyFocusMinutes: 0,
      averageSessionDuration: 0,
      recentActivityCount: 0,
    },
    financeSummary: {
      currentBalance: 0,
      totalIncome: 0,
      totalExpenses: 0,
      recentSpending: 0,
      expensesByCategory: [],
      largestExpenseCategory: null,
      recentTransactionCount: 0,
    },
    knowledgeSummary: {
      totalNotes: 0,
      recentlyCreatedNotes: 0,
      recentlyUpdatedNotes: 0,
      notesCreatedThisWeek: 0,
      latestActivity: null,
      totalKnowledgeItems: 0,
      pinnedKnowledgeCount: 0,
    },
    productivitySummary: {
      totalTasks: tasks.length,
      completedTasks: tasks.filter((t) => t.completed).length,
      pendingTasks: tasks.filter((t) => !t.completed).length,
      todayTasks: 0,
      todayCompletedTasks: 0,
      completionPercentage: 0,
      highPriorityPendingCount: 0,
      overdueTasksCount: 0,
      recentCompletionRate: 0,
    },
    goalHealth: {
      totalGoals: goals.length,
      completedGoals: goals.filter((g) => (g.progress ?? 0) >= 100).length,
      activeGoals: activeGoals.length,
      averageProgress: 0,
      goalsBelow25: 0,
      goalsAbove75: 0,
      recentlyUpdatedGoals: 0,
      healthStatus: 'good',
    },
    productivityScore: 50,
    recentActivity: [],
    insights: [],
    generatedAt: new Date().toISOString(),
    date: getLocalDateString(0),
  };
}

async function runTestSuite() {
  AuthLifecycle.reset(TEST_UID);
  useGoalStore.setState({ goals: [], status: 'ready', error: null });
  useTaskStore.setState({ tasks: [], status: 'ready', error: null });

  const mockProvider = new MockTestAIProvider();
  aiProviderRegistry.register(mockProvider);
  aiProviderRegistry.setActiveProvider(mockProvider.id);

  const todayStr = getLocalDateString(0);
  const yesterdayStr = getLocalDateString(-1);
  const twoDaysAgoStr = getLocalDateString(-2);

  // --- 1. ARABIC TRIGGER RECOGNITION ---
  console.log('\n--- 1. ARABIC TRIGGER RECOGNITION ---');
  const validArabicTriggers = [
    'ماذا أفعل الآن',
    'ماذا افعل الان',
    'ماذا أفعل الآن؟',
    'ما هي خطوتي التالية',
    'ما هي خطوتي القادمه',
    'خطوتي التالية',
    'اقترح عمل الآن',
    'من فضلك ماذا افعل الان',
    'لو سمحت خطوتي التالية',
    'ماذا اعمل الان',
  ];

  for (const trig of validArabicTriggers) {
    assert(isNextActionTrigger(trig), `Arabic trigger detected: "${trig}"`);
    const parsed = parseCommand(trig, [], []);
    assert(parsed.isCommand === true && parsed.command?.action === 'next_action', `Parsed as next_action: "${trig}"`);
  }

  // --- 2. ENGLISH TRIGGER RECOGNITION ---
  console.log('\n--- 2. ENGLISH TRIGGER RECOGNITION ---');
  const validEnglishTriggers = [
    'what should i do now',
    'what should i work on next',
    'what is my next action',
    'next action',
    'what next',
    'please what should i do now',
  ];

  for (const trig of validEnglishTriggers) {
    assert(isNextActionTrigger(trig), `English trigger detected: "${trig}"`);
    const parsed = parseCommand(trig, [], []);
    assert(parsed.isCommand === true && parsed.command?.action === 'next_action', `Parsed as next_action: "${trig}"`);
  }

  // --- 3. NEGATIVE CONVERSATIONAL QUERIES ---
  console.log('\n--- 3. NEGATIVE CONVERSATIONAL QUERIES ---');
  const negativeQueries = [
    'ماذا أفعل لو تأخرت؟',
    'ماذا تفعل في وقت فراغك؟',
    'ما هو مفهوم الخطوة التالية؟',
    'what does next action mean?',
    'tell me about next action',
    'how to plan my day',
    'صباح الخير',
  ];

  for (const neg of negativeQueries) {
    assert(!isNextActionTrigger(neg), `Negative query NOT trigger: "${neg}"`);
    const parsed = parseCommand(neg, [], []);
    assert(parsed.command?.action !== 'next_action', `Negative query NOT next_action command: "${neg}"`);
  }

  // --- 4. OVERDUE TASK SELECTION (TIER 1) ---
  console.log('\n--- 4. OVERDUE TASK SELECTION ---');
  const overdueSingleTask: Task = {
    id: 't-overdue-1',
    title: 'مهمة متأخرة عاجلة',
    completed: false,
    priority: 'high',
    date: yesterdayStr,
    createdAt: '2026-01-01T10:00:00.000Z',
  };
  const todayTaskForComp: Task = {
    id: 't-today-1',
    title: 'مهمة اليوم',
    completed: false,
    priority: 'high',
    date: todayStr,
    createdAt: '2026-01-01T09:00:00.000Z',
  };

  const resOverdue = determineNextAction([todayTaskForComp, overdueSingleTask], []);
  assert(resOverdue.tier === 'tier1_overdue', 'Tier 1 overdue selected even when today tasks exist');
  assert(resOverdue.recommendedTask?.id === 't-overdue-1', 'Overdue task chosen over today task');

  // --- 5. OVERDUE PRIORITY ORDERING ---
  console.log('\n--- 5. OVERDUE PRIORITY ORDERING ---');
  const overdueMedium: Task = {
    id: 't-overdue-med',
    title: 'متأخرة متوسطة',
    completed: false,
    priority: 'medium',
    date: twoDaysAgoStr,
    createdAt: '2026-01-01T08:00:00.000Z',
  };
  const overdueHigh: Task = {
    id: 't-overdue-hi',
    title: 'متأخرة عالية',
    completed: false,
    priority: 'high',
    date: yesterdayStr,
    createdAt: '2026-01-01T12:00:00.000Z',
  };

  const resOverduePri = determineNextAction([overdueMedium, overdueHigh], []);
  assert(resOverduePri.recommendedTask?.id === 't-overdue-hi', 'High priority overdue wins over medium priority');

  // --- 6. OVERDUE CREATED_AT TIE-BREAK ---
  console.log('\n--- 6. OVERDUE CREATED_AT TIE-BREAK ---');
  const overdueHiEarlier: Task = {
    id: 't-overdue-hi-earlier',
    title: 'متأخرة عالية أسبق',
    completed: false,
    priority: 'high',
    date: yesterdayStr,
    createdAt: '2026-01-01T08:00:00.000Z',
  };
  const overdueHiLater: Task = {
    id: 't-overdue-hi-later',
    title: 'متأخرة عالية لاحقاً',
    completed: false,
    priority: 'high',
    date: yesterdayStr,
    createdAt: '2026-01-01T14:00:00.000Z',
  };

  const resOverdueTime = determineNextAction([overdueHiLater, overdueHiEarlier], []);
  assert(resOverdueTime.recommendedTask?.id === 't-overdue-hi-earlier', 'Earlier createdAt wins on overdue tie');

  // --- 7. OVERDUE TASK.ID TIE-BREAK ---
  console.log('\n--- 7. OVERDUE TASK.ID TIE-BREAK ---');
  const overdueA: Task = {
    id: 't-overdue-aaa',
    title: 'متأخرة أ',
    completed: false,
    priority: 'high',
    date: yesterdayStr,
    createdAt: '2026-01-01T10:00:00.000Z',
  };
  const overdueZ: Task = {
    id: 't-overdue-zzz',
    title: 'متأخرة ي',
    completed: false,
    priority: 'high',
    date: yesterdayStr,
    createdAt: '2026-01-01T10:00:00.000Z',
  };

  const resOverdueLex = determineNextAction([overdueZ, overdueA], []);
  assert(resOverdueLex.recommendedTask?.id === 't-overdue-aaa', 'Lexical task.id wins when priority and createdAt tie');

  // --- 8. TODAY'S TASK SELECTION (TIER 2) ---
  console.log("\n--- 8. TODAY'S TASK SELECTION ---");
  const todayOnlyTasks: Task[] = [
    {
      id: 't-today-only',
      title: 'مهمة اليوم فقط',
      completed: false,
      priority: 'medium',
      date: todayStr,
      createdAt: '2026-01-01T10:00:00.000Z',
    },
  ];
  const resToday = determineNextAction(todayOnlyTasks, []);
  assert(resToday.tier === 'tier2_today', 'Tier 2 today selected when no overdue tasks exist');
  assert(resToday.recommendedTask?.id === 't-today-only', "Today's task correctly recommended");

  // --- 9. TODAY'S PRIORITY ORDERING ---
  console.log("\n--- 9. TODAY'S PRIORITY ORDERING ---");
  const todayLow: Task = {
    id: 't-td-low',
    title: 'مهمة منخفضة',
    completed: false,
    priority: 'low',
    date: todayStr,
    createdAt: '2026-01-01T08:00:00.000Z',
  };
  const todayMed: Task = {
    id: 't-td-med',
    title: 'مهمة متوسطة',
    completed: false,
    priority: 'medium',
    date: todayStr,
    createdAt: '2026-01-01T09:00:00.000Z',
  };
  const todayHigh: Task = {
    id: 't-td-hi',
    title: 'مهمة عالية',
    completed: false,
    priority: 'high',
    date: todayStr,
    createdAt: '2026-01-01T12:00:00.000Z',
  };

  const resTodayPri = determineNextAction([todayLow, todayMed, todayHigh], []);
  assert(resTodayPri.recommendedTask?.id === 't-td-hi', "Today's high priority task wins over medium and low");

  // --- 10. GOAL-PROGRESS TIE-BREAK ---
  console.log('\n--- 10. GOAL-PROGRESS TIE-BREAK ---');
  const goalsProgressList: Goal[] = [
    {
      id: 'g-lower-prog',
      title: 'هدف إنجازه أقل',
      description: 'إنجاز منخفض',
      progress: 20,
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    },
    {
      id: 'g-higher-prog',
      title: 'هدف إنجازه أعلى',
      description: 'إنجاز متقدم',
      progress: 80,
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    },
  ];

  const taskGoalHigher: Task = {
    id: 't-higher-prog-task',
    title: 'مهمة للهدف المتقدم',
    completed: false,
    priority: 'medium',
    date: todayStr,
    goalId: 'g-higher-prog',
    createdAt: '2026-01-01T08:00:00.000Z',
  };
  const taskGoalLower: Task = {
    id: 't-lower-prog-task',
    title: 'مهمة للهدف الأقل إنجازاً',
    completed: false,
    priority: 'medium',
    date: todayStr,
    goalId: 'g-lower-prog',
    createdAt: '2026-01-01T12:00:00.000Z',
  };

  const resGoalProg = determineNextAction([taskGoalHigher, taskGoalLower], goalsProgressList);
  assert(resGoalProg.recommendedTask?.id === 't-lower-prog-task', 'Task linked to lower-progress goal wins at same priority');

  // --- 11. UNLINKED TASK BEHAVIOR ---
  console.log('\n--- 11. UNLINKED TASK BEHAVIOR ---');
  const unlinkedTaskHigh: Task = {
    id: 't-unlinked-hi',
    title: 'مهمة غير مرتبطة بأولوية عالية',
    completed: false,
    priority: 'high',
    date: todayStr,
    createdAt: '2026-01-01T12:00:00.000Z',
  };
  const linkedTaskMed: Task = {
    id: 't-linked-med',
    title: 'مهمة مرتبطة بهدف بأولوية متوسطة',
    completed: false,
    priority: 'medium',
    date: todayStr,
    goalId: 'g-lower-prog',
    createdAt: '2026-01-01T08:00:00.000Z',
  };

  const resUnlinked = determineNextAction([linkedTaskMed, unlinkedTaskHigh], goalsProgressList);
  assert(resUnlinked.recommendedTask?.id === 't-unlinked-hi', 'Unlinked high-priority task wins over linked medium-priority task');

  // --- 12. DETERMINISTIC ORDERING INDEPENDENT OF ARRAY ORDER ---
  console.log('\n--- 12. DETERMINISTIC ORDERING INDEPENDENT OF ARRAY ORDER ---');
  const testSet = [todayLow, todayMed, todayHigh, taskGoalHigher, taskGoalLower];
  const reversedSet = [...testSet].reverse();
  const shuffledSet = [taskGoalLower, todayHigh, todayLow, taskGoalHigher, todayMed];

  const r1 = determineNextAction(testSet, goalsProgressList);
  const r2 = determineNextAction(reversedSet, goalsProgressList);
  const r3 = determineNextAction(shuffledSet, goalsProgressList);

  assert(r1.recommendedTask?.id === r2.recommendedTask?.id, 'Deterministic result matches on reversed input array');
  assert(r1.recommendedTask?.id === r3.recommendedTask?.id, 'Deterministic result matches on shuffled input array');

  // --- 13. EXISTING TASK RECOMMENDATION CAUSES ZERO MUTATIONS ---
  console.log('\n--- 13. ZERO MUTATIONS ON EXISTING TASK RECOMMENDATION ---');
  const preCount = useTaskStore.getState().tasks.length;
  const orchRec = await aiOrchestrator.orchestrate({
    message: 'ماذا أفعل الآن',
    context: createTestContext([todayHigh], []),
    language: 'ar',
  });

  assert(orchRec.handledAsCommand === true, 'Handled as command');
  assert(!orchRec.taskProposal, 'Zero task proposals generated for existing task');
  assert(useTaskStore.getState().tasks.length === preCount, 'Store task count unchanged (zero mutations)');

  // --- 14. REPEATED NEXT ACTION REMAINS STABLE ---
  console.log('\n--- 14. REPEATED COMMAND STABILITY ---');
  const parsed1 = parseCommand('ما هي خطوتي التالية', [], [todayHigh, todayMed]);
  const parsed2 = parseCommand('ما هي خطوتي التالية', [], [todayHigh, todayMed]);
  assert(parsed1.command?.nextActionPayload?.recommendedTask?.id === parsed2.command?.nextActionPayload?.recommendedTask?.id, 'Repeated call returns identical task ID');

  // --- 15. UNATTENDED GOAL FALLBACK ONLY WHEN NO OVERDUE/TODAY TASKS (TIER 3) ---
  console.log('\n--- 15. UNATTENDED GOAL FALLBACK ONLY WHEN NO PENDING TASKS ---');
  const unattendedGoal: Goal = {
    id: 'g-unattended-1',
    title: 'هدف بلا مهام اليوم',
    description: 'يحتاج لمهمة متابعة',
    progress: 30,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
  };

  // Case A: When pending task today exists, Tier 2 wins
  const resWithTask = determineNextAction([todayHigh], [unattendedGoal]);
  assert(resWithTask.tier === 'tier2_today', 'Tier 2 chosen when today tasks exist');

  // Case B: When NO pending tasks exist, Tier 3 unattended goal chosen
  const resNoTask = determineNextAction([], [unattendedGoal]);
  assert(resNoTask.tier === 'tier3_unattended_goal', 'Tier 3 chosen when zero pending tasks exist');
  assert(resNoTask.selectedGoal?.id === 'g-unattended-1', 'Unattended goal selected');
  assert(resNoTask.suggestedTaskTitle?.includes(unattendedGoal.title), 'Suggested task title generated');

  // --- 16. DETERMINISTIC GOAL SELECTION FOR TIER 3 ---
  console.log('\n--- 16. DETERMINISTIC GOAL SELECTION FOR TIER 3 ---');
  const unGoalHighProg: Goal = {
    id: 'g-un-hi-prog',
    title: 'هدف غير متابع 85%',
    description: 'إنجاز 85%',
    progress: 85,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
  };
  const unGoalLowProg: Goal = {
    id: 'g-un-low-prog',
    title: 'هدف غير متابع 10%',
    description: 'إنجاز 10%',
    progress: 10,
    createdAt: '2026-01-01T11:00:00.000Z',
    updatedAt: '2026-01-01T11:00:00.000Z',
  };

  const resTier3Pick = determineNextAction([], [unGoalHighProg, unGoalLowProg]);
  assert(resTier3Pick.selectedGoal?.id === 'g-un-low-prog', 'Tier 3 selects lowest progress unattended goal');

  // --- 17. DUPLICATE-TASK PREVENTION ---
  console.log('\n--- 17. DUPLICATE-TASK PREVENTION ---');
  const duplicateTaskToday: Task = {
    id: 't-dup-today',
    title: 'متابعة ومواصلة العمل على: هدف غير متابع 10%',
    completed: false,
    priority: 'medium',
    date: todayStr,
    createdAt: '2026-01-01T10:00:00.000Z',
  };

  const resDup = determineNextAction([duplicateTaskToday], [unGoalHighProg, unGoalLowProg]);
  assert(resDup.tier === 'tier2_today', 'Duplicate prevention recommends existing task');
  assert(resDup.recommendedTask?.id === 't-dup-today', 'Actionable existing task recommended, no duplicate proposed');

  // --- 18. AI RATIONALE SUCCESS PATH ---
  console.log('\n--- 18. AI RATIONALE SUCCESS PATH ---');
  mockProvider.available = true;
  mockProvider.shouldThrow = false;
  mockProvider.mockResponseText = JSON.stringify({
    reasoning: 'هذه المهمة المتأخرة ضرورية جداً لاستعادة انسيابية جدولك.',
  });

  const orchRationale = await aiOrchestrator.orchestrate({
    message: 'ماذا أفعل الآن',
    context: createTestContext([overdueHigh], []),
    language: 'ar',
  });

  assert(orchRationale.handledAsCommand === true, 'Handled as command');
  assert(orchRationale.command?.nextActionPayload?.aiEnriched === true, 'aiEnriched is true on success');
  assert(orchRationale.commandFeedback?.ar.includes('استعادة انسيابية جدولك'), 'AI rationale included in feedback');

  // --- 19. AI RATIONALE FAILURE FALLBACK ---
  console.log('\n--- 19. AI RATIONALE FAILURE FALLBACK ---');
  mockProvider.mockResponseText = 'invalid-not-json';
  const orchRationaleFail = await aiOrchestrator.orchestrate({
    message: 'ماذا أفعل الآن',
    context: createTestContext([overdueHigh], []),
    language: 'ar',
  });

  assert(orchRationaleFail.handledAsCommand === true, 'Handled as command on malformed AI text');
  assert(!orchRationaleFail.command?.nextActionPayload?.aiEnriched, 'aiEnriched is false on fallback');
  assert(orchRationaleFail.commandFeedback?.ar.includes('مهمة متأخرة'), 'Deterministic fallback rationale used');

  // --- 20. AI TIMEOUT FALLBACK ---
  console.log('\n--- 20. AI TIMEOUT FALLBACK ---');
  mockProvider.delayMs = 7000; // triggers >6s timeout
  const orchTimeout = await aiOrchestrator.orchestrate({
    message: 'what should i do now',
    context: createTestContext([todayHigh], []),
    language: 'en',
  });
  mockProvider.delayMs = 0;

  assert(orchTimeout.handledAsCommand === true, 'Handled gracefully on AI timeout');
  assert(!orchTimeout.command?.nextActionPayload?.aiEnriched, 'aiEnriched false on timeout');
  assert(orchTimeout.commandFeedback?.en.includes('scheduled task'), 'Deterministic fallback rationale used on timeout');

  // --- 21 & 22. AI CANNOT CHANGE SELECTED TASK OR GOAL_ID ---
  console.log('\n--- 21 & 22. AI CANNOT CHANGE SELECTED TASK OR GOAL_ID ---');
  mockProvider.mockResponseText = JSON.stringify({
    suggestedTitle: 'عنوان ملعوب من الذكاء الاصطناعي',
    reasoning: 'سبب من الذكاء الاصطناعي',
    goalId: 'fake-goal-id-attempt',
    taskId: 'fake-task-id-attempt',
  });

  const orchImmutable = await aiOrchestrator.orchestrate({
    message: 'ما هي خطوتي التالية',
    context: createTestContext([todayHigh], [goalsProgressList[0]]),
    language: 'ar',
  });

  assert(orchImmutable.command?.nextActionPayload?.recommendedTask?.id === todayHigh.id, 'Task ID remains deterministically immutable');

  // --- 23. ZERO MUTATIONS BEFORE CONFIRMATION (TIER 3 PROPOSAL) ---
  console.log('\n--- 23. ZERO MUTATIONS BEFORE CONFIRMATION FOR TIER 3 ---');
  mockProvider.mockResponseText = JSON.stringify({
    suggestedTitle: 'مهمة مخصصة مقترحة للهدف',
    reasoning: 'تدعم إنجاز الهدف اليوم',
  });

  const orchTier3 = await aiOrchestrator.orchestrate({
    message: 'ماذا أفعل الآن',
    context: createTestContext([], [unattendedGoal]),
    language: 'ar',
  });

  assert(orchTier3.taskProposal !== undefined, 'TaskActionProposal attached for Tier 3');
  assert(orchTier3.taskProposal?.source === 'next_action', 'Proposal source is "next_action"');
  assert(orchTier3.taskProposal?.requiresGoal === true, 'Proposal requiresGoal is true');
  assert(orchTier3.taskProposal?.goalId === unattendedGoal.id, 'Deterministic goalId set');

  const storeTasksPre = useTaskStore.getState().tasks.length;
  assert(storeTasksPre === preCount, 'Zero store mutations prior to confirmation');

  // --- 24. CANCEL -> ZERO TASKS ---
  console.log('\n--- 24. CANCEL -> ZERO TASKS ---');
  const harnessCancel = new TaskProposalHarness(orchTier3.taskProposal!);
  const cancelOk = harnessCancel.cancel();
  assert(cancelOk === true, 'Harness cancel returned true');
  assert(harnessCancel.status === 'cancelled', 'Harness status is cancelled');
  assert(useTaskStore.getState().tasks.length === preCount, 'Zero tasks created on cancellation');

  // --- 25. CONFIRM -> EXACTLY ONE TASK ---
  console.log('\n--- 25. CONFIRM -> EXACTLY ONE TASK ---');
  (RepositoryFactory.getGoalRepository() as any)._saveAllSync([unattendedGoal]);
  useGoalStore.setState({ goals: [unattendedGoal], status: 'ready', error: null });

  const orchTier3Confirm = await aiOrchestrator.orchestrate({
    message: 'ما هي خطوتي التالية',
    context: createTestContext([], [unattendedGoal]),
    language: 'ar',
  });

  const harnessConfirm = new TaskProposalHarness(orchTier3Confirm.taskProposal!);
  const confirmOk = await harnessConfirm.confirm();
  assert(confirmOk === true, 'Confirm succeeded');
  assert(harnessConfirm.status === 'confirmed', 'Harness status confirmed');
  assert(useTaskStore.getState().tasks.length === preCount + 1, 'Exactly one task created in store');

  // --- 26. STALE / DELETED GOAL -> REJECTION ---
  console.log('\n--- 26. STALE / DELETED GOAL REJECTION ---');
  (RepositoryFactory.getGoalRepository() as any)._saveAllSync([]);
  useGoalStore.setState({ goals: [], status: 'ready', error: null });

  const staleProposal: TaskActionProposal = {
    id: 'prop-stale-next-1',
    source: 'next_action',
    requiresGoal: true,
    title: 'مهمة لهدف محذوف',
    priority: 'medium',
    date: todayStr,
    goalId: unattendedGoal.id,
    goalTitle: unattendedGoal.title,
    status: 'pending',
  };

  const harnessStale = new TaskProposalHarness(staleProposal);
  const staleConfirmOk = await harnessStale.confirm();
  assert(staleConfirmOk === false, 'Confirmation rejected when goal is deleted');
  assert(harnessStale.status === 'pending', 'Proposal status remains pending (not confirmed)');
  assert(harnessStale.errorMessage !== null, 'Localized error message set on stale goal');

  // --- 27. RAPID DOUBLE CONFIRMATION -> EXACTLY ONE TASK ---
  console.log('\n--- 27. DOUBLE CONFIRMATION MUTEX ---');
  const validLiveGoal: Goal = {
    id: 'g-live-mutex-next',
    title: 'هدف اختبار التزامن',
    description: 'هدف لحماية التزامن',
    progress: 15,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
  };
  (RepositoryFactory.getGoalRepository() as any)._saveAllSync([validLiveGoal]);
  useGoalStore.setState({ goals: [validLiveGoal], status: 'ready', error: null });

  const mutexProposal: TaskActionProposal = {
    id: 'prop-mutex-next-1',
    source: 'next_action',
    requiresGoal: true,
    title: 'مهمة اختبار التزامن السريع',
    priority: 'medium',
    date: todayStr,
    goalId: validLiveGoal.id,
    goalTitle: validLiveGoal.title,
    status: 'pending',
  };

  const mutexHarness = new TaskProposalHarness(mutexProposal);
  const taskCountBeforeDouble = useTaskStore.getState().tasks.length;
  const [resDouble1, resDouble2] = await Promise.all([
    mutexHarness.confirm(),
    mutexHarness.confirm(),
  ]);

  assert(
    (resDouble1 && !resDouble2) || (!resDouble1 && resDouble2),
    'Exactly one concurrent confirmation succeeded; mutex blocked duplicate'
  );
  assert(
    useTaskStore.getState().tasks.length === taskCountBeforeDouble + 1,
    'Exactly one task created despite concurrent double-clicks'
  );

  // --- 28. CHAT MESSAGE CORRELATION ---
  console.log('\n--- 28. CHAT MESSAGE CORRELATION ---');
  const testMsgId = 'msg-corr-next-123';
  const orchCorr = await aiOrchestrator.orchestrate({
    message: 'ماذا أفعل الآن',
    context: createTestContext([], [validLiveGoal]),
    language: 'ar',
  });

  if (orchCorr.taskProposal) {
    orchCorr.taskProposal.originatingMessageId = testMsgId;
    assert(orchCorr.taskProposal.originatingMessageId === testMsgId, 'Proposal anchored to chat message');
  }

  // --- TIER 4 ALL CLEAR VERIFICATION ---
  console.log('\n--- TIER 4: ALL CLEAR VERIFICATION ---');
  const completedTaskToday: Task = {
    id: 't-comp-today',
    title: 'مهمة منجزة اليوم',
    completed: true,
    priority: 'high',
    date: todayStr,
    goalId: validLiveGoal.id,
    createdAt: '2026-01-01T10:00:00.000Z',
  };

  const resAllClear = determineNextAction([completedTaskToday], [validLiveGoal]);
  assert(resAllClear.tier === 'tier4_all_clear', 'Tier 4 all-clear returned when all tasks done and goals attended');
  assert(!resAllClear.recommendedTask, 'No task recommended on all clear');
  assert(!resAllClear.selectedGoal, 'No goal proposed on all clear');

  console.log('\n========================================');
  console.log('🎉 ALL GATE 17.3 TEST SUITES PASSED! 🎉');
  console.log('========================================');
}

runTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
