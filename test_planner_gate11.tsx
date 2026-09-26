import React from 'react';
import { create, act } from 'react-test-renderer';
import { HomeView } from './src/modules/home/HomeView';
import { PlannerView, getLocalTodayString } from './src/modules/planner/PlannerView';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { AppProvider, useApp } from './src/core/providers/AppContext';
import { Task, Goal } from './src/types/data';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { useAuthStore } from './src/core/auth/authStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { analyzeDailyGoalAlignment, DailyGoalAlignmentResult } from './src/core/intelligence/goalEngine';
import { buildAIGroundedContext } from './src/core/intelligence/contextBuilder';
import { buildNOVOContext } from './src/core/intelligence/contextEngine';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// App Wrapper
function TestAppWrapper({
  children,
  language = 'en',
}: {
  children: React.ReactNode;
  language?: 'ar' | 'en';
}) {
  return (
    <AppProvider>
      <LanguageController language={language}>{children}</LanguageController>
    </AppProvider>
  );
}

function LanguageController({
  children,
  language,
}: {
  children: React.ReactNode;
  language: 'ar' | 'en';
}) {
  const { setLanguage } = useApp();
  React.useEffect(() => {
    setLanguage(language);
  }, [language, setLanguage]);
  return <>{children}</>;
}

// Helpers for test setup
async function seedGoal(goal: Goal) {
  const repo = RepositoryFactory.getGoalRepository();
  const existing = await repo.getById(goal.id);
  if (!existing) {
    await repo.create(goal);
  } else {
    await repo.update(goal.id, goal);
  }
  useGoalStore.setState((prev) => ({
    goals: [...prev.goals.filter((g) => g.id !== goal.id), goal],
    status: 'ready',
  }));
}

async function seedTask(task: Task) {
  const repo = RepositoryFactory.getTaskRepository();
  const existing = await repo.getById(task.id);
  if (!existing) {
    await repo.create(task);
  } else {
    await repo.update(task.id, task);
  }
  useTaskStore.setState((prev) => ({
    tasks: [...prev.tasks.filter((t) => t.id !== task.id), task],
    status: 'ready',
  }));
}

async function clearWorkspace() {
  const taskRepo = RepositoryFactory.getTaskRepository();
  const goalRepo = RepositoryFactory.getGoalRepository();
  const tasks = await taskRepo.getAll();
  for (const t of tasks) {
    await taskRepo.delete(t.id);
  }
  const goals = await goalRepo.getAll();
  for (const g of goals) {
    await goalRepo.delete(g.id);
  }
  useTaskStore.setState({ tasks: [], status: 'ready' });
  useGoalStore.setState({ goals: [], status: 'ready' });
}

function findElementById(root: any, id: string): any {
  try {
    return root.find((node: any) => node.props && node.props.id === id);
  } catch {
    return null;
  }
}

function collectAllText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectAllText).join(' ');
  if (node.children) return collectAllText(node.children);
  return '';
}

