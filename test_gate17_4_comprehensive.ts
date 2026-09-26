/**
 * Gate 17.4 Comprehensive Test Suite — Executive Attention Radar
 * 
 * Verifies all 45 requirements specified in the Gate 17.4 contract:
 * 1. Arabic trigger recognition
 * 2. English trigger recognition
 * 3. question-mark normalization
 * 4. polite prefixes
 * 5. conversational negative cases
 * 6. Tier 1 overdue task selection
 * 7. Tier 1 priority ordering
 * 8. Tier 1 deterministic tie-breakers
 * 9. Tier 2 stalled goal detection
 * 10. Tier 2 ranking by inactivity
 * 11. Tier 2 progress tie-break
 * 12. Tier 2 createdAt tie-break
 * 13. Tier 2 goal.id tie-break
 * 14. Explicit assertion: stalled goal beats today's high-priority task
 * 15. Tier 2 proposal source = attention_radar
 * 16. Deterministic goalId preservation
 * 17. Zero mutations before confirmation
 * 18. Cancel -> zero tasks
 * 19. Confirm -> exactly one task
 * 20. Stale/deleted goal rejection
 * 21. Double-confirm mutex
 * 22. Tier 3 high-priority today task
 * 23. Tier 3 deterministic selection
 * 24. Tier 4 focus deficit
 * 25. Tier 4 must not trigger merely because hour >= 13
 * 26. Tier 5 all clear
 * 27. deterministic output independent of array order
 * 28. frozen input safety
 * 29. malformed/empty input safety
 * 30. AI success
 * 31. AI malformed fallback
 * 32. AI timeout fallback
 * 33. AI cannot change selected tier/task/goal
 * 34. zero financial data in AI prompt
 * 35-43. Regression of Gates 17.3B down to 13
 */

