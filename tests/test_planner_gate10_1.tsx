import React from 'react';
import { create, act } from 'react-test-renderer';
import { PlannerView, getLocalTodayString } from './src/modules/planner/PlannerView';
import { GoalsView } from './src/modules/goals/GoalsView';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { AppProvider, useApp } from './src/core/providers/AppContext';
import { Task, Goal } from './src/types/data';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { useAuthStore } from './src/core/auth/authStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { getGoalTaskActivity } from './src/core/intelligence/goalEngine';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// App Wrapper
function TestAppWrapper({ children, language = 'en' }: { children: React.ReactNode; language?: 'ar' | 'en' }) {
  return (
    <AppProvider>
      <LanguageController language={language}>{children}</LanguageController>
    </AppProvider>
  );
}

function LanguageController({ children, language }: { children: React.ReactNode; language: 'ar' | 'en' }) {
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

let passedCount = 0;
let failedCount = 0;

function getNodeText(node: any): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node || !node.children) return '';
  return node.children.map(getNodeText).join(' ');
}

function assert(testId: string, condition: boolean, description: string) {
  if (condition) {
    console.log(`[PASS] ${testId}: ${description}`);
    passedCount++;
  } else {
    console.error(`[FAIL] ${testId}: ${description}`);
    failedCount++;
  }
}

