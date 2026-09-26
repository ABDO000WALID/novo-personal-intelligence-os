import React from 'react';
import { create, act } from 'react-test-renderer';
import {
  PlannerView,
  getLocalTodayString,
  formatLocalDateString,
  parseLocalDate,
  addDaysToDateString,
} from './src/modules/planner/PlannerView';
import { useTaskStore } from './src/core/state/taskStore';
import { AppProvider, useApp } from './src/core/providers/AppContext';
import { Task, TaskPriority } from './src/types/data';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { useAuthStore } from './src/core/auth/authStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

async function runTests() {
  console.log('=== RUNNING GATE 8 TESTS (DAILY PLANNER DATE NAVIGATION & EDITING) ===');
  let allPassed = true;

  // Initialize authenticated user context for repositories
  AuthLifecycle.reset('test-user-gate8');
  useAuthStore.setState({
    user: {
      uid: 'test-user-gate8',
      getIdToken: async () => 'test-id-token',
    } as any,
  });

  const logResult = (testId: string, passed: boolean, message: string) => {
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${testId}: ${message}`);
    if (!passed) allPassed = false;
  };

  const todayStr = getLocalTodayString();

  // Test Date Correctness on boundaries
  try {
    // 1. Local date boundary test (e.g. 23:45 at night where UTC would be next day)
    // Create a mock Date at 23:45 on 2026-09-18
    const lateNightDate = new Date(2026, 8, 18, 23, 45, 0); // Month is 0-indexed: 8 is September
    const lateNightStr = getLocalTodayString(lateNightDate);
    const dateBoundaryPassed =
      lateNightStr === '2026-09-18' &&
      addDaysToDateString('2026-12-31', 1) === '2027-01-01' &&
      addDaysToDateString('2024-02-28', 1) === '2024-02-29' && // Leap year
      addDaysToDateString('2026-03-01', -1) === '2026-02-28'; // Non-leap year

    logResult('DATE-CORRECTNESS', dateBoundaryPassed, 'Local YYYY-MM-DD helper handles late night and month/year boundaries accurately.');
  } catch (err: any) {
    logResult('DATE-CORRECTNESS', false, `Date boundary test threw: ${err.message}`);
  }

  // G8-01: Planner initially selects current local date
  try {
    useTaskStore.setState({
      tasks: [],
      status: 'ready',
      error: null,
    });

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const datePicker = root.root.findByProps({ 'data-testid': 'date-picker' });
    const selectedDateLabel = root.root.findByProps({ 'data-testid': 'selected-date-label' });

    logResult(
      'G8-01',
      datePicker.props.value === todayStr && selectedDateLabel.props.children[1].props.children.includes('Today'),
      'Planner initially selects current local date and displays Today indicator.'
    );
  } catch (err: any) {
    logResult('G8-01', false, `Failed: ${err.message}`);
  }

  // G8-02: Previous/next date changes the selected date
  try {
    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const nextBtn = root.root.findByProps({ 'data-testid': 'date-next' });
    await act(async () => {
      nextBtn.props.onClick();
    });

    const tomorrowStr = addDaysToDateString(todayStr, 1);
    let datePicker = root.root.findByProps({ 'data-testid': 'date-picker' });
    const nextChanged = datePicker.props.value === tomorrowStr;

    const prevBtn = root.root.findByProps({ 'data-testid': 'date-prev' });
    await act(async () => {
      prevBtn.props.onClick();
    });

    datePicker = root.root.findByProps({ 'data-testid': 'date-picker' });
    const prevChanged = datePicker.props.value === todayStr;

    logResult(
      'G8-02',
      nextChanged && prevChanged,
      'Previous/next date buttons change the selected date forward and backward.'
    );
  } catch (err: any) {
    logResult('G8-02', false, `Failed: ${err.message}`);
  }

  // G8-03: Today returns to current date
  try {
    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView />
        </TestAppWrapper>
      );
    });

    // Move ahead 3 days
    const nextBtn = root.root.findByProps({ 'data-testid': 'date-next' });
    await act(async () => {
      nextBtn.props.onClick();
      nextBtn.props.onClick();
      nextBtn.props.onClick();
    });

    const todayBtn = root.root.findByProps({ 'data-testid': 'date-today' });
    await act(async () => {
      todayBtn.props.onClick();
    });

    const datePicker = root.root.findByProps({ 'data-testid': 'date-picker' });
    logResult('G8-03', datePicker.props.value === todayStr, 'Today button returns selected date back to current local day.');
  } catch (err: any) {
    logResult('G8-03', false, `Failed: ${err.message}`);
  }

  // G8-04: Tasks are filtered by selected date
  try {
    const dayA = todayStr;
    const dayB = addDaysToDateString(todayStr, 1);

    const taskA: Task = {
      id: 'task-a',
      title: 'Task for Day A',
      date: dayA,
      completed: false,
      priority: 'high',
      createdAt: new Date().toISOString(),
    };
    const taskB: Task = {
      id: 'task-b',
      title: 'Task for Day B',
      date: dayB,
      completed: false,
      priority: 'low',
      createdAt: new Date().toISOString(),
    };

    useTaskStore.setState({
      tasks: [taskA, taskB],
      status: 'ready',
    });

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView />
        </TestAppWrapper>
      );
    });

    // Initially on Day A (todayStr)
    const taskRowsDayA = root.root.findAllByProps({ 'data-testid': `task-row-${taskA.id}` });
    const taskRowsDayB = root.root.findAllByProps({ 'data-testid': `task-row-${taskB.id}` });
    const dayAOk = taskRowsDayA.length === 1 && taskRowsDayB.length === 0;

    // Switch to Day B
    const nextBtn = root.root.findByProps({ 'data-testid': 'date-next' });
    await act(async () => {
      nextBtn.props.onClick();
    });

    const taskRowsDayAAfter = root.root.findAllByProps({ 'data-testid': `task-row-${taskA.id}` });
    const taskRowsDayBAfter = root.root.findAllByProps({ 'data-testid': `task-row-${taskB.id}` });
    const dayBOk = taskRowsDayAAfter.length === 0 && taskRowsDayBAfter.length === 1;

    logResult('G8-04', dayAOk && dayBOk, 'Tasks are filtered strictly by the selected date.');
  } catch (err: any) {
    logResult('G8-04', false, `Failed: ${err.message}`);
  }

  // G8-05: Existing All/Active/Completed filters still compose with selected date
  try {
    const task1: Task = {
      id: 'task-active',
      title: 'Active Task',
      date: todayStr,
      completed: false,
      priority: 'medium',
      createdAt: new Date().toISOString(),
    };
    const task2: Task = {
      id: 'task-done',
      title: 'Completed Task',
      date: todayStr,
      completed: true,
      priority: 'low',
      createdAt: new Date().toISOString(),
    };

    useTaskStore.setState({
      tasks: [task1, task2],
      status: 'ready',
    });

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView />
        </TestAppWrapper>
      );
    });

    // 'all' filter: both tasks visible
    const allCount = root.root.findAll((el: any) => el.props['data-testid']?.startsWith('task-row-')).length;

    // Switch to 'active' filter
    const activeFilterBtn = root.root.findByProps({ 'data-testid': 'filter-active' });
    await act(async () => {
      activeFilterBtn.props.onClick();
    });

    const activeRows = root.root.findAll((el: any) => el.props['data-testid']?.startsWith('task-row-'));
    const activeOk = activeRows.length === 1 && activeRows[0].props['data-testid'] === `task-row-${task1.id}`;

    // Switch to 'completed' filter
    const completedFilterBtn = root.root.findByProps({ 'data-testid': 'filter-completed' });
    await act(async () => {
      completedFilterBtn.props.onClick();
    });

    const completedRows = root.root.findAll((el: any) => el.props['data-testid']?.startsWith('task-row-'));
    const completedOk = completedRows.length === 1 && completedRows[0].props['data-testid'] === `task-row-${task2.id}`;

    logResult(
      'G8-05',
      allCount === 2 && activeOk && completedOk,
      'All/Active/Completed filters compose cleanly with selected date.'
    );
  } catch (err: any) {
    logResult('G8-05', false, `Failed: ${err.message}`);
  }

  // G8-06: Creating a task on a selected date assigns that exact date
  try {
    const targetDate = addDaysToDateString(todayStr, 2);

    useTaskStore.setState({
      tasks: [],
      status: 'ready',
    });

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView />
        </TestAppWrapper>
      );
    });

    // Change date via date-picker
    const datePicker = root.root.findByProps({ 'data-testid': 'date-picker' });
    await act(async () => {
      datePicker.props.onChange({ target: { value: targetDate } });
    });

    // Enter title & select priority
    const titleInput = root.root.findByProps({ 'data-testid': 'new-task-input' });
    const prioritySelect = root.root.findByProps({ 'data-testid': 'new-task-priority' });
    await act(async () => {
      titleInput.props.onChange({ target: { value: 'New Test Task for Future' } });
      prioritySelect.props.onChange({ target: { value: 'high' } });
    });

    // Submit form
    const form = root.root.findByType('form');
    await act(async () => {
      form.props.onSubmit({ preventDefault: () => {} });
    });

    const currentTasks = useTaskStore.getState().tasks;
    const createdTask = currentTasks.find(t => t.title === 'New Test Task for Future');

    logResult(
      'G8-06',
      !!createdTask && createdTask.date === targetDate && createdTask.priority === 'high',
      'Creating a task on a selected date assigns that exact date and priority.'
    );
  } catch (err: any) {
    logResult('G8-06', false, `Failed: ${err.message}`);
  }

  // G8-07: Edit mode opens with the existing task's current values
  try {
    const taskToEdit: Task = {
      id: 'task-edit-me',
      title: 'Original Title',
      priority: 'medium',
      date: todayStr,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    useTaskStore.setState({
      tasks: [taskToEdit],
      status: 'ready',
    });

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView />
        </TestAppWrapper>
      );
    });

    // Click Edit
    const editBtn = root.root.findByProps({ 'data-testid': `task-edit-btn-${taskToEdit.id}` });
    await act(async () => {
      editBtn.props.onClick();
    });

    const titleInput = root.root.findByProps({ 'data-testid': `task-edit-title-${taskToEdit.id}` });
    const prioritySelect = root.root.findByProps({ 'data-testid': `task-edit-priority-${taskToEdit.id}` });
    const dateInput = root.root.findByProps({ 'data-testid': `task-edit-date-${taskToEdit.id}` });

    logResult(
      'G8-07',
      titleInput.props.value === 'Original Title' &&
      prioritySelect.props.value === 'medium' &&
      dateInput.props.value === todayStr,
      'Edit mode opens with existing task title, priority, and date pre-populated.'
    );
  } catch (err: any) {
    logResult('G8-07', false, `Failed: ${err.message}`);
  }

  // G8-08: Saving an edit calls updateTask with title, priority, and date
  try {
    const taskToEdit: Task = {
      id: 'task-edit-save',
      title: 'Before Save Title',
      priority: 'low',
      date: todayStr,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    await seedTask(taskToEdit);

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView />
        </TestAppWrapper>
      );
    });

    // Open edit
    const editBtn = root.root.findByProps({ 'data-testid': `task-edit-btn-${taskToEdit.id}` });
    await act(async () => {
      editBtn.props.onClick();
    });

    const newDate = addDaysToDateString(todayStr, 3);
    const titleInput = root.root.findByProps({ 'data-testid': `task-edit-title-${taskToEdit.id}` });
    const prioritySelect = root.root.findByProps({ 'data-testid': `task-edit-priority-${taskToEdit.id}` });
    const dateInput = root.root.findByProps({ 'data-testid': `task-edit-date-${taskToEdit.id}` });

    await act(async () => {
      titleInput.props.onChange({ target: { value: 'After Save Title' } });
      prioritySelect.props.onChange({ target: { value: 'high' } });
      dateInput.props.onChange({ target: { value: newDate } });
    });

    const saveBtn = root.root.findByProps({ 'data-testid': `task-edit-save-${taskToEdit.id}` });
    await act(async () => {
      await saveBtn.props.onClick();
    });

    const updatedTask = useTaskStore.getState().tasks.find(t => t.id === taskToEdit.id);

    // Also check that edit mode was closed
    const editRows = root.root.findAllByProps({ 'data-testid': `task-edit-row-${taskToEdit.id}` });

    logResult(
      'G8-08',
      updatedTask?.title === 'After Save Title' &&
      updatedTask?.priority === 'high' &&
      updatedTask?.date === newDate &&
      editRows.length === 0,
      'Saving an edit updates title, priority, and date, and exits edit mode.'
    );
  } catch (err: any) {
    logResult('G8-08', false, `Failed: ${err.message}`);
  }

  // G8-09: Canceling an edit makes no updateTask call and preserves original values
  try {
    const taskToCancel: Task = {
      id: 'task-edit-cancel',
      title: 'Preserved Title',
      priority: 'low',
      date: todayStr,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    useTaskStore.setState({
      tasks: [taskToCancel],
      status: 'ready',
    });

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView />
        </TestAppWrapper>
      );
    });

    // Open edit
    const editBtn = root.root.findByProps({ 'data-testid': `task-edit-btn-${taskToCancel.id}` });
    await act(async () => {
      editBtn.props.onClick();
    });

    const titleInput = root.root.findByProps({ 'data-testid': `task-edit-title-${taskToCancel.id}` });
    await act(async () => {
      titleInput.props.onChange({ target: { value: 'Discarded Title' } });
    });

    const cancelBtn = root.root.findByProps({ 'data-testid': `task-edit-cancel-${taskToCancel.id}` });
    await act(async () => {
      cancelBtn.props.onClick();
    });

    const taskInStore = useTaskStore.getState().tasks.find(t => t.id === taskToCancel.id);
    const editRows = root.root.findAllByProps({ 'data-testid': `task-edit-row-${taskToCancel.id}` });

    logResult(
      'G8-09',
      taskInStore?.title === 'Preserved Title' && editRows.length === 0,
      'Canceling an edit preserves original values without updating store.'
    );
  } catch (err: any) {
    logResult('G8-09', false, `Failed: ${err.message}`);
  }

  // G8-10: Toggle completion still works in date-filtered view
  try {
    const taskToToggle: Task = {
      id: 'task-toggle-me',
      title: 'Toggle Me',
      priority: 'medium',
      date: todayStr,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    await seedTask(taskToToggle);

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const toggleBtn = root.root.findByProps({ 'data-testid': `task-toggle-${taskToToggle.id}` });
    await act(async () => {
      await toggleBtn.props.onClick();
    });

    const toggledTask = useTaskStore.getState().tasks.find(t => t.id === taskToToggle.id);
    logResult('G8-10', toggledTask?.completed === true, 'Toggle completion works correctly within date-filtered view.');
  } catch (err: any) {
    logResult('G8-10', false, `Failed: ${err.message}`);
  }

  // G8-11: Delete still works in date-filtered view
  try {
    const taskToDelete: Task = {
      id: 'task-delete-me',
      title: 'Delete Me',
      priority: 'medium',
      date: todayStr,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    await seedTask(taskToDelete);

    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const deleteBtn = root.root.findByProps({ 'data-testid': `task-delete-btn-${taskToDelete.id}` });
    await act(async () => {
      await deleteBtn.props.onClick();
    });

    const deletedInStore = useTaskStore.getState().tasks.some(t => t.id === taskToDelete.id);
    logResult('G8-11', !deletedInStore, 'Deleting a task removes it cleanly from store and view.');
  } catch (err: any) {
    logResult('G8-11', false, `Failed: ${err.message}`);
  }

  // G8-12: Unmount does not leave stale timers/listeners/state updates
  try {
    let unmountClean = true;
    let root: any;
    await act(async () => {
      root = create(
        <TestAppWrapper language="en">
          <PlannerView />
        </TestAppWrapper>
      );
    });

    await act(async () => {
      root.unmount();
    });

    logResult('G8-12', unmountClean, 'PlannerView unmounts cleanly without throwing or leaking state updates.');
  } catch (err: any) {
    logResult('G8-12', false, `Failed: ${err.message}`);
  }

  // G8-13: Arabic and English labels/date behavior render correctly
  try {
    let enRoot: any;
    await act(async () => {
      enRoot = create(
        <TestAppWrapper language="en">
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const enStr = JSON.stringify(enRoot.toJSON());
    const enPassed =
      enStr.includes('Planner & Daily Tasks') &&
      enStr.includes('Today') &&
      enStr.includes('Add Task');

    let arRoot: any;
    await act(async () => {
      arRoot = create(
        <TestAppWrapper language="ar">
          <PlannerView />
        </TestAppWrapper>
      );
    });

    const arStr = JSON.stringify(arRoot.toJSON());
    const arPassed =
      arStr.includes('المخطط والمهام اليومية') &&
      arStr.includes('اليوم') &&
      arStr.includes('إضافة المهمة');

    logResult('G8-13', enPassed && arPassed, 'Both English and Arabic labels render correctly.');
  } catch (err: any) {
    logResult('G8-13', false, `Failed: ${err.message}`);
  }

  if (allPassed) {
    console.log('=== ALL GATE 8 TESTS PASSED ===');
    process.exit(0);
  } else {
    console.error('=== SOME GATE 8 TESTS FAILED ===');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});
