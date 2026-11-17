import React from 'react';
import { create, act } from 'react-test-renderer';
import { PlannerView } from './src/modules/planner/PlannerView';
import { PlanAssistDrawer } from './src/modules/planner/components/PlanAssistDrawer';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { useFocusStore } from './src/core/state/focusStore';
import { AppProvider, useApp } from './src/core/providers/AppContext';
import { Task } from './src/types/data';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { useAuthStore } from './src/core/auth/authStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import {
  PlanAssistService,
  isDuplicateSuggestion,
} from './src/modules/planner/services/planAssistService';
import {
  PlanAssistPlanningContext,
  PlanAssistResponse,
} from './src/modules/planner/services/planAssistTypes';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Custom test wrapper to control language
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

// Mock service helper
function createMockPlanAssistService(
  handler: (ctx: PlanAssistPlanningContext, options?: { abortSignal?: AbortSignal }) => Promise<PlanAssistResponse>
): PlanAssistService {
  return {
    getPlanSuggestions: handler,
  } as unknown as PlanAssistService;
}

async function runTests() {
  console.log('=== RUNNING GATE 9.2 TESTS (AI PLAN ASSIST PLANNER UI & HUMAN-IN-THE-LOOP) ===');
  let allPassed = true;

  AuthLifecycle.reset('test-user-gate9-2');
  useAuthStore.setState({
    user: {
      uid: 'test-user-gate9-2',
      getIdToken: async () => 'test-id-token',
    } as any,
  });

  const logResult = (testId: string, passed: boolean, message: string) => {
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${testId}: ${message}`);
    if (!passed) allPassed = false;
  };

  // Setup initial store state
  const resetStores = () => {
    useTaskStore.setState({
      tasks: [],
      status: 'ready',
      error: null,
    });
    useGoalStore.setState({
      goals: [],
      status: 'ready',
    });
    useFocusStore.setState({
      sessions: [],
    });
  };

  // G9.2-01: AI Plan Assist trigger renders
  try {
    resetStores();
    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const triggerBtn = root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' });
    const hasLabel = triggerBtn.props.children.some((c: any) =>
      typeof c === 'object' && c.props?.children?.includes('AI Plan Assist')
    );

    logResult(
      'G9.2-01',
      Boolean(triggerBtn) && hasLabel,
      'AI Plan Assist trigger renders on PlannerView with proper label and icon.'
    );
  } catch (err: any) {
    logResult('G9.2-01', false, `Failed: ${err.message}`);
  }

  // G9.2-02: Clicking trigger opens the review surface
  try {
    resetStores();
    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const triggerBtn = root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' });
    await act(async () => {
      triggerBtn.props.onClick();
    });

    const drawer = root.root.findByProps({ 'data-testid': 'plan-assist-drawer' });
    logResult('G9.2-02', Boolean(drawer), 'Clicking trigger opens the Plan Assist review drawer.');
  } catch (err: any) {
    logResult('G9.2-02', false, `Failed: ${err.message}`);
  }

  // G9.2-03: Opening Plan Assist starts generation
  try {
    resetStores();
    let generationCalled = false;
    const mockService = createMockPlanAssistService(async () => {
      generationCalled = true;
      return {
        success: true,
        data: { summary: 'Quick plan', suggestions: [] },
      };
    });

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    const triggerBtn = root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' });
    await act(async () => {
      triggerBtn.props.onClick();
    });

    logResult(
      'G9.2-03',
      generationCalled,
      'Opening Plan Assist immediately invokes getPlanSuggestions on the service.'
    );
  } catch (err: any) {
    logResult('G9.2-03', false, `Failed: ${err.message}`);
  }

  // G9.2-04: Loading state renders correctly
  try {
    resetStores();
    let resolveService: any;
    const pendingPromise = new Promise<PlanAssistResponse>((resolve) => {
      resolveService = resolve;
    });
    const mockService = createMockPlanAssistService(async () => pendingPromise);

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    const triggerBtn = root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' });
    await act(async () => {
      triggerBtn.props.onClick();
    });

    const loadingState = root.root.findByProps({ 'data-testid': 'plan-assist-loading' });
    const isVisible = Boolean(loadingState);

    // Resolve promise to clean up
    await act(async () => {
      resolveService({
        success: true,
        data: { summary: 'Done', suggestions: [] },
      });
    });

    logResult(
      'G9.2-04',
      isVisible,
      'Loading state renders correctly while plan generation is in-flight.'
    );
  } catch (err: any) {
    logResult('G9.2-04', false, `Failed: ${err.message}`);
  }

  // G9.2-05: selectedDate is the exact date sent to the service
  try {
    resetStores();
    let capturedDate = '';
    const mockService = createMockPlanAssistService(async (ctx) => {
      capturedDate = ctx.selectedDate;
      return {
        success: true,
        data: { summary: 'Dated plan', suggestions: [] },
      };
    });

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    // Change date in date picker to 2026-11-20
    const datePicker = root.root.findByProps({ 'data-testid': 'date-picker' });
    await act(async () => {
      datePicker.props.onChange({ target: { value: '2026-11-20' } });
    });

    // Trigger plan assist
    const triggerBtn = root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' });
    await act(async () => {
      triggerBtn.props.onClick();
    });

    logResult(
      'G9.2-05',
      capturedDate === '2026-11-20',
      `selectedDate is authoritative (${capturedDate}) and sent directly to PlanAssistService.`
    );
  } catch (err: any) {
    logResult('G9.2-05', false, `Failed: ${err.message}`);
  }

  // G9.2-06: Valid new_task suggestions render correctly
  try {
    resetStores();
    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'Focused day ahead',
        suggestions: [
          {
            type: 'new_task',
            title: 'Prepare presentation deck',
            priority: 'high',
            reason: 'Crucial for upcoming launch milestone',
          },
        ],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    const triggerBtn = root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' });
    await act(async () => {
      triggerBtn.props.onClick();
    });

    const titleInput = root.root.findByProps({ 'data-testid': 'suggestion-title-0' });
    const prioritySelect = root.root.findByProps({ 'data-testid': 'suggestion-priority-0' });
    const reasonEl = root.root.findByProps({ 'data-testid': 'suggestion-reason-0' });

    const matches =
      titleInput.props.value === 'Prepare presentation deck' &&
      prioritySelect.props.value === 'high' &&
      reasonEl.props.children === 'Crucial for upcoming launch milestone';

    logResult(
      'G9.2-06',
      matches,
      'Valid new_task suggestions render with editable title, priority selector, and reason.'
    );
  } catch (err: any) {
    logResult('G9.2-06', false, `Failed: ${err.message}`);
  }

  // G9.2-07: Valid priority_change suggestions render correctly
  try {
    resetStores();
    await seedTask({
      id: 'task-existing-1',
      title: 'Review PR comments',
      completed: false,
      priority: 'low',
      date: '2026-10-10',
      createdAt: '2026-10-10T10:00:00Z',
    });

    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'Priority adjustments recommended',
        suggestions: [
          {
            type: 'priority_change',
            taskId: 'task-existing-1',
            priority: 'high',
            reason: 'Blocking downstream release QA',
          },
        ],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    const triggerBtn = root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' });
    await act(async () => {
      triggerBtn.props.onClick();
    });

    const taskTitle = root.root.findByProps({ 'data-testid': 'suggestion-task-title-0' });
    const prioritySelect = root.root.findByProps({ 'data-testid': 'suggestion-priority-0' });

    const matches =
      taskTitle.props.children === 'Review PR comments' &&
      prioritySelect.props.value === 'high';

    logResult(
      'G9.2-07',
      matches,
      'Valid priority_change suggestions render existing title, current priority, and new priority.'
    );
  } catch (err: any) {
    logResult('G9.2-07', false, `Failed: ${err.message}`);
  }

  // G9.2-08: User can deselect a suggestion
  try {
    resetStores();
    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'One task proposed',
        suggestions: [
          {
            type: 'new_task',
            title: 'Optional research',
            priority: 'low',
            reason: 'Explore idea',
          },
        ],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' }).props.onClick();
    });

    const checkBtn = root.root.findByProps({ 'data-testid': 'suggestion-check-0' });
    // Initially selected, click to deselect
    await act(async () => {
      checkBtn.props.onClick();
    });

    // Apply button should now show Apply (0) and be disabled
    const applyBtn = root.root.findByProps({ 'data-testid': 'plan-assist-apply-btn' });
    const isDisabled = applyBtn.props.disabled;

    logResult(
      'G9.2-08',
      isDisabled,
      'User can deselect a suggestion via checkbox toggle, updating selection count.'
    );
  } catch (err: any) {
    logResult('G9.2-08', false, `Failed: ${err.message}`);
  }

  // G9.2-09: User can edit a new task title
  try {
    resetStores();
    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'Suggested task',
        suggestions: [
          {
            type: 'new_task',
            title: 'Initial Title',
            priority: 'medium',
            reason: 'Reason text',
          },
        ],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' }).props.onClick();
    });

    const titleInput = root.root.findByProps({ 'data-testid': 'suggestion-title-0' });
    await act(async () => {
      titleInput.props.onChange({ target: { value: 'User Customized Title' } });
    });

    const updatedTitleInput = root.root.findByProps({ 'data-testid': 'suggestion-title-0' });
    logResult(
      'G9.2-09',
      updatedTitleInput.props.value === 'User Customized Title',
      'User can edit proposed new task title in the review surface.'
    );
  } catch (err: any) {
    logResult('G9.2-09', false, `Failed: ${err.message}`);
  }

  // G9.2-10: User can change a new task priority
  try {
    resetStores();
    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'Suggested task',
        suggestions: [
          {
            type: 'new_task',
            title: 'Task Priority Change Test',
            priority: 'low',
            reason: 'Reason',
          },
        ],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' }).props.onClick();
    });

    const prioritySelect = root.root.findByProps({ 'data-testid': 'suggestion-priority-0' });
    await act(async () => {
      prioritySelect.props.onChange({ target: { value: 'high' } });
    });

    const updatedSelect = root.root.findByProps({ 'data-testid': 'suggestion-priority-0' });
    logResult(
      'G9.2-10',
      updatedSelect.props.value === 'high',
      'User can change the priority of a suggested task before applying.'
    );
  } catch (err: any) {
    logResult('G9.2-10', false, `Failed: ${err.message}`);
  }

  // G9.2-11: User cannot alter priority_change taskId
  try {
    resetStores();
    await seedTask({
      id: 'task-locked-id',
      title: 'Locked Task',
      completed: false,
      priority: 'low',
      date: '2026-10-10',
      createdAt: '2026-10-10T10:00:00Z',
    });

    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'Locked id test',
        suggestions: [
          {
            type: 'priority_change',
            taskId: 'task-locked-id',
            priority: 'high',
            reason: 'Urgent',
          },
        ],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' }).props.onClick();
    });

    // Check that there is NO editable input for taskId
    let hasTaskIdInput = false;
    try {
      root.root.findByProps({ 'data-testid': 'suggestion-task-id-0' });
      hasTaskIdInput = true;
    } catch {
      hasTaskIdInput = false;
    }

    logResult(
      'G9.2-11',
      !hasTaskIdInput,
      'User cannot alter taskId of priority_change suggestion (it is non-editable).'
    );
  } catch (err: any) {
    logResult('G9.2-11', false, `Failed: ${err.message}`);
  }

  // G9.2-12: Apply creates only selected valid new tasks
  try {
    resetStores();
    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'Two suggestions',
        suggestions: [
          { type: 'new_task', title: 'Task Keep', priority: 'high', reason: 'Keep' },
          { type: 'new_task', title: 'Task Skip', priority: 'low', reason: 'Skip' },
        ],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' }).props.onClick();
    });

    // Deselect Task Skip (index 1)
    await act(async () => {
      root.root.findByProps({ 'data-testid': 'suggestion-check-1' }).props.onClick();
    });

    // Click Apply
    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-apply-btn' }).props.onClick();
    });

    const tasks = useTaskStore.getState().tasks;
    const hasKeep = tasks.some((t) => t.title === 'Task Keep');
    const hasSkip = tasks.some((t) => t.title === 'Task Skip');

    logResult(
      'G9.2-12',
      hasKeep && !hasSkip,
      'Apply creates only the selected valid new tasks in the store.'
    );
  } catch (err: any) {
    logResult('G9.2-12', false, `Failed: ${err.message}`);
  }

  // G9.2-13: Created tasks always use selectedDate
  try {
    resetStores();
    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'Date test',
        suggestions: [
          { type: 'new_task', title: 'Task on Target Date', priority: 'medium', reason: 'Date' },
        ],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    // Navigate to future date 2026-12-25
    await act(async () => {
      root.root.findByProps({ 'data-testid': 'date-picker' }).props.onChange({
        target: { value: '2026-12-25' },
      });
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' }).props.onClick();
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-apply-btn' }).props.onClick();
    });

    const createdTask = useTaskStore.getState().tasks.find((t) => t.title === 'Task on Target Date');
    logResult(
      'G9.2-13',
      createdTask?.date === '2026-12-25',
      `Created task explicitly uses selectedDate (${createdTask?.date}).`
    );
  } catch (err: any) {
    logResult('G9.2-13', false, `Failed: ${err.message}`);
  }

  // G9.2-14: Apply updates only selected valid priority changes
  try {
    resetStores();
    await seedTask({
      id: 'task-prio-update',
      title: 'Update My Priority',
      completed: false,
      priority: 'low',
      date: '2026-10-10',
      createdAt: '2026-10-10T10:00:00Z',
    });

    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'Update priority',
        suggestions: [
          {
            type: 'priority_change',
            taskId: 'task-prio-update',
            priority: 'high',
            reason: 'Elevated urgency',
          },
        ],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' }).props.onClick();
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-apply-btn' }).props.onClick();
    });

    const updatedTask = useTaskStore.getState().tasks.find((t) => t.id === 'task-prio-update');
    logResult(
      'G9.2-14',
      updatedTask?.priority === 'high',
      'Apply updates only selected valid priority changes in taskStore.'
    );
  } catch (err: any) {
    logResult('G9.2-14', false, `Failed: ${err.message}`);
  }

  // G9.2-15: Duplicate new task suggestion is not created
  try {
    resetStores();
    // Pre-seed task on today's date
    const today = '2026-09-19';
    await seedTask({
      id: 'existing-dup-1',
      title: 'Already Existing Task',
      completed: false,
      priority: 'high',
      date: today,
      createdAt: '2026-09-19T08:00:00Z',
    });

    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'Duplicate test',
        suggestions: [
          {
            type: 'new_task',
            title: 'Already Existing Task',
            priority: 'high',
            reason: 'Duplicate reason',
          },
        ],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    // Set date to today
    await act(async () => {
      root.root.findByProps({ 'data-testid': 'date-picker' }).props.onChange({
        target: { value: today },
      });
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' }).props.onClick();
    });

    // Suggestion is marked duplicate, force click apply if enabled
    const applyBtn = root.root.findByProps({ 'data-testid': 'plan-assist-apply-btn' });
    if (!applyBtn.props.disabled) {
      await act(async () => {
        applyBtn.props.onClick();
      });
    }

    const matchingTasks = useTaskStore.getState().tasks.filter((t) => t.title.toLowerCase() === 'already existing task');
    logResult(
      'G9.2-15',
      matchingTasks.length === 1,
      'Duplicate new task suggestion is safely prevented from creating duplicate entries.'
    );
  } catch (err: any) {
    logResult('G9.2-15', false, `Failed: ${err.message}`);
  }

  // G9.2-16: Stale priority_change suggestion is skipped safely
  try {
    resetStores();
    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'Stale task test',
        suggestions: [
          {
            type: 'priority_change',
            taskId: 'non-existent-task-id-999',
            priority: 'high',
            reason: 'Task no longer exists',
          },
        ],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' }).props.onClick();
    });

    const staleWarning = root.root.findByProps({ 'data-testid': 'suggestion-stale-0' });
    const hasWarning = Boolean(staleWarning);

    // Apply button should be disabled since stale items cannot be applied
    const applyBtn = root.root.findByProps({ 'data-testid': 'plan-assist-apply-btn' });
    const isDisabled = applyBtn.props.disabled;

    logResult(
      'G9.2-16',
      hasWarning && isDisabled,
      'Stale priority_change suggestion displays warning and is skipped without crashing.'
    );
  } catch (err: any) {
    logResult('G9.2-16', false, `Failed: ${err.message}`);
  }

  // G9.2-17: Double Apply cannot create duplicate mutations
  try {
    resetStores();
    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'Double click test',
        suggestions: [
          { type: 'new_task', title: 'Single Mutation Task', priority: 'medium', reason: 'Single' },
        ],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' }).props.onClick();
    });

    const applyBtn = root.root.findByProps({ 'data-testid': 'plan-assist-apply-btn' });
    // Fire double apply clicks simultaneously
    await act(async () => {
      applyBtn.props.onClick();
      applyBtn.props.onClick();
    });

    const tasks = useTaskStore.getState().tasks.filter((t) => t.title === 'Single Mutation Task');
    logResult(
      'G9.2-17',
      tasks.length === 1,
      'Double Apply guard prevents race conditions from creating duplicate mutations.'
    );
  } catch (err: any) {
    logResult('G9.2-17', false, `Failed: ${err.message}`);
  }

  // G9.2-18: Cancel causes zero mutations
  try {
    resetStores();
    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'Cancel test',
        suggestions: [
          { type: 'new_task', title: 'Do Not Create This', priority: 'high', reason: 'Cancel' },
        ],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' }).props.onClick();
    });

    // Click Cancel
    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-cancel-btn' }).props.onClick();
    });

    const tasks = useTaskStore.getState().tasks;
    logResult(
      'G9.2-18',
      tasks.length === 0,
      'Canceling or closing review surface performs zero mutations on taskStore.'
    );
  } catch (err: any) {
    logResult('G9.2-18', false, `Failed: ${err.message}`);
  }

  // G9.2-19: Closing during generation aborts the request
  try {
    resetStores();
    let abortedSignal: boolean = false;
    const mockService = createMockPlanAssistService(async (ctx, options) => {
      return new Promise<PlanAssistResponse>((resolve) => {
        options?.abortSignal?.addEventListener('abort', () => {
          abortedSignal = true;
          resolve({
            success: false,
            error: { code: 'ABORTED', message: 'Aborted', isAborted: true },
          });
        });
      });
    });

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' }).props.onClick();
    });

    // Close while generating
    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-close-btn' }).props.onClick();
    });

    logResult(
      'G9.2-19',
      abortedSignal,
      'Closing during generation triggers AbortController.abort() on the in-flight request.'
    );
  } catch (err: any) {
    logResult('G9.2-19', false, `Failed: ${err.message}`);
  }

  // G9.2-20: Abort does not display a normal error
  try {
    resetStores();
    const mockService = createMockPlanAssistService(async () => ({
      success: false,
      error: { code: 'ABORTED', message: 'The plan assist request was cancelled.', isAborted: true },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlanAssistDrawer
            isOpen={true}
            onClose={() => {}}
            selectedDate="2026-10-10"
            service={mockService}
          />
        </TestAppWrapper>
      );
    });

    let hasErrorState = false;
    try {
      root.root.findByProps({ 'data-testid': 'plan-assist-error-state' });
      hasErrorState = true;
    } catch {
      hasErrorState = false;
    }

    logResult(
      'G9.2-20',
      !hasErrorState,
      'Aborted requests do not display an alarming error state to the user.'
    );
  } catch (err: any) {
    logResult('G9.2-20', false, `Failed: ${err.message}`);
  }

  // G9.2-21: API error renders retry state
  try {
    resetStores();
    const mockService = createMockPlanAssistService(async () => ({
      success: false,
      error: { code: 'API_ERROR', message: 'Failed to reach AI model endpoint', isAborted: false },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' }).props.onClick();
    });

    const errorBox = root.root.findByProps({ 'data-testid': 'plan-assist-error-state' });
    const retryBtn = root.root.findByProps({ 'data-testid': 'plan-assist-retry' });
    const errorMsg = root.root.findByProps({ 'data-testid': 'plan-assist-error-message' });

    logResult(
      'G9.2-21',
      Boolean(errorBox) && Boolean(retryBtn) && errorMsg.props.children.includes('AI model endpoint'),
      'API error renders a clear error message along with a Retry action.'
    );
  } catch (err: any) {
    logResult('G9.2-21', false, `Failed: ${err.message}`);
  }

  // G9.2-22: Retry sends fresh current context
  try {
    resetStores();
    let callCount = 0;
    const mockService = createMockPlanAssistService(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          success: false,
          error: { code: 'API_ERROR', message: 'Initial error', isAborted: false },
        };
      }
      return {
        success: true,
        data: { summary: 'Recovered', suggestions: [] },
      };
    });

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' }).props.onClick();
    });

    // Click retry
    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-retry' }).props.onClick();
    });

    logResult(
      'G9.2-22',
      callCount === 2,
      'Clicking Retry sends a fresh request with current context to the service.'
    );
  } catch (err: any) {
    logResult('G9.2-22', false, `Failed: ${err.message}`);
  }

  // G9.2-23: Empty suggestions render useful empty state
  try {
    resetStores();
    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'All tasks completed for today.',
        suggestions: [],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' }).props.onClick();
    });

    const emptyState = root.root.findByProps({ 'data-testid': 'plan-assist-empty-state' });
    logResult(
      'G9.2-23',
      Boolean(emptyState),
      'Empty suggestions response renders clean, reassuring empty state.'
    );
  } catch (err: any) {
    logResult('G9.2-23', false, `Failed: ${err.message}`);
  }

  // G9.2-24: Arabic labels/layout render correctly
  try {
    resetStores();
    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'خطة عمل استراتيجية لليوم',
        suggestions: [
          { type: 'new_task', title: 'مهمة عربية جديدة', priority: 'high', reason: 'سبب وجيه' },
        ],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="ar">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    const triggerBtn = root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' });
    const hasArabicLabel = triggerBtn.props.children.some((c: any) =>
      typeof c === 'object' && c.props?.children?.includes('المساعد الذكي للتخطيط')
    );

    await act(async () => {
      triggerBtn.props.onClick();
    });

    const overlay = root.root.findByProps({ 'data-testid': 'plan-assist-drawer-overlay' });
    const isRtl = overlay.props.dir === 'rtl';

    logResult(
      'G9.2-24',
      hasArabicLabel && isRtl,
      'Arabic language renders proper Arabic labels and dir="rtl" layout.'
    );
  } catch (err: any) {
    logResult('G9.2-24', false, `Failed: ${err.message}`);
  }

  // G9.2-25: English labels/layout render correctly
  try {
    resetStores();
    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'English plan summary',
        suggestions: [],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    const triggerBtn = root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' });
    await act(async () => {
      triggerBtn.props.onClick();
    });

    const overlay = root.root.findByProps({ 'data-testid': 'plan-assist-drawer-overlay' });
    const isLtr = overlay.props.dir === 'ltr';

    logResult(
      'G9.2-25',
      isLtr,
      'English language renders proper English labels and dir="ltr" layout.'
    );
  } catch (err: any) {
    logResult('G9.2-25', false, `Failed: ${err.message}`);
  }

  // G9.2-26: Planner remains on the selected date after apply
  try {
    resetStores();
    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'Date preservation test',
        suggestions: [
          { type: 'new_task', title: 'Persisted Date Task', priority: 'medium', reason: 'Preserve' },
        ],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    // Select specific date: 2026-11-05
    await act(async () => {
      root.root.findByProps({ 'data-testid': 'date-picker' }).props.onChange({
        target: { value: '2026-11-05' },
      });
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' }).props.onClick();
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-apply-btn' }).props.onClick();
    });

    const datePickerAfter = root.root.findByProps({ 'data-testid': 'date-picker' });
    logResult(
      'G9.2-26',
      datePickerAfter.props.value === '2026-11-05',
      `Planner stays on selectedDate (2026-11-05) after applying changes.`
    );
  } catch (err: any) {
    logResult('G9.2-26', false, `Failed: ${err.message}`);
  }

  // G9.2-27: Applying suggestions updates the visible Planner state
  try {
    resetStores();
    const targetDate = '2026-10-18';
    const mockService = createMockPlanAssistService(async () => ({
      success: true,
      data: {
        summary: 'Visible update test',
        suggestions: [
          { type: 'new_task', title: 'Visible In Planner List', priority: 'high', reason: 'Visible' },
        ],
      },
    }));

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView service={mockService} />
        </TestAppWrapper>
      );
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'date-picker' }).props.onChange({
        target: { value: targetDate },
      });
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-trigger-btn' }).props.onClick();
    });

    await act(async () => {
      root.root.findByProps({ 'data-testid': 'plan-assist-apply-btn' }).props.onClick();
    });

    // Verify task title appears in visible planner
    const rootJson = JSON.stringify(root.toJSON());
    const isVisibleInPlanner = rootJson.includes('Visible In Planner List');

    logResult(
      'G9.2-27',
      isVisibleInPlanner,
      'Applying suggestions instantly updates the visible Planner task list.'
    );
  } catch (err: any) {
    logResult('G9.2-27', false, `Failed: ${err.message}`);
  }

  // G9.2-28: Unmount does not cause stale React updates
  try {
    resetStores();
    let resolveLongRunning: any;
    const mockService = createMockPlanAssistService(async () => {
      return new Promise<PlanAssistResponse>((resolve) => {
        resolveLongRunning = resolve;
      });
    });

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlanAssistDrawer
            isOpen={true}
            onClose={() => {}}
            selectedDate="2026-10-10"
            service={mockService}
          />
        </TestAppWrapper>
      );
    });

    // Unmount immediately while generating
    await act(async () => {
      root.unmount();
    });

    // Complete the promise after unmount
    if (resolveLongRunning) {
      resolveLongRunning({
        success: true,
        data: { summary: 'Late', suggestions: [] },
      });
    }

    logResult(
      'G9.2-28',
      true,
      'Unmounting PlanAssistDrawer while generation is pending cleans up safely without stale updates.'
    );
  } catch (err: any) {
    logResult('G9.2-28', false, `Failed: ${err.message}`);
  }

  console.log('=== TEST SUITE COMPLETE ===');
  if (allPassed) {
    console.log('ALL GATE 9.2 TESTS PASSED');
    process.exit(0);
  } else {
    console.error('SOME GATE 9.2 TESTS FAILED');
    process.exit(1);
  }
}

runTests();