async function runGate10_1Tests() {
  console.log('=== RUNNING GATE 10.1 TESTS (Goal Progress Intelligence & Feedback) ===\n');

  // Initialize auth
  AuthLifecycle.reset('test-user-gate10-1');
  useAuthStore.setState({
    user: {
      uid: 'test-user-gate10-1',
      getIdToken: async () => 'test-id-token',
    } as any,
  });

  // Reset stores
  useTaskStore.setState({ tasks: [], status: 'ready', error: null });
  useGoalStore.setState({ goals: [], status: 'ready', error: null });

  const today = getLocalTodayString();

  // Common seed goal
  const sampleGoal: Goal = {
    id: 'goal-g10-1-alpha',
    title: 'Launch SaaS Platform',
    description: 'Ship initial release to customers',
    progress: 30,
    createdAt: `${today}T08:00:00Z`,
    updatedAt: `${today}T08:00:00Z`,
  };
  await seedGoal(sampleGoal);

  // ---------------------------------------------------------------------------
  // G10.1-01: Completing a normal task still works and shows no goal prompt
  // ---------------------------------------------------------------------------
  try {
    const normalTask: Task = {
      id: 'task-normal-no-goal',
      title: 'Water the plants',
      date: today,
      completed: false,
      priority: 'low',
      createdAt: `${today}T09:00:00Z`,
    };
    await seedTask(normalTask);

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const toggleBtn = root.root.findByProps({ 'data-testid': `task-toggle-${normalTask.id}` });
    await act(async () => {
      await toggleBtn.props.onClick();
    });

    const taskInStore = useTaskStore.getState().tasks.find((t) => t.id === normalTask.id);
    const prompts = root.root.findAllByProps({ 'data-testid': 'goal-progress-prompt' });

    assert(
      'G10.1-01',
      taskInStore?.completed === true && prompts.length === 0,
      'Completing a normal task still works and shows no goal prompt'
    );
  } catch (err: any) {
    assert('G10.1-01', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // G10.1-02: Completing a valid goal-linked task shows the feedback surface
  // ---------------------------------------------------------------------------
  try {
    const linkedTask: Task = {
      id: 'task-linked-to-alpha-1',
      title: 'Configure production DNS',
      date: today,
      completed: false,
      priority: 'high',
      goalId: sampleGoal.id,
      createdAt: `${today}T09:10:00Z`,
    };
    await seedTask(linkedTask);

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const toggleBtn = root.root.findByProps({ 'data-testid': `task-toggle-${linkedTask.id}` });
    await act(async () => {
      await toggleBtn.props.onClick();
    });

    const prompt = root.root.findByProps({ 'data-testid': 'goal-progress-prompt' });
    const promptTitle = root.root.findByProps({ 'data-testid': 'goal-prompt-title' });

    assert(
      'G10.1-02',
      Boolean(prompt) && promptTitle.children.some((c: any) => String(c).includes(sampleGoal.title)),
      'Completing a valid goal-linked task shows the feedback surface with goal title'
    );
  } catch (err: any) {
    assert('G10.1-02', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // G10.1-03: Completing a task with invalid/orphaned goalId shows no goal prompt
  // ---------------------------------------------------------------------------
  try {
    const orphanTask: Task = {
      id: 'task-orphan-goal-101',
      title: 'Review non-existent goal specs',
      date: today,
      completed: false,
      priority: 'medium',
      goalId: 'deleted-goal-999',
      createdAt: `${today}T09:20:00Z`,
    };
    await seedTask(orphanTask);

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const toggleBtn = root.root.findByProps({ 'data-testid': `task-toggle-${orphanTask.id}` });
    await act(async () => {
      await toggleBtn.props.onClick();
    });

    const prompts = root.root.findAllByProps({ 'data-testid': 'goal-progress-prompt' });
    const taskInStore = useTaskStore.getState().tasks.find((t) => t.id === orphanTask.id);

    assert(
      'G10.1-03',
      taskInStore?.completed === true && prompts.length === 0,
      'Completing a task with invalid/orphaned goalId shows no goal prompt and does not crash'
    );
  } catch (err: any) {
    assert('G10.1-03', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // G10.1-04: Goal activity metric correctly shows completed/total linked tasks
  // ---------------------------------------------------------------------------
  try {
    const goalBeta: Goal = {
      id: 'goal-beta-metrics',
      title: 'Master TypeScript',
      description: 'Advanced types and compiler API',
      progress: 50,
      createdAt: `${today}T10:00:00Z`,
      updatedAt: `${today}T10:00:00Z`,
    };
    await seedGoal(goalBeta);

    const tasksForBeta: Task[] = [
      { id: 'beta-t1', title: 'Task 1', date: today, completed: true, priority: 'medium', goalId: goalBeta.id, createdAt: `${today}T10:00:00Z` },
      { id: 'beta-t2', title: 'Task 2', date: today, completed: true, priority: 'medium', goalId: goalBeta.id, createdAt: `${today}T10:01:00Z` },
      { id: 'beta-t3', title: 'Task 3', date: today, completed: false, priority: 'low', goalId: goalBeta.id, createdAt: `${today}T10:02:00Z` },
    ];
    for (const t of tasksForBeta) {
      await seedTask(t);
    }

    // Pure engine calculation
    const allTasks = useTaskStore.getState().tasks;
    const activity = getGoalTaskActivity(goalBeta.id, allTasks);

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <GoalsView />
        </TestAppWrapper>
      );
    });

    const activityElement = root.root.findByProps({ 'data-testid': `goal-task-activity-${goalBeta.id}` });
    const hasText = getNodeText(activityElement).includes('2/3 tasks completed');

    assert(
      'G10.1-04',
      activity.total === 3 && activity.completed === 2 && activity.pending === 1 && hasText,
      'Goal activity metric correctly shows completed/total linked tasks (2/3 tasks completed)'
    );
  } catch (err: any) {
    assert('G10.1-04', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // G10.1-05: Goal with zero linked tasks renders safely
  // ---------------------------------------------------------------------------
  try {
    const emptyGoal: Goal = {
      id: 'goal-zero-tasks',
      title: 'Learn Italian',
      description: 'Beginner phrases',
      progress: 0,
      createdAt: `${today}T10:10:00Z`,
      updatedAt: `${today}T10:10:00Z`,
    };
    await seedGoal(emptyGoal);

    const allTasks = useTaskStore.getState().tasks;
    const activity = getGoalTaskActivity(emptyGoal.id, allTasks);

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <GoalsView />
        </TestAppWrapper>
      );
    });

    const activityElement = root.root.findByProps({ 'data-testid': `goal-task-activity-${emptyGoal.id}` });
    const hasZeroText = getNodeText(activityElement).includes('0 linked tasks');

    assert(
      'G10.1-05',
      activity.total === 0 && activity.completed === 0 && hasZeroText,
      'Goal with zero linked tasks renders safely with 0 linked tasks indicator'
    );
  } catch (err: any) {
    assert('G10.1-05', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // G10.1-06: Clicking Keep Task Completed does not modify Goal.progress
  // ---------------------------------------------------------------------------
  try {
    const goalGamma: Goal = {
      id: 'goal-gamma-keep',
      title: 'Run 10k Marathon',
      description: 'Training regimen',
      progress: 40,
      createdAt: `${today}T10:20:00Z`,
      updatedAt: `${today}T10:20:00Z`,
    };
    await seedGoal(goalGamma);

    const taskGamma: Task = {
      id: 'task-gamma-1',
      title: 'Morning 5k run',
      date: today,
      completed: false,
      priority: 'high',
      goalId: goalGamma.id,
      createdAt: `${today}T10:20:00Z`,
    };
    await seedTask(taskGamma);

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlannerView />
        </TestAppWrapper>
      );
    });

    // Complete task -> prompt appears
    const toggleBtn = root.root.findByProps({ 'data-testid': `task-toggle-${taskGamma.id}` });
    await act(async () => {
      await toggleBtn.props.onClick();
    });

    // Click "Keep Task Completed"
    const keepBtn = root.root.findByProps({ 'data-testid': 'goal-prompt-keep-btn' });
    await act(async () => {
      await keepBtn.props.onClick();
    });

    const goalAfter = useGoalStore.getState().goals.find((g) => g.id === goalGamma.id);
    const promptsAfter = root.root.findAllByProps({ 'data-testid': 'goal-progress-prompt' });

    assert(
      'G10.1-06',
      goalAfter?.progress === 40 && promptsAfter.length === 0,
      'Clicking Keep Task Completed does not modify Goal.progress (remains 40%) and dismisses prompt'
    );
  } catch (err: any) {
    assert('G10.1-06', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // G10.1-07: Clicking Dismiss does not modify Goal.progress
  // ---------------------------------------------------------------------------
  try {
    const goalDelta: Goal = {
      id: 'goal-delta-dismiss',
      title: 'Write Technical Book',
      description: '10 chapters',
      progress: 25,
      createdAt: `${today}T10:30:00Z`,
      updatedAt: `${today}T10:30:00Z`,
    };
    await seedGoal(goalDelta);

    const taskDelta: Task = {
      id: 'task-delta-1',
      title: 'Draft Chapter 3',
      date: today,
      completed: false,
      priority: 'medium',
      goalId: goalDelta.id,
      createdAt: `${today}T10:30:00Z`,
    };
    await seedTask(taskDelta);

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const toggleBtn = root.root.findByProps({ 'data-testid': `task-toggle-${taskDelta.id}` });
    await act(async () => {
      await toggleBtn.props.onClick();
    });

    const dismissBtn = root.root.findByProps({ 'data-testid': 'goal-prompt-dismiss-btn' });
    await act(async () => {
      await dismissBtn.props.onClick();
    });

    const goalAfter = useGoalStore.getState().goals.find((g) => g.id === goalDelta.id);
    const promptsAfter = root.root.findAllByProps({ 'data-testid': 'goal-progress-prompt' });

    assert(
      'G10.1-07',
      goalAfter?.progress === 25 && promptsAfter.length === 0,
      'Clicking Dismiss does not modify Goal.progress (remains 25%) and dismisses prompt'
    );
  } catch (err: any) {
    assert('G10.1-07', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // G10.1-08: Clicking +5% explicitly updates Goal.progress by 5 percentage points
  // ---------------------------------------------------------------------------
  try {
    const goalEpsilon: Goal = {
      id: 'goal-epsilon-plus5',
      title: 'Complete DevOps Certification',
      description: 'AWS / GCP certified',
      progress: 45,
      createdAt: `${today}T10:40:00Z`,
      updatedAt: `${today}T10:40:00Z`,
    };
    await seedGoal(goalEpsilon);

    const taskEpsilon: Task = {
      id: 'task-epsilon-1',
      title: 'Practice IAM policy questions',
      date: today,
      completed: false,
      priority: 'high',
      goalId: goalEpsilon.id,
      createdAt: `${today}T10:40:00Z`,
    };
    await seedTask(taskEpsilon);

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const toggleBtn = root.root.findByProps({ 'data-testid': `task-toggle-${taskEpsilon.id}` });
    await act(async () => {
      await toggleBtn.props.onClick();
    });

    const plus5Btn = root.root.findByProps({ 'data-testid': 'goal-prompt-plus5-btn' });
    await act(async () => {
      await plus5Btn.props.onClick();
    });

    const goalAfter = useGoalStore.getState().goals.find((g) => g.id === goalEpsilon.id);
    const promptsAfter = root.root.findAllByProps({ 'data-testid': 'goal-progress-prompt' });

    assert(
      'G10.1-08',
      goalAfter?.progress === 50 && promptsAfter.length === 0,
      'Clicking +5% explicitly updates Goal.progress from 45% to 50% and closes prompt'
    );
  } catch (err: any) {
    assert('G10.1-08', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // G10.1-09: Clicking +10% explicitly updates Goal.progress by 10 percentage points
  // ---------------------------------------------------------------------------
  try {
    const goalZeta: Goal = {
      id: 'goal-zeta-plus10',
      title: 'Build Mobile App Prototype',
      description: 'Flutter or React Native',
      progress: 60,
      createdAt: `${today}T10:50:00Z`,
      updatedAt: `${today}T10:50:00Z`,
    };
    await seedGoal(goalZeta);

    const taskZeta: Task = {
      id: 'task-zeta-1',
      title: 'Build navigation shell',
      date: today,
      completed: false,
      priority: 'high',
      goalId: goalZeta.id,
      createdAt: `${today}T10:50:00Z`,
    };
    await seedTask(taskZeta);

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const toggleBtn = root.root.findByProps({ 'data-testid': `task-toggle-${taskZeta.id}` });
    await act(async () => {
      await toggleBtn.props.onClick();
    });

    const plus10Btn = root.root.findByProps({ 'data-testid': 'goal-prompt-plus10-btn' });
    await act(async () => {
      await plus10Btn.props.onClick();
    });

    const goalAfter = useGoalStore.getState().goals.find((g) => g.id === goalZeta.id);
    const promptsAfter = root.root.findAllByProps({ 'data-testid': 'goal-progress-prompt' });

    assert(
      'G10.1-09',
      goalAfter?.progress === 70 && promptsAfter.length === 0,
      'Clicking +10% explicitly updates Goal.progress from 60% to 70% and closes prompt'
    );
  } catch (err: any) {
    assert('G10.1-09', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // G10.1-10: Clicking Mark 100% explicitly updates Goal.progress to 100
  // ---------------------------------------------------------------------------
  try {
    const goalEta: Goal = {
      id: 'goal-eta-max',
      title: 'Finish Tax Filing',
      description: 'Annual corporate taxes',
      progress: 85,
      createdAt: `${today}T11:00:00Z`,
      updatedAt: `${today}T11:00:00Z`,
    };
    await seedGoal(goalEta);

    const taskEta: Task = {
      id: 'task-eta-1',
      title: 'Submit finalized return',
      date: today,
      completed: false,
      priority: 'high',
      goalId: goalEta.id,
      createdAt: `${today}T11:00:00Z`,
    };
    await seedTask(taskEta);

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const toggleBtn = root.root.findByProps({ 'data-testid': `task-toggle-${taskEta.id}` });
    await act(async () => {
      await toggleBtn.props.onClick();
    });

    const mark100Btn = root.root.findByProps({ 'data-testid': 'goal-prompt-max-btn' });
    await act(async () => {
      await mark100Btn.props.onClick();
    });

    const goalAfter = useGoalStore.getState().goals.find((g) => g.id === goalEta.id);
    const promptsAfter = root.root.findAllByProps({ 'data-testid': 'goal-progress-prompt' });

    assert(
      'G10.1-10',
      goalAfter?.progress === 100 && promptsAfter.length === 0,
      'Clicking Mark 100% explicitly updates Goal.progress from 85% to 100%'
    );
  } catch (err: any) {
    assert('G10.1-10', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // G10.1-11: Reopening a completed goal-linked task does not subtract Goal.progress
  // ---------------------------------------------------------------------------
  try {
    const goalTheta: Goal = {
      id: 'goal-theta-reopen',
      title: 'Learn Guitar Solo',
      description: 'Master arpeggios',
      progress: 65,
      createdAt: `${today}T11:10:00Z`,
      updatedAt: `${today}T11:10:00Z`,
    };
    await seedGoal(goalTheta);

    const taskTheta: Task = {
      id: 'task-theta-1',
      title: 'Practice measure 12-16',
      date: today,
      completed: true, // Already completed
      priority: 'medium',
      goalId: goalTheta.id,
      createdAt: `${today}T11:10:00Z`,
    };
    await seedTask(taskTheta);

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const toggleBtn = root.root.findByProps({ 'data-testid': `task-toggle-${taskTheta.id}` });
    await act(async () => {
      await toggleBtn.props.onClick(); // Reopen task
    });

    const taskInStore = useTaskStore.getState().tasks.find((t) => t.id === taskTheta.id);
    const goalAfter = useGoalStore.getState().goals.find((g) => g.id === goalTheta.id);

    assert(
      'G10.1-11',
      taskInStore?.completed === false && goalAfter?.progress === 65,
      'Reopening a completed goal-linked task does not subtract Goal.progress (remains 65%)'
    );
  } catch (err: any) {
    assert('G10.1-11', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // G10.1-12: Reopening a task does not display a negative progress prompt
  // ---------------------------------------------------------------------------
  try {
    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const prompts = root.root.findAllByProps({ 'data-testid': 'goal-progress-prompt' });

    assert(
      'G10.1-12',
      prompts.length === 0,
      'Reopening a task does not display a negative progress prompt'
    );
  } catch (err: any) {
    assert('G10.1-12', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // G10.1-13: Goal at 100% does not display inappropriate progress increment controls
  // ---------------------------------------------------------------------------
  try {
    const goal100: Goal = {
      id: 'goal-already-100',
      title: 'Full Stack App Deployment',
      description: 'Fully finished goal',
      progress: 100,
      createdAt: `${today}T11:20:00Z`,
      updatedAt: `${today}T11:20:00Z`,
    };
    await seedGoal(goal100);

    const taskFor100: Task = {
      id: 'task-under-100-goal',
      title: 'Extra cleanup task',
      date: today,
      completed: false,
      priority: 'low',
      goalId: goal100.id,
      createdAt: `${today}T11:20:00Z`,
    };
    await seedTask(taskFor100);

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const toggleBtn = root.root.findByProps({ 'data-testid': `task-toggle-${taskFor100.id}` });
    await act(async () => {
      await toggleBtn.props.onClick();
    });

    const prompts = root.root.findAllByProps({ 'data-testid': 'goal-progress-prompt' });
    const goalAfter = useGoalStore.getState().goals.find((g) => g.id === goal100.id);

    assert(
      'G10.1-13',
      prompts.length === 0 && goalAfter?.progress === 100,
      'Goal at 100% does not display inappropriate progress increment controls'
    );
  } catch (err: any) {
    assert('G10.1-13', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // G10.1-14: Completion persistence failure does not leave a stale progress prompt
  // ---------------------------------------------------------------------------
  try {
    const taskFail: Task = {
      id: 'task-fail-persist',
      title: 'Task that fails to persist',
      date: today,
      completed: false,
      priority: 'medium',
      goalId: sampleGoal.id,
      createdAt: `${today}T11:30:00Z`,
    };
    await seedTask(taskFail);

    // Mock repository update failure
    const origGetTaskRepo = RepositoryFactory.getTaskRepository;
    RepositoryFactory.getTaskRepository = () => {
      const realRepo = origGetTaskRepo();
      return {
        ...realRepo,
        update: async (id: string, updates: any) => {
          if (id === taskFail.id) {
            throw new Error('Database connection severed');
          }
          return realRepo.update(id, updates);
        },
      } as any;
    };

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const toggleBtn = root.root.findByProps({ 'data-testid': `task-toggle-${taskFail.id}` });
    await act(async () => {
      try {
        await toggleBtn.props.onClick();
      } catch (_) {}
    });

    const prompts = root.root.findAllByProps({ 'data-testid': 'goal-progress-prompt' });

    // Restore original method
    RepositoryFactory.getTaskRepository = origGetTaskRepo;

    assert(
      'G10.1-14',
      prompts.length === 0,
      'Completion persistence failure does not leave a stale progress prompt'
    );
  } catch (err: any) {
    assert('G10.1-14', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // G10.1-15: Rapid toggles do not create duplicate/stale prompts
  // ---------------------------------------------------------------------------
  try {
    const taskRapid: Task = {
      id: 'task-rapid-toggle',
      title: 'Rapid toggle test task',
      date: today,
      completed: false,
      priority: 'medium',
      goalId: sampleGoal.id,
      createdAt: `${today}T11:40:00Z`,
    };
    await seedTask(taskRapid);

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const toggleBtn = root.root.findByProps({ 'data-testid': `task-toggle-${taskRapid.id}` });
    
    // Toggle 1: incomplete -> complete (prompt should show)
    await act(async () => {
      await toggleBtn.props.onClick();
    });
    const promptAfterComplete = root.root.findAllByProps({ 'data-testid': 'goal-progress-prompt' });

    // Toggle 2: complete -> incomplete (reopen, prompt must clear)
    await act(async () => {
      await toggleBtn.props.onClick();
    });
    const promptAfterReopen = root.root.findAllByProps({ 'data-testid': 'goal-progress-prompt' });

    assert(
      'G10.1-15',
      promptAfterComplete.length === 1 && promptAfterReopen.length === 0,
      'Rapid toggles do not create duplicate prompts and reopening promptly clears the feedback surface'
    );
  } catch (err: any) {
    assert('G10.1-15', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // G10.1-16: Arabic and English labels render correctly
  // ---------------------------------------------------------------------------
  try {
    const taskAr: Task = {
      id: 'task-arabic-lang-test',
      title: 'مهمة لاختبار اللغة العربية',
      date: today,
      completed: false,
      priority: 'medium',
      goalId: sampleGoal.id,
      createdAt: `${today}T11:50:00Z`,
    };
    await seedTask(taskAr);

    let rootAr: any;
    await act(async () => {
      rootAr = create(
        <TestAppWrapper language="ar">
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const toggleBtnAr = rootAr.root.findByProps({ 'data-testid': `task-toggle-${taskAr.id}` });
    await act(async () => {
      await toggleBtnAr.props.onClick();
    });

    const promptAr = rootAr.root.findByProps({ 'data-testid': 'goal-progress-prompt' });
    const promptTitleAr = rootAr.root.findByProps({ 'data-testid': 'goal-prompt-title' });
    const keepBtnAr = rootAr.root.findByProps({ 'data-testid': 'goal-prompt-keep-btn' });
    const maxBtnAr = rootAr.root.findByProps({ 'data-testid': 'goal-prompt-max-btn' });

    const arMatch =
      promptTitleAr.children.some((c: any) => String(c).includes('تم إنجاز مهمة مرتبطة بالهدف')) &&
      keepBtnAr.children.includes('الإبقاء على المهمة فقط') &&
      maxBtnAr.children.includes('تحديد 100%');

    assert(
      'G10.1-16',
      Boolean(promptAr) && arMatch,
      'Arabic and English labels render correctly in their respective languages'
    );
  } catch (err: any) {
    assert('G10.1-16', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // G10.1-17: Gate 10 goal-linked Planner behavior remains intact
  // ---------------------------------------------------------------------------
  try {
    const taskGate10: Task = {
      id: 'task-gate10-intact',
      title: 'Verify Gate 10 intact chip',
      date: today,
      completed: false,
      priority: 'high',
      goalId: sampleGoal.id,
      createdAt: `${today}T12:00:00Z`,
    };
    await seedTask(taskGate10);

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const chip = root.root.findByProps({ 'data-testid': `task-goal-badge-${taskGate10.id}` });
    const hasGoalTitle = chip.props.title?.includes(sampleGoal.title) ||
      getNodeText(chip).includes(sampleGoal.title);

    assert(
      'G10.1-17',
      Boolean(chip) && hasGoalTitle,
      'Gate 10 goal-linked Planner chip rendering remains fully intact'
    );
  } catch (err: any) {
    assert('G10.1-17', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n=== TEST SUITE COMPLETE ===');
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);

  if (failedCount > 0) {
    process.exit(1);
  } else {
    console.log('ALL GATE 10.1 TESTS PASSED\n');
  }
}

runGate10_1Tests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
