import React from 'react';
import { create, act } from 'react-test-renderer';
import { PlannerView, getLocalTodayString } from './src/modules/planner/PlannerView';
import { PlanAssistDrawer } from './src/modules/planner/components/PlanAssistDrawer';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { useFocusStore } from './src/core/state/focusStore';
import { AppProvider, useApp } from './src/core/providers/AppContext';
import { Task, Goal } from './src/types/data';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { useAuthStore } from './src/core/auth/authStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import {
  PlanAssistService,
  parsePlanAssistResponse,
  validatePlanAssistSuggestion,
} from './src/modules/planner/services/planAssistService';
import {
  PlanAssistPlanningContext,
  PlanAssistResponse,
} from './src/modules/planner/services/planAssistTypes';

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
  }
  useTaskStore.setState((prev) => ({
    tasks: [...prev.tasks.filter((t) => t.id !== task.id), task],
    status: 'ready',
  }));
}

function createMockPlanAssistService(
  handler: (ctx: PlanAssistPlanningContext, options?: { abortSignal?: AbortSignal }) => Promise<PlanAssistResponse>
): PlanAssistService {
  return {
    getPlanSuggestions: handler,
  } as unknown as PlanAssistService;
}

// Main Test Runner
async function runGate10Tests() {
  console.log('\n=== RUNNING GATE 10 TESTS (Goal-Linked Plan Assist) ===\n');
  let passedCount = 0;
  let failedCount = 0;

  const assert = (testId: string, condition: boolean, message: string) => {
    if (condition) {
      console.log(`[PASS] ${testId}: ${message}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${testId}: ${message}`);
      failedCount++;
    }
  };

  const sampleGoal: Goal = {
    id: 'goal-launch-app',
    title: 'Launch Mobile App',
    description: 'Ship initial release to beta users',
    progress: 40,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-15T00:00:00Z',
  };

  // Initialize auth
  AuthLifecycle.reset('test-user-gate10');
  useAuthStore.setState({
    user: {
      uid: 'test-user-gate10',
      getIdToken: async () => 'test-id-token',
    } as any,
  });

  // Reset stores
  useTaskStore.setState({ tasks: [], status: 'ready', error: null });
  useGoalStore.setState({ goals: [], status: 'ready', error: null });
  useFocusStore.setState({ sessions: [], status: 'ready', error: null });

  await seedGoal(sampleGoal);

  // ---------------------------------------------------------------------------
  // TEST 1: Parser accepts new_task with valid goalId
  // ---------------------------------------------------------------------------
  try {
    const rawAiResponse = JSON.stringify({
      summary: 'Focused plan for launch preparation.',
      suggestions: [
        {
          type: 'new_task',
          title: 'Design onboarding flow',
          priority: 'high',
          goalId: 'goal-launch-app',
          reason: 'Crucial for app release.',
        },
      ],
    });

    const parsed = parsePlanAssistResponse(rawAiResponse, {
      availableGoals: [sampleGoal],
    });

    assert(
      'G10-01',
      parsed.success === true &&
        parsed.data.suggestions.length === 1 &&
        parsed.data.suggestions[0].type === 'new_task' &&
        (parsed.data.suggestions[0] as any).goalId === 'goal-launch-app',
      'Parser accepts new_task with valid goalId matching available goals'
    );
  } catch (err: any) {
    assert('G10-01', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Parser accepts new_task without goalId
  // ---------------------------------------------------------------------------
  try {
    const rawAiResponse = JSON.stringify({
      summary: 'General housekeeping plan.',
      suggestions: [
        {
          type: 'new_task',
          title: 'Organize workspace files',
          priority: 'low',
          reason: 'Keeps desktop tidy.',
        },
      ],
    });

    const parsed = parsePlanAssistResponse(rawAiResponse, {
      availableGoals: [sampleGoal],
    });

    assert(
      'G10-02',
      parsed.success === true &&
        parsed.data.suggestions.length === 1 &&
        parsed.data.suggestions[0].type === 'new_task' &&
        (parsed.data.suggestions[0] as any).goalId === undefined,
      'Parser accepts new_task without goalId cleanly'
    );
  } catch (err: any) {
    assert('G10-02', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Parser strips/rejects hallucinated goalId not matching active goals
  // ---------------------------------------------------------------------------
  try {
    const rawAiResponse = JSON.stringify({
      summary: 'Plan with hallucinated goal.',
      suggestions: [
        {
          type: 'new_task',
          title: 'Draft landing page copy',
          priority: 'medium',
          goalId: 'hallucinated-goal-999',
          reason: 'Marketing asset creation.',
        },
      ],
    });

    const parsed = parsePlanAssistResponse(rawAiResponse, {
      availableGoals: [sampleGoal], // only 'goal-launch-app' exists
    });

    assert(
      'G10-03',
      parsed.success === true &&
        parsed.data.suggestions.length === 1 &&
        parsed.data.suggestions[0].type === 'new_task' &&
        (parsed.data.suggestions[0] as any).goalId === undefined,
      'Parser strips hallucinated goalId that does not exist in available goals'
    );
  } catch (err: any) {
    assert('G10-03', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: PlanAssistDrawer displays Goal badge when suggestion has valid goalId
  // ---------------------------------------------------------------------------
  try {
    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'Preparing mobile app launch.',
        suggestions: [
          {
            type: 'new_task',
            title: 'Setup push notification certificates',
            priority: 'high',
            goalId: 'goal-launch-app',
            reason: 'Mandatory before sending to review.',
          },
        ],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlanAssistDrawer
            isOpen={true}
            onClose={() => {}}
            selectedDate="2026-09-20"
            service={mockService}
          />
        </TestAppWrapper>
      );
    });

    // Wait for async generation to resolve
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const goalBadge = root.root.findByProps({ 'data-testid': 'suggestion-goal-badge-0' });
    const goalTitle = root.root.findByProps({ 'data-testid': 'suggestion-goal-title-0' });

    assert(
      'G10-04',
      Boolean(goalBadge) && goalTitle.children.includes('Launch Mobile App'),
      'PlanAssistDrawer displays Goal badge with resolved Goal title for valid goalId'
    );
  } catch (err: any) {
    assert('G10-04', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: User can detach goal before applying
  // ---------------------------------------------------------------------------
  try {
    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'Reviewing plan suggestions.',
        suggestions: [
          {
            type: 'new_task',
            title: 'Configure deep linking',
            priority: 'medium',
            goalId: 'goal-launch-app',
            reason: 'Enables direct navigation.',
          },
        ],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlanAssistDrawer
            isOpen={true}
            onClose={() => {}}
            selectedDate="2026-09-20"
            service={mockService}
          />
        </TestAppWrapper>
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    // Find and click the detach/remove button
    const removeBtn = root.root.findByProps({ 'data-testid': 'suggestion-goal-remove-0' });
    await act(async () => {
      removeBtn.props.onClick({ stopPropagation: () => {} });
    });

    // Verify badge is now gone
    const goalBadges = root.root.findAllByProps({ 'data-testid': 'suggestion-goal-badge-0' });

    assert(
      'G10-05',
      goalBadges.length === 0,
      'Clicking detach button removes goalId from suggestion in PlanAssistDrawer'
    );
  } catch (err: any) {
    assert('G10-05', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Applying goal-linked suggestion calls taskStore.createTask with goalId
  // ---------------------------------------------------------------------------
  try {
    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'Goal-linked application plan.',
        suggestions: [
          {
            type: 'new_task',
            title: 'Integrate crash reporting SDK',
            priority: 'high',
            goalId: 'goal-launch-app',
            reason: 'Track runtime exceptions.',
          },
        ],
      },
    }));

    let applyCompletedResult: any = null;
    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlanAssistDrawer
            isOpen={true}
            onClose={() => {}}
            selectedDate="2026-09-20"
            service={mockService}
            onApplyComplete={(res) => {
              applyCompletedResult = res;
            }}
          />
        </TestAppWrapper>
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const applyBtn = root.root.findByProps({ 'data-testid': 'plan-assist-apply-btn' });
    await act(async () => {
      await applyBtn.props.onClick();
    });

    const storedTasks = useTaskStore.getState().tasks;
    const createdTask = storedTasks.find((t) => t.title === 'Integrate crash reporting SDK');

    assert(
      'G10-06',
      Boolean(createdTask) &&
        createdTask?.goalId === 'goal-launch-app' &&
        createdTask?.date === '2026-09-20' &&
        applyCompletedResult?.createdCount === 1,
      'Applying goal-linked suggestion persists task with goalId on the selected planner date'
    );
  } catch (err: any) {
    assert('G10-06', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Planner task list renders Goal chip for task with valid goalId
  // ---------------------------------------------------------------------------
  try {
    const today = getLocalTodayString();
    const goalLinkedTaskId = 'task-goal-linked-1';
    await seedTask({
      id: goalLinkedTaskId,
      title: 'Submit app bundle to store',
      date: today,
      completed: false,
      priority: 'high',
      goalId: 'goal-launch-app',
      createdAt: `${today}T08:00:00Z`,
    });

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const goalBadge = root.root.findByProps({ 'data-testid': `task-goal-badge-${goalLinkedTaskId}` });
    const hasGoalTitle = goalBadge.props.title?.includes('Launch Mobile App') ||
      goalBadge.findAll((n: any) => Array.isArray(n.children) && n.children.includes('Launch Mobile App')).length > 0;

    assert(
      'G10-07',
      Boolean(goalBadge) && hasGoalTitle,
      'PlannerView renders Goal chip with title for task with valid goalId'
    );
  } catch (err: any) {
    assert('G10-07', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Planner task list does NOT break or show chip for task with invalid goalId
  // ---------------------------------------------------------------------------
  try {
    const today = getLocalTodayString();
    const invalidGoalTaskId = 'task-orphan-goal-2';
    await seedTask({
      id: invalidGoalTaskId,
      title: 'Task with deleted goal reference',
      date: today,
      completed: false,
      priority: 'low',
      goalId: 'non-existent-goal-404',
      createdAt: `${today}T09:00:00Z`,
    });

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper>
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const taskRow = root.root.findByProps({ 'data-testid': `task-row-${invalidGoalTaskId}` });
    const goalBadges = root.root.findAllByProps({ 'data-testid': `task-goal-badge-${invalidGoalTaskId}` });

    assert(
      'G10-08',
      Boolean(taskRow) && goalBadges.length === 0,
      'PlannerView renders task safely without Goal chip when goalId cannot be resolved'
    );
  } catch (err: any) {
    assert('G10-08', false, `Failed with error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Completing a goal-linked task toggles completed=true without mutating Goal progress
  // ---------------------------------------------------------------------------
  try {
    const initialProgress = sampleGoal.progress; // 40%
    const goalTaskId = 'task-goal-linked-1';

    // Verify task is currently incomplete
    const taskBefore = useTaskStore.getState().tasks.find((t) => t.id === goalTaskId);
    assert('G10-09a', taskBefore?.completed === false, 'Initial goal-linked task is incomplete');

    // Toggle completion via taskStore.toggleTask
    await act(async () => {
      await useTaskStore.getState().toggleTask(goalTaskId);
    });

    const taskAfter = useTaskStore.getState().tasks.find((t) => t.id === goalTaskId);
    const goalAfter = useGoalStore.getState().goals.find((g) => g.id === sampleGoal.id);

    assert(
      'G10-09b',
      taskAfter?.completed === true,
      'Toggling goal-linked task marks it completed'
    );

    assert(
      'G10-09c',
      goalAfter?.progress === initialProgress,
      `Goal progress remains strictly unchanged (${initialProgress}%) without automatic mutation`
    );
  } catch (err: any) {
    assert('G10-09', false, `Failed with error: ${err.message}`);
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
    console.log('ALL GATE 10 TESTS PASSED\n');
  }
}

runGate10Tests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