async function runGate11Tests() {
  console.log('==================================================');
  console.log('STARTING GATE 11 VERIFICATION TEST SUITE');
  console.log('Theme: Daily Goal Alignment & Priority Intelligence');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  function record(testId: string, description: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`[PASS] ${testId}: ${description}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testId}: ${description}`);
      if (details) console.error(`       Details: ${details}`);
      failed++;
    }
  }

  const today = getLocalTodayString();
  const otherDay = '2025-01-01';

  // Sample data
  const goal1: Goal = {
    id: 'g-1',
    title: 'Launch NOVO Platform',
    description: 'Ship initial release',
    progress: 40,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const goal2: Goal = {
    id: 'g-2',
    title: 'Master Arabic Localization',
    description: 'RTL and typography excellence',
    progress: 20,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const goal3Unattended: Goal = {
    id: 'g-3',
    title: 'Health & Fitness Consistency',
    description: 'Daily training routine',
    progress: 15,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const goalInactive: Goal = {
    id: 'g-inactive',
    title: 'Completed Old Milestone',
    description: 'Already finished 100%',
    progress: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Setup tasks
  const task1: Task = {
    id: 't-1',
    title: 'Draft architecture roadmap',
    date: today,
    priority: 'high',
    completed: true,
    goalId: 'g-1',
    createdAt: new Date().toISOString(),
  };

  const task2: Task = {
    id: 't-2',
    title: 'Implement database indexing',
    date: today,
    priority: 'high',
    completed: false,
    goalId: 'g-1',
    createdAt: new Date().toISOString(),
  };

  const task3: Task = {
    id: 't-3',
    title: 'Translate dashboard labels',
    date: today,
    priority: 'medium',
    completed: false,
    goalId: 'g-2',
    createdAt: new Date().toISOString(),
  };

  const task4Orphan: Task = {
    id: 't-4',
    title: 'Fix random typo with invalid goal',
    date: today,
    priority: 'low',
    completed: false,
    goalId: 'g-nonexistent',
    createdAt: new Date().toISOString(),
  };

  const task5OtherDay: Task = {
    id: 't-5',
    title: 'Next week task',
    date: otherDay,
    priority: 'high',
    completed: false,
    goalId: 'g-1',
    createdAt: new Date().toISOString(),
  };

  const allTasks = [task1, task2, task3, task4Orphan, task5OtherDay];
  const allGoals = [goal1, goal2, goal3Unattended, goalInactive];

  // ----------------------------------------------------
  // G11-01: Correct todayTaskCount
  // ----------------------------------------------------
  const res1 = analyzeDailyGoalAlignment(allTasks, allGoals, today);
  record(
    'G11-01',
    'Correct todayTaskCount',
    res1.todayTaskCount === 4,
    `Expected 4 tasks today, got ${res1.todayTaskCount}`
  );

  // ----------------------------------------------------
  // G11-02: Correct todayGoalTaskCount
  // ----------------------------------------------------
  // Of the 4 tasks today, task1(g-1), task2(g-1), task3(g-2) link to active goals.
  // task4Orphan has invalid goalId.
  record(
    'G11-02',
    'Correct todayGoalTaskCount',
    res1.todayGoalTaskCount === 3,
    `Expected 3 goal-linked tasks, got ${res1.todayGoalTaskCount}`
  );

  // ----------------------------------------------------
  // G11-03: Correct todayGoalCompletionCount
  // ----------------------------------------------------
  // Only task1 is completed among goal-linked tasks
  record(
    'G11-03',
    'Correct todayGoalCompletionCount',
    res1.todayGoalCompletionCount === 1,
    `Expected 1 completed goal-linked task, got ${res1.todayGoalCompletionCount}`
  );

  // ----------------------------------------------------
  // G11-04: Correct alignmentRate
  // ----------------------------------------------------
  // 3 of 4 = 75%
  record(
    'G11-04',
    'Correct alignmentRate',
    res1.alignmentRate === 75,
    `Expected alignmentRate 75%, got ${res1.alignmentRate}%`
  );

  // ----------------------------------------------------
  // G11-05: Correct primaryGoal selection
  // ----------------------------------------------------
  // goal1 has 2 tasks today, goal2 has 1 task today -> primary is goal1
  record(
    'G11-05',
    'Correct primaryGoal selection',
    res1.primaryGoal?.id === 'g-1' && res1.primaryGoal?.title === 'Launch NOVO Platform',
    `Expected primary goal g-1, got ${res1.primaryGoal?.id}`
  );

  // Tie-breaking check:
  const tiedTasks: Task[] = [
    { id: 'tt-1', title: 'T1', date: today, priority: 'medium', completed: false, goalId: 'g-1', createdAt: '' },
    { id: 'tt-2', title: 'T2', date: today, priority: 'medium', completed: false, goalId: 'g-2', createdAt: '' },
  ];
  const tieRes = analyzeDailyGoalAlignment(tiedTasks, [goal1, goal2], today);
  record(
    'G11-05-tie',
    'Deterministic tie-breaking preserves activeGoals array order',
    tieRes.primaryGoal?.id === 'g-1',
    `Expected g-1 on tie, got ${tieRes.primaryGoal?.id}`
  );

  // ----------------------------------------------------
  // G11-06: Correct unattended active goals
  // ----------------------------------------------------
  // goal3Unattended has zero tasks today. goalInactive has 0 tasks but progress=100 (not active).
  record(
    'G11-06',
    'Correct unattended active goals',
    res1.unattendedGoals.length === 1 && res1.unattendedGoals[0].id === 'g-3',
    `Expected [g-3], got ${JSON.stringify(res1.unattendedGoals.map((g) => g.id))}`
  );

  // ----------------------------------------------------
  // G11-07: Invalid/orphaned goalIds are excluded from goal alignment
  // ----------------------------------------------------
  const orphanOnlyTasks: Task[] = [
    { id: 'o-1', title: 'Orphan task', date: today, priority: 'high', completed: false, goalId: 'non-existent', createdAt: '' },
  ];
  const orphanRes = analyzeDailyGoalAlignment(orphanOnlyTasks, [goal1], today);
  record(
    'G11-07',
    'Invalid/orphaned goalIds are excluded from goal alignment',
    orphanRes.todayTaskCount === 1 &&
      orphanRes.todayGoalTaskCount === 0 &&
      orphanRes.alignmentRate === 0 &&
      orphanRes.primaryGoal === null &&
      orphanRes.unattendedGoals.length === 1,
    `todayGoalTaskCount: ${orphanRes.todayGoalTaskCount}, alignmentRate: ${orphanRes.alignmentRate}`
  );

  // ----------------------------------------------------
  // G11-08: Inactive goals are excluded from active-goal alignment
  // ----------------------------------------------------
  const inactiveTask: Task = {
    id: 'it-1',
    title: 'Inactive goal task',
    date: today,
    priority: 'high',
    completed: false,
    goalId: 'g-inactive',
    createdAt: '',
  };
  const inactiveRes = analyzeDailyGoalAlignment([inactiveTask], [goalInactive], today);
  record(
    'G11-08',
    'Inactive goals are excluded from active-goal alignment',
    inactiveRes.todayGoalTaskCount === 0 &&
      inactiveRes.alignmentRate === 0 &&
      inactiveRes.unattendedGoals.length === 0,
    `todayGoalTaskCount: ${inactiveRes.todayGoalTaskCount}, unattendedGoals: ${inactiveRes.unattendedGoals.length}`
  );

  // ----------------------------------------------------
  // G11-09: Goal-linked high-priority tasks are identified correctly
  // ----------------------------------------------------
  // In res1, task1 (high, completed) and task2 (high, pending) are high priority and linked to goal1.
  record(
    'G11-09',
    'Goal-linked high-priority tasks are identified correctly',
    res1.goalAlignedPriorityTasks.some((t) => t.id === 't-2') &&
      !res1.goalAlignedPriorityTasks.some((t) => t.id === 't-3') && // medium
      !res1.goalAlignedPriorityTasks.some((t) => t.id === 't-4'), // orphan
    `goalAlignedPriorityTasks count: ${res1.goalAlignedPriorityTasks.length}`
  );

  // ----------------------------------------------------
  // G11-10: Zero-task day behaves safely with no divide-by-zero
  // ----------------------------------------------------
  const zeroRes = analyzeDailyGoalAlignment([], [goal1, goal2], today);
  record(
    'G11-10',
    'Zero-task day behaves safely with no divide-by-zero',
    zeroRes.todayTaskCount === 0 &&
      zeroRes.todayGoalTaskCount === 0 &&
      zeroRes.todayGoalCompletionCount === 0 &&
      zeroRes.alignmentRate === 0 &&
      !Number.isNaN(zeroRes.alignmentRate) &&
      zeroRes.primaryGoal === null &&
      zeroRes.unattendedGoals.length === 2 &&
      zeroRes.goalAlignedPriorityTasks.length === 0,
    `alignmentRate: ${zeroRes.alignmentRate}`
  );

  // ----------------------------------------------------
  // G11-11: Home Daily Briefing renders Goal Alignment information
  // ----------------------------------------------------
  AuthLifecycle.reset('test-user-gate11');
  useAuthStore.setState({
    user: {
      uid: 'test-user-gate11',
      getIdToken: async () => 'test-id-token',
    } as any,
  });

  await clearWorkspace();
  await seedGoal(goal1);
  await seedGoal(goal2);
  await seedGoal(goal3Unattended);
  await seedTask(task1);
  await seedTask(task2);
  await seedTask(task3);

  let homeRenderer: any;
  await act(async () => {
    homeRenderer = create(
      <TestAppWrapper language="en">
        <HomeView />
      </TestAppWrapper>
    );
  });

  const root = homeRenderer.root;
  const alignmentCard = findElementById(root, 'home-daily-goal-alignment');
  const summaryEl = findElementById(root, 'daily-goal-alignment-summary');

  record(
    'G11-11',
    'Home Daily Briefing renders Goal Alignment information',
    alignmentCard !== null && summaryEl !== null,
    `alignmentCard found: ${Boolean(alignmentCard)}, summaryEl found: ${Boolean(summaryEl)}`
  );

  // ----------------------------------------------------
  // G11-12: Arabic Goal Alignment labels render correctly
  // ----------------------------------------------------
  let homeRendererAr: any;
  await act(async () => {
    homeRendererAr = create(
      <TestAppWrapper language="ar">
        <HomeView />
      </TestAppWrapper>
    );
  });

  const rootAr = homeRendererAr.root;
  const alignmentCardAr = findElementById(rootAr, 'home-daily-goal-alignment');
  const cardTextAr = collectAllText(alignmentCardAr);

  record(
    'G11-12',
    'Arabic Goal Alignment labels render correctly',
    cardTextAr.includes('توافق أهداف اليوم') &&
      cardTextAr.includes('الهدف الرئيسي:') &&
      cardTextAr.includes('غير مجدول اليوم:'),
    `cardTextAr: ${cardTextAr.slice(0, 200)}...`
  );

  // ----------------------------------------------------
  // G11-13: English Goal Alignment labels render correctly
  // ----------------------------------------------------
  const cardTextEn = collectAllText(alignmentCard);
  record(
    'G11-13',
    'English Goal Alignment labels render correctly',
    cardTextEn.includes('Goal Alignment') &&
      cardTextEn.includes('Primary goal:') &&
      cardTextEn.includes('Not scheduled today:') &&
      cardTextEn.includes('support active goals'),
    `cardTextEn: ${cardTextEn.slice(0, 200)}...`
  );

  // ----------------------------------------------------
  // G11-14: AI context includes resolved goal title for valid goal-linked tasks
  // ----------------------------------------------------
  const contextSnapshot = buildNOVOContext({
    tasks: allTasks,
    goals: allGoals,
    notes: [],
    sessions: [],
    transactions: [],
  });

  const aiContext = buildAIGroundedContext(contextSnapshot);
  record(
    'G11-14',
    'AI context includes resolved goal title for valid goal-linked tasks',
    aiContext.includes('[Supports Goal: "Launch NOVO Platform"]') ||
      aiContext.includes('[Supports Goal: "Master Arabic Localization"]'),
    `Snippet: ${aiContext.split('## Goals')[0]}`
  );

  // ----------------------------------------------------
  // G11-15: AI context does not invent goal titles for invalid/missing goalIds
  // ----------------------------------------------------
  const orphanTaskLine = aiContext
    .split('\n')
    .find((line) => line.includes('Fix random typo with invalid goal'));
  record(
    'G11-15',
    'AI context does not invent goal titles for invalid/missing goalIds',
    orphanTaskLine !== undefined && !orphanTaskLine.includes('[Supports Goal:'),
    `orphanTaskLine: ${orphanTaskLine}`
  );

  // ----------------------------------------------------
  // G11-16: Context bounding/truncation behavior remains intact
  // ----------------------------------------------------
  // Create 40 tasks and verify criticalTasks remains capped at 30 items
  const manyTasks: Task[] = Array.from({ length: 40 }, (_, i) => ({
    id: `many-t-${i}`,
    title: `Overdue task ${i}`,
    date: '2024-01-01',
    priority: 'high',
    completed: false,
    goalId: 'g-1',
    createdAt: new Date().toISOString(),
  }));

  const manyContext = buildNOVOContext({
    tasks: manyTasks,
    goals: allGoals,
    notes: [],
    sessions: [],
    transactions: [],
  });

  const manyAiContext = buildAIGroundedContext(manyContext);
  const taskSection = manyAiContext.split('## Daily Planner')[1]?.split('## Goals')[0] || '';
  const renderedTaskLines = taskSection.split('\n').filter((l) => l.trim().startsWith('* ['));

  record(
    'G11-16',
    'Context bounding/truncation behavior remains intact (<= 30 tasks)',
    renderedTaskLines.length === 30,
    `Rendered ${renderedTaskLines.length} tasks in AI context`
  );

  // ----------------------------------------------------
  // G11-17: Gate 10 goal-chip behavior remains intact
  // ----------------------------------------------------
  let plannerRenderer: any;
  await act(async () => {
    plannerRenderer = create(
      <TestAppWrapper language="en">
        <PlannerView />
      </TestAppWrapper>
    );
  });

  const pRoot = plannerRenderer.root;
  const goalChip = pRoot.findByProps({ 'data-testid': `task-goal-badge-${task1.id}` });
  record(
    'G11-17',
    'Gate 10 goal-chip behavior remains intact in Planner',
    goalChip !== null,
    `goalChip found: ${Boolean(goalChip)}`
  );

  // ----------------------------------------------------
  // G11-18: Gate 10.1 progress feedback remains intact
  // ----------------------------------------------------
  // Completing a task linked to goal1 triggers the feedback prompt banner
  const toggleBtnTask2 = pRoot.findByProps({ 'data-testid': `task-toggle-${task2.id}` });
  if (toggleBtnTask2) {
    await act(async () => {
      await toggleBtnTask2.props.onClick();
    });
  }

  const progressPrompt = pRoot.findAllByProps({ 'data-testid': 'goal-progress-prompt' });
  record(
    'G11-18',
    'Gate 10.1 progress feedback prompt appears upon goal-linked task completion',
    progressPrompt.length > 0,
    `progressPrompt count: ${progressPrompt.length}`
  );

  // ----------------------------------------------------
  // G11-19: Gate 10.1 Goal.progress behavior remains unchanged
  // ----------------------------------------------------
  // Goal progress should still be 40 (human confirmation required, not automatically mutated)
  const currentGoal1 = useGoalStore.getState().goals.find((g) => g.id === 'g-1');
  record(
    'G11-19',
    'Gate 10.1 Goal.progress behavior remains unchanged (unconfirmed)',
    currentGoal1?.progress === 40,
    `Expected goal progress 40, got ${currentGoal1?.progress}`
  );

  // ----------------------------------------------------
  // G11-20: No store mutations occur during daily alignment calculation
  // ----------------------------------------------------
  const tasksBefore = JSON.stringify(useTaskStore.getState().tasks);
  const goalsBefore = JSON.stringify(useGoalStore.getState().goals);

  // Freeze input objects to guarantee zero mutation
  const frozenTasks = Object.freeze(allTasks.map((t) => Object.freeze({ ...t })));
  const frozenGoals = Object.freeze(allGoals.map((g) => Object.freeze({ ...g })));

  const frozenRes = analyzeDailyGoalAlignment(frozenTasks as any, frozenGoals as any, today);

  const tasksAfter = JSON.stringify(useTaskStore.getState().tasks);
  const goalsAfter = JSON.stringify(useGoalStore.getState().goals);

  record(
    'G11-20',
    'No store mutations occur during daily alignment calculation',
    tasksBefore === tasksAfter && goalsBefore === goalsAfter && frozenRes.alignmentRate === 75,
    'Store state preserved exactly, frozen objects processed without error'
  );

  // ----------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------
  console.log('\n==================================================');
  console.log(`GATE 11 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runGate11Tests().catch((err) => {
  console.error('Test execution crashed:', err);
  process.exit(1);
});