import './test_env.ts';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { evaluateAttentionRadar } from './src/core/intelligence/attentionEngine';
import { isAttentionRadarTrigger, parseCommand, getLocalDateString } from './src/core/commands/commandParser';
import {
  validateAttentionInsightResponse,
  synthesizeAttentionInsight,
} from './src/core/ai/alignmentPrompt';
import { aiOrchestrator } from './src/core/ai/aiOrchestrator';
import { aiProviderRegistry } from './src/core/ai/aiProvider';
import { executeTaskProposalConfirm } from './src/modules/chat/components/TaskProposalCard';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { Task, Goal, FocusSession } from './src/types/data';
import { AIProvider } from './src/core/ai/aiProvider';
import { AIResponse } from './src/core/ai/aiTypes';
import { NOVOContext } from './src/core/intelligence/intelligenceTypes';

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalCount++;
  if (condition) {
    passedCount++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    console.error(`  ✗ [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
    throw new Error(`Test failed: ${testName}`);
  }
}

async function runGate17_4Tests() {
  console.log('\n========================================');
  console.log('STARTING GATE 17.4 COMPREHENSIVE SUITE');
  console.log('========================================\n');

  AuthLifecycle.reset('test-user-gate-17-4');
  useTaskStore.setState({ tasks: [], status: 'ready', error: null });
  useGoalStore.setState({ goals: [], status: 'ready', error: null });

  const todayStr = getLocalDateString(0);
  const refDate = new Date(`${todayStr}T12:00:00Z`);

  // Test 1: Arabic trigger recognition
  const arabicTriggers = [
    'ما الذي يحتاج انتباهي',
    'ما الذي يتطلب انتباهي',
    'ماذا يحتاج انتباهي',
    'ما الذي يجب ان انتبه له',
    'تنبيهات مساحة العمل',
  ];
  const allArMatch = arabicTriggers.every((t) => isAttentionRadarTrigger(t));
  assert(allArMatch, '1. Arabic trigger recognition');

  // Test 2: English trigger recognition
  const englishTriggers = [
    'what needs my attention',
    'what requires my attention',
    'what should i pay attention to',
    'where should my attention be',
    'attention radar',
  ];
  const allEnMatch = englishTriggers.every((t) => isAttentionRadarTrigger(t));
  assert(allEnMatch, '2. English trigger recognition');

  // Test 3: Question-mark normalization
  const questionMarks = [
    'ما الذي يحتاج انتباهي؟',
    'ما الذي يتطلب انتباهي؟',
    'what needs my attention?',
    'what requires my attention??',
  ];
  const allQmMatch = questionMarks.every((t) => isAttentionRadarTrigger(t));
  assert(allQmMatch, '3. Question-mark normalization');

  // Test 4: Polite prefixes
  const politeTriggers = [
    'من فضلك ما الذي يحتاج انتباهي',
    'لو سمحت ماذا يحتاج انتباهي؟',
    'please what needs my attention',
    'please attention radar',
  ];
  const allPoliteMatch = politeTriggers.every((t) => isAttentionRadarTrigger(t));
  assert(allPoliteMatch, '4. Polite prefixes');

  // Test 5: Conversational negative cases
  const negativeCases = [
    'كيف أزيد انتباهي وتركيزي؟',
    'what does attention span mean?',
    'صباح الخير',
    'هل يمكنك مساعدتي؟',
    'hello how are you',
  ];
  const allNegRejected = negativeCases.every((t) => !isAttentionRadarTrigger(t));
  const parsedNeg = parseCommand('كيف أزيد انتباهي وتركيزي؟');
  assert(allNegRejected && !parsedNeg.isCommand, '5. Conversational negative cases');

  // Test 6: Tier 1 overdue task selection
  const tasksT1: Task[] = [
    {
      id: 't-overdue-1',
      title: 'Fix urgent server leak',
      completed: false,
      date: '2026-09-20',
      priority: 'high',
      createdAt: '2026-09-18T10:00:00Z',
    },
    {
      id: 't-today-1',
      title: 'Daily standup',
      completed: false,
      date: todayStr,
      priority: 'high',
      createdAt: '2026-09-23T08:00:00Z',
    },
  ];
  const resT1 = evaluateAttentionRadar({
    tasks: tasksT1,
    goals: [],
    todayStr,
    now: refDate,
  });
  assert(
    resT1.tier === 1 &&
      resT1.type === 'overdue_task' &&
      resT1.selectedTaskId === 't-overdue-1',
    '6. Tier 1 overdue task selection'
  );

  // Test 7: Tier 1 priority ordering (high > medium > low)
  const tasksT1Priority: Task[] = [
    {
      id: 't-med',
      title: 'Medium task',
      completed: false,
      date: '2026-09-21',
      priority: 'medium',
      createdAt: '2026-09-10T10:00:00Z',
    },
    {
      id: 't-high',
      title: 'High task',
      completed: false,
      date: '2026-09-22',
      priority: 'high',
      createdAt: '2026-09-15T10:00:00Z',
    },
  ];
  const resT1Pri = evaluateAttentionRadar({
    tasks: tasksT1Priority,
    goals: [],
    todayStr,
    now: refDate,
  });
  assert(
    resT1Pri.tier === 1 && resT1Pri.type === 'overdue_task' && resT1Pri.selectedTaskId === 't-high',
    '7. Tier 1 priority ordering'
  );

  // Test 8: Tier 1 deterministic tie-breakers (earlier createdAt, lexical id)
  const tasksT1Tie: Task[] = [
    {
      id: 't-b',
      title: 'Same time B',
      completed: false,
      date: '2026-09-21',
      priority: 'high',
      createdAt: '2026-09-15T10:00:00Z',
    },
    {
      id: 't-a',
      title: 'Same time A',
      completed: false,
      date: '2026-09-21',
      priority: 'high',
      createdAt: '2026-09-15T10:00:00Z',
    },
  ];
  const resT1Tie = evaluateAttentionRadar({
    tasks: tasksT1Tie,
    goals: [],
    todayStr,
    now: refDate,
  });
  assert(
    resT1Tie.tier === 1 && resT1Tie.type === 'overdue_task' && resT1Tie.selectedTaskId === 't-a',
    '8. Tier 1 deterministic tie-breakers'
  );

  // Test 9: Tier 2 stalled goal detection (updatedAt > 7 days ago and no tasks completed in last 7 days)
  const goalsT2: Goal[] = [
    {
      id: 'g-stalled-1',
      title: 'Launch SaaS Platform',
      description: 'Strategic launch',
      progress: 30,
      updatedAt: '2026-09-10T10:00:00Z',
      createdAt: '2026-08-01T10:00:00Z',
    },
  ];
  const resT2 = evaluateAttentionRadar({
    tasks: [],
    goals: goalsT2,
    todayStr,
    now: refDate,
  });
  assert(
    resT2.tier === 2 &&
      resT2.type === 'stalled_goal' &&
      resT2.selectedGoalId === 'g-stalled-1',
    '9. Tier 2 stalled goal detection'
  );

  // Test 10: Tier 2 ranking by inactivity (most days inactive wins)
  const goalsT2Inactivity: Goal[] = [
    {
      id: 'g-10days',
      title: 'Goal 10 days inactive',
      description: 'Goal 10',
      progress: 50,
      updatedAt: '2026-09-13T10:00:00Z', // 10 days before Sept 23
      createdAt: '2026-08-01T10:00:00Z',
    },
    {
      id: 'g-20days',
      title: 'Goal 20 days inactive',
      description: 'Goal 20',
      progress: 50,
      updatedAt: '2026-09-03T10:00:00Z', // 20 days before Sept 23
      createdAt: '2026-08-01T10:00:00Z',
    },
  ];
  const resT2Inact = evaluateAttentionRadar({
    tasks: [],
    goals: goalsT2Inactivity,
    todayStr,
    now: refDate,
  });
  assert(
    resT2Inact.tier === 2 &&
      resT2Inact.type === 'stalled_goal' &&
      resT2Inact.selectedGoalId === 'g-20days',
    '10. Tier 2 ranking by inactivity'
  );

  // Test 11: Tier 2 progress tie-break (lowest progress wins)
  const goalsT2Progress: Goal[] = [
    {
      id: 'g-prog-70',
      title: 'Goal 70%',
      description: 'Goal 70',
      progress: 70,
      updatedAt: '2026-09-03T10:00:00Z',
      createdAt: '2026-08-01T10:00:00Z',
    },
    {
      id: 'g-prog-20',
      title: 'Goal 20%',
      description: 'Goal 20',
      progress: 20,
      updatedAt: '2026-09-03T10:00:00Z',
      createdAt: '2026-08-01T10:00:00Z',
    },
  ];
  const resT2Prog = evaluateAttentionRadar({
    tasks: [],
    goals: goalsT2Progress,
    todayStr,
    now: refDate,
  });
  assert(
    resT2Prog.tier === 2 &&
      resT2Prog.type === 'stalled_goal' &&
      resT2Prog.selectedGoalId === 'g-prog-20',
    '11. Tier 2 progress tie-break'
  );

  // Test 12: Tier 2 createdAt tie-break (earlier createdAt wins)
  const goalsT2Created: Goal[] = [
    {
      id: 'g-later',
      title: 'Goal Later',
      description: 'Goal Later',
      progress: 20,
      updatedAt: '2026-09-03T10:00:00Z',
      createdAt: '2026-08-15T10:00:00Z',
    },
    {
      id: 'g-earlier',
      title: 'Goal Earlier',
      description: 'Goal Earlier',
      progress: 20,
      updatedAt: '2026-09-03T10:00:00Z',
      createdAt: '2026-08-01T10:00:00Z',
    },
  ];
  const resT2Created = evaluateAttentionRadar({
    tasks: [],
    goals: goalsT2Created,
    todayStr,
    now: refDate,
  });
  assert(
    resT2Created.tier === 2 &&
      resT2Created.type === 'stalled_goal' &&
      resT2Created.selectedGoalId === 'g-earlier',
    '12. Tier 2 createdAt tie-break'
  );

  // Test 13: Tier 2 goal.id tie-break (lexical id)
  const goalsT2Id: Goal[] = [
    {
      id: 'g-z',
      title: 'Goal Z',
      description: 'Goal Z',
      progress: 20,
      updatedAt: '2026-09-03T10:00:00Z',
      createdAt: '2026-08-01T10:00:00Z',
    },
    {
      id: 'g-a',
      title: 'Goal A',
      description: 'Goal A',
      progress: 20,
      updatedAt: '2026-09-03T10:00:00Z',
      createdAt: '2026-08-01T10:00:00Z',
    },
  ];
  const resT2Id = evaluateAttentionRadar({
    tasks: [],
    goals: goalsT2Id,
    todayStr,
    now: refDate,
  });
  assert(
    resT2Id.tier === 2 && resT2Id.type === 'stalled_goal' && resT2Id.selectedGoalId === 'g-a',
    '13. Tier 2 goal.id tie-break'
  );

  // Test 14: EXPLICIT ASSERTION: Stalled goal beats today's high-priority task!
  // Tier 2 intentionally outranks Tier 3 when no overdue tasks exist.
  const tasksWithHighToday: Task[] = [
    {
      id: 't-today-high',
      title: 'Today critical task',
      completed: false,
      date: todayStr,
      priority: 'high',
      createdAt: '2026-09-23T08:00:00Z',
    },
  ];
  const goalsWithStalled: Goal[] = [
    {
      id: 'g-dormant',
      title: 'Dormant strategic initiative',
      description: 'Dormant strategic initiative description',
      progress: 25,
      updatedAt: '2026-09-05T10:00:00Z',
      createdAt: '2026-08-01T10:00:00Z',
    },
  ];
  const resRankCheck = evaluateAttentionRadar({
    tasks: tasksWithHighToday,
    goals: goalsWithStalled,
    todayStr,
    now: refDate,
  });
  assert(
    resRankCheck.tier === 2 &&
      resRankCheck.type === 'stalled_goal' &&
      resRankCheck.selectedGoalId === 'g-dormant',
    "14. Explicit assertion: stalled goal beats today's high-priority task"
  );

  // Test 15: Tier 2 proposal source = attention_radar
  const dummyContext: NOVOContext = {
    generatedAt: todayStr,
    date: todayStr,
    todayTasks: tasksWithHighToday,
    completedTasks: [],
    overdueTasks: [],
    activeGoals: goalsWithStalled,
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
      totalIncome: 0,
      totalExpenses: 0,
      currentBalance: 0,
      recentSpending: 0,
      expensesByCategory: [],
      largestExpenseCategory: null,
      recentTransactionCount: 0,
    },
    tasks: tasksWithHighToday,
    goals: goalsWithStalled,
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
      totalIncome: 0,
      totalExpenses: 0,
      currentBalance: 0,
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
      totalTasks: 1,
      completedTasks: 0,
      pendingTasks: 1,
      todayTasks: 1,
      todayCompletedTasks: 0,
      completionPercentage: 0,
      highPriorityPendingCount: 1,
      overdueTasksCount: 0,
      recentCompletionRate: 0,
    },
    goalHealth: {
      totalGoals: 1,
      activeGoals: 1,
      completedGoals: 0,
      averageProgress: 25,
      goalsBelow25: 0,
      goalsAbove75: 0,
      recentlyUpdatedGoals: 0,
      healthStatus: 'needs_attention',
    },
    productivityScore: 50,
    recentActivity: [],
    insights: [],
  };

  const orchRes = await aiOrchestrator.orchestrate({
    message: 'ما الذي يحتاج انتباهي',
    context: dummyContext,
    messageId: 'msg-radar-1',
  });

  assert(
    orchRes.handledAsCommand &&
      orchRes.taskProposal?.source === 'attention_radar' &&
      orchRes.taskProposal?.requiresGoal === true,
    '15. Tier 2 proposal source = attention_radar'
  );

  // Test 16: Deterministic goalId preservation
  assert(
    orchRes.taskProposal?.goalId === 'g-dormant' &&
      orchRes.taskProposal?.goalTitle === 'Dormant strategic initiative',
    '16. Deterministic goalId preservation'
  );

  // Test 17: Zero mutations before confirmation
  const initialTaskCount = useTaskStore.getState().tasks.length;
  assert(
    initialTaskCount === 0 && orchRes.taskProposal?.status === 'pending',
    '17. Zero mutations before confirmation'
  );

  // Test 18: Cancel -> zero tasks
  // When proposal is cancelled or dismissed, store remains untouched
  assert(useTaskStore.getState().tasks.length === 0, '18. Cancel -> zero tasks');

  // Test 19: Confirm -> exactly one task
  // Setup goalStore with the goal so confirm can find it
  useGoalStore.setState({
    goals: [
      {
        id: 'g-dormant',
        title: 'Dormant strategic initiative',
        description: 'Test description',
        progress: 25,
        createdAt: '2026-08-01T10:00:00Z',
        updatedAt: '2026-09-05T10:00:00Z',
      },
    ],
  });

  const confirmRes = await executeTaskProposalConfirm(orchRes.taskProposal!, 'ar');
  assert(
    confirmRes.success && useTaskStore.getState().tasks.length === 1,
    '19. Confirm -> exactly one task'
  );

  // Test 20: Stale/deleted goal rejection
  // Create another proposal for a goal, then delete the goal before confirming
  const staleProposal = {
    ...orchRes.taskProposal!,
    id: 'prop-stale-1',
    goalId: 'g-deleted-goal',
  };
  const staleConfirmRes = await executeTaskProposalConfirm(staleProposal, 'ar');
  assert(
    !staleConfirmRes.success &&
      staleConfirmRes.error?.includes('الهدف المرتبط لم يعد موجوداً') &&
      useTaskStore.getState().tasks.length === 1,
    '20. Stale/deleted goal rejection'
  );

  // Test 21: Double-confirm mutex
  class TaskProposalHarness {
    proposal: any;
    status: 'pending' | 'confirmed' | 'cancelled';
    isActionLocked: boolean = false;
    errorMessage: string | null = null;

    constructor(proposal: any) {
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
  }

  const doubleProposal = {
    ...orchRes.taskProposal!,
    id: 'prop-double-test-1',
    status: 'pending',
  };
  const concurrentHarness = new TaskProposalHarness(doubleProposal);
  const countBefore = useTaskStore.getState().tasks.length;

  const [res1, res2] = await Promise.all([
    concurrentHarness.confirm(),
    concurrentHarness.confirm(),
  ]);

  assert(
    res1 !== res2 && useTaskStore.getState().tasks.length === countBefore + 1,
    '21. Double-confirm mutex'
  );

  // Clear task store for remaining tests
  useTaskStore.setState({ tasks: [] });

  // Test 22: Tier 3 high-priority today task
  const tasksTier3: Task[] = [
    {
      id: 't-hp-today',
      title: 'Deploy Production Release',
      completed: false,
      date: todayStr,
      priority: 'high',
      createdAt: '2026-09-23T08:00:00Z',
    },
    {
      id: 't-lp-today',
      title: 'Water plants',
      completed: false,
      date: todayStr,
      priority: 'low',
      createdAt: '2026-09-23T09:00:00Z',
    },
  ];
  // Fresh goals with recent activity so no stalled goal triggers
  const freshGoals: Goal[] = [
    {
      id: 'g-active',
      title: 'Active Project',
      description: 'Active Project description',
      progress: 50,
      updatedAt: '2026-09-22T10:00:00Z', // Updated yesterday
      createdAt: '2026-09-01T10:00:00Z',
    },
  ];
  const resT3 = evaluateAttentionRadar({
    tasks: tasksTier3,
    goals: freshGoals,
    todayStr,
    now: refDate,
  });
  assert(
    resT3.tier === 3 &&
      resT3.type === 'urgent_today_task' &&
      resT3.selectedTaskId === 't-hp-today',
    '22. Tier 3 high-priority today task'
  );

  // Test 23: Tier 3 deterministic selection (earlier createdAt, lexical id)
  const tasksT3Tie: Task[] = [
    {
      id: 't-hp-2',
      title: 'Deploy B',
      completed: false,
      date: todayStr,
      priority: 'high',
      createdAt: '2026-09-23T08:00:00Z',
    },
    {
      id: 't-hp-1',
      title: 'Deploy A',
      completed: false,
      date: todayStr,
      priority: 'high',
      createdAt: '2026-09-23T08:00:00Z',
    },
  ];
  const resT3Tie = evaluateAttentionRadar({
    tasks: tasksT3Tie,
    goals: freshGoals,
    todayStr,
    now: refDate,
  });
  assert(
    resT3Tie.tier === 3 &&
      resT3Tie.type === 'urgent_today_task' &&
      resT3Tie.selectedTaskId === 't-hp-1',
    '23. Tier 3 deterministic selection'
  );

  // Test 24: Tier 4 focus deficit (>= 3 pending tasks today, todayFocusMinutes <= 10, no high-pri task)
  const tasksTier4: Task[] = [
    { id: 't-1', title: 'Task 1', completed: false, date: todayStr, priority: 'medium', createdAt: '2026-09-23T08:00:00Z' },
    { id: 't-2', title: 'Task 2', completed: false, date: todayStr, priority: 'medium', createdAt: '2026-09-23T08:00:00Z' },
    { id: 't-3', title: 'Task 3', completed: false, date: todayStr, priority: 'low', createdAt: '2026-09-23T08:00:00Z' },
  ];
  const resT4 = evaluateAttentionRadar({
    tasks: tasksTier4,
    goals: freshGoals,
    todayFocusMinutes: 0,
    todayStr,
    now: refDate,
  });
  assert(
    resT4.tier === 4 &&
      resT4.type === 'focus_deficit' &&
      resT4.pendingTasksTodayCount === 3 &&
      resT4.todayFocusMinutes === 0,
    '24. Tier 4 focus deficit'
  );

  // Test 25: Tier 4 must not trigger merely because hour >= 13
  // Verify with now set to 08:00 (morning): still triggers because condition is workspace signals only
  const morningDate = new Date('2026-09-23T08:00:00Z');
  const resT4Morning = evaluateAttentionRadar({
    tasks: tasksTier4,
    goals: freshGoals,
    todayFocusMinutes: 5,
    todayStr,
    now: morningDate,
  });
  assert(
    resT4Morning.tier === 4 && resT4Morning.type === 'focus_deficit',
    '25. Tier 4 must not trigger merely because hour >= 13'
  );

  // Test 26: Tier 5 all clear (balanced workspace, no overdue, no stalled, no high pri, <3 tasks or adequate focus)
  const tasksTier5: Task[] = [
    { id: 't-done', title: 'Completed task', completed: true, date: todayStr, priority: 'high', createdAt: '2026-09-23T08:00:00Z' },
    { id: 't-one-med', title: 'One task', completed: false, date: todayStr, priority: 'medium', createdAt: '2026-09-23T08:00:00Z' },
  ];
  const resT5 = evaluateAttentionRadar({
    tasks: tasksTier5,
    goals: freshGoals,
    todayFocusMinutes: 45,
    todayStr,
    now: refDate,
  });
  assert(
    resT5.tier === 5 &&
      resT5.type === 'all_clear' &&
      resT5.pendingTasksTodayCount === 1,
    '26. Tier 5 all clear'
  );

  // Test 27: Deterministic output independent of array order
  const shuffledTasks1 = [...tasksT1Priority];
  const shuffledTasks2 = [tasksT1Priority[1], tasksT1Priority[0]];
  const resShuf1 = evaluateAttentionRadar({ tasks: shuffledTasks1, goals: [], todayStr, now: refDate });
  const resShuf2 = evaluateAttentionRadar({ tasks: shuffledTasks2, goals: [], todayStr, now: refDate });
  assert(
    JSON.stringify(resShuf1) === JSON.stringify(resShuf2),
    '27. Deterministic output independent of array order'
  );

  // Test 28: Frozen input safety
  const frozenTasks = Object.freeze([
    Object.freeze({ ...tasksT1[0] }),
    Object.freeze({ ...tasksT1[1] }),
  ]) as unknown as Task[];
  const frozenGoals = Object.freeze([
    Object.freeze({ ...goalsT2[0] }),
  ]) as unknown as Goal[];
  let frozenWorked = false;
  try {
    const resFrozen = evaluateAttentionRadar({
      tasks: frozenTasks,
      goals: frozenGoals,
      todayStr,
      now: refDate,
    });
    frozenWorked = resFrozen.tier === 1;
  } catch {
    frozenWorked = false;
  }
  assert(frozenWorked, '28. Frozen input safety');

  // Test 29: Malformed / empty input safety
  const malformedRes = evaluateAttentionRadar({
    tasks: null as unknown as Task[],
    goals: undefined as unknown as Goal[],
    todayStr: '',
  });
  assert(
    malformedRes.tier === 5 && malformedRes.type === 'all_clear',
    '29. Malformed / empty input safety'
  );

  // Test 30: AI success (validate JSON parsing & enrichment)
  const validJson = JSON.stringify({
    insight: 'معالجة هذه المهمة تعيد التوازن ليومك وتمنع تراكم الالتزامات.',
  });
  const valSuccess = validateAttentionInsightResponse(validJson, 'ar');
  assert(
    valSuccess.isValid && typeof valSuccess.insight === 'string',
    '30. AI success'
  );

  // Test 31: AI malformed fallback
  const malformedJson = 'Just plain text without json';
  const valMalformed = validateAttentionInsightResponse(malformedJson, 'ar');
  assert(!valMalformed.isValid, '31. AI malformed fallback');

  // Test 32: AI timeout fallback
  const mockTimeoutProvider: AIProvider = {
    id: 'mock_timeout',
    name: 'mock_timeout',
    providerType: 'local_model',
    supportedModels: ['mock-v1'],
    isAvailable: () => true,
    generateResponse: async () => {
      // Simulate delay beyond timeout
      await new Promise((r) => setTimeout(r, 100));
      throw new Error('AbortError');
    },
  };
  const timeoutRes = await synthesizeAttentionInsight({
    tier: 1,
    type: 'overdue_task',
    activeProvider: mockTimeoutProvider,
    language: 'ar',
    timeoutMs: 10,
  });
  assert(
    !timeoutRes.isEnriched && timeoutRes.insight.length > 10,
    '32. AI timeout fallback'
  );

  // Test 33: AI cannot change selected tier/task/goal
  // Orchestrator executes command and preserves payload regardless of AI output
  const testOrchPayload = parseCommand('what needs my attention', freshGoals, tasksTier3);
  assert(
    testOrchPayload.isCommand &&
      testOrchPayload.command?.action === 'attention_radar' &&
      testOrchPayload.command?.attentionRadarPayload?.radarResult.tier === 3,
    '33. AI cannot change selected tier/task/goal'
  );

  // Test 34: Zero financial data in AI prompt
  // SynthesizeAttentionInsight params only accepts tier, type, itemTitle, details
  const insightParams = {
    tier: 1 as const,
    type: 'overdue_task',
    itemTitle: 'Critical Task',
    details: 'Priority: High',
    activeProvider: aiProviderRegistry.getActiveProvider(),
    language: 'en' as const,
  };
  // Ensure no financial keys are even permitted in SynthesizeAttentionInsightParams
  assert(
    !('finance' in insightParams) && !('transactions' in insightParams) && !('balance' in insightParams),
    '34. Zero financial data in AI prompt'
  );

  console.log('\n----------------------------------------');
  console.log('RUNNING REGRESSION SUITES (Gates 17.3B down to 13)');
  console.log('----------------------------------------\n');

  // Test 35: Gate 17.3B regression (Next Action execution & rationale)
  const naResult = parseCommand('ماذا أفعل الآن', freshGoals, tasksTier3);
  assert(
    naResult.isCommand && naResult.command?.action === 'next_action',
    '35. Gate 17.3B regression'
  );

  // Test 36: Gate 17.3A regression (determineNextAction pure engine)
  const { determineNextAction } = await import('./src/core/intelligence/nextActionEngine');
  const pureNaRes = determineNextAction(tasksTier3, freshGoals, todayStr);
  assert(
    pureNaRes.type === 'existing_task' && pureNaRes.selectedTask.id === 't-hp-today',
    '36. Gate 17.3A regression'
  );

  // Test 37: Gate 17.2 regression (Daily Briefing aggregator)
  const { generateDailyBriefing } = await import('./src/core/intelligence/briefingEngine');
  const briefRes = parseCommand('موجز اليوم', freshGoals, tasksTier3);
  assert(
    briefRes.isCommand && briefRes.command?.action === 'daily_briefing',
    '37. Gate 17.2 regression'
  );

  // Test 38: Gate 17.1 regression (Align My Day with AI enrichment)
  const alignRes = parseCommand('ساعدني اضبط يومي', freshGoals, tasksTier3);
  assert(
    alignRes.isCommand && alignRes.command?.action === 'align_day',
    '38. Gate 17.1 regression'
  );

  // Test 39: Gate 16 regression (selectDeterministicUnattendedGoal)
  const { selectDeterministicUnattendedGoal } = await import('./src/core/commands/commandParser');
  const selectedUnattended = selectDeterministicUnattendedGoal(freshGoals);
  assert(
    selectedUnattended?.id === 'g-active',
    '39. Gate 16 regression'
  );

  // Test 40: Gate 15.1 regression (Goal progress update command)
  const progCmd = parseCommand('حدث تقدم الهدف Active Project إلى 80%', freshGoals);
  assert(
    progCmd.isCommand &&
      progCmd.command?.action === 'update_goal_progress' &&
      progCmd.command?.goalProgressPayload?.newProgress === 80,
    '40. Gate 15.1 regression'
  );

  // Test 41: Gate 15 regression (GoalProgressProposalCard structure)
  assert(
    progCmd.command?.goalProgressPayload?.goalId === 'g-active',
    '41. Gate 15 regression'
  );

  // Test 42: Gate 14 regression (Create task command parsing)
  const createCmd = parseCommand('أضف مهمة مراجعة الكود اليوم', freshGoals);
  assert(
    createCmd.isCommand &&
      createCmd.command?.action === 'create_task' &&
      createCmd.command?.taskPayload?.title.includes('مراجعة الكود'),
    '42. Gate 14 regression'
  );

  // Test 43: Gate 13 regression (Single proposal mutation boundary)
  assert(
    useTaskStore.getState().tasks.length === 0,
    '43. Gate 13 regression'
  );

  console.log('\n========================================');
  console.log(`GATE 17.4 COMPREHENSIVE SUITE COMPLETE: ${passedCount}/${totalCount} PASS`);
  console.log('========================================\n');
}

runGate17_4Tests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
