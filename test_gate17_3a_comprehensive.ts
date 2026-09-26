import { Goal, Task } from './src/types/data';
import {
  determineNextAction,
  recommendNextAction,
  selectDeterministicUnattendedGoal,
  NextActionResult,
} from './src/core/intelligence/nextActionEngine';

console.log('=== GATE 17.3A COMPREHENSIVE VERIFICATION SUITE ===\n');

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

const TODAY = '2026-09-23';

// Helpers to build valid Goal & Task fixtures
function makeGoal(partial: Partial<Goal> & { id: string; title: string }): Goal {
  return {
    description: 'Test goal description',
    progress: 0,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    ...partial,
  };
}

function makeTask(partial: Partial<Task> & { id: string; title: string }): Task {
  return {
    date: TODAY,
    completed: false,
    priority: 'medium',
    createdAt: '2026-01-01T10:00:00.000Z',
    ...partial,
  };
}

// 1. OVERDUE BEATS TODAY
console.log('--- 1. OVERDUE BEATS TODAY ---');
{
  const overdueTask = makeTask({
    id: 't-overdue-1',
    title: 'مهمة متأخرة',
    date: '2026-09-20',
    priority: 'low',
    completed: false,
  });
  const todayTask = makeTask({
    id: 't-today-1',
    title: 'مهمة اليوم العاجلة',
    date: TODAY,
    priority: 'high',
    completed: false,
  });

  const res = determineNextAction([todayTask, overdueTask], [], TODAY);
  assert(res.type === 'existing_task', 'Selected existing task');
  assert(res.tier === 1, 'Tier is 1 (overdue)');
  assert((res as any).selectedTaskId === 't-overdue-1', 'Overdue task selected over today task even with lower priority');
}

// 2. HIGH PRIORITY OVERDUE BEATS MEDIUM OVERDUE
console.log('\n--- 2. HIGH PRIORITY OVERDUE BEATS MEDIUM OVERDUE ---');
{
  const overdueMed = makeTask({
    id: 't-overdue-med',
    title: 'مهمة متأخرة متوسطة',
    date: '2026-09-21',
    priority: 'medium',
    createdAt: '2026-01-01T08:00:00.000Z',
  });
  const overdueHigh = makeTask({
    id: 't-overdue-high',
    title: 'مهمة متأخرة عاجلة',
    date: '2026-09-22',
    priority: 'high',
    createdAt: '2026-01-01T12:00:00.000Z',
  });

  const res = determineNextAction([overdueMed, overdueHigh], [], TODAY);
  assert(res.type === 'existing_task', 'Selected existing task');
  assert((res as any).selectedTaskId === 't-overdue-high', 'High priority overdue beats medium priority overdue');
}

// 3. CREATEDAT TIE-BREAK
console.log('\n--- 3. CREATEDAT TIE-BREAK ---');
{
  const earlierOverdue = makeTask({
    id: 't-earlier',
    title: 'مهمة سابقة',
    date: '2026-09-21',
    priority: 'high',
    createdAt: '2026-01-01T08:00:00.000Z',
  });
  const laterOverdue = makeTask({
    id: 't-later',
    title: 'مهمة لاحقة',
    date: '2026-09-21',
    priority: 'high',
    createdAt: '2026-01-01T10:00:00.000Z',
  });

  const res = determineNextAction([laterOverdue, earlierOverdue], [], TODAY);
  assert((res as any).selectedTaskId === 't-earlier', 'Earlier createdAt task wins tie-break');
}

// 4. TASK.ID TIE-BREAK
console.log('\n--- 4. TASK.ID TIE-BREAK ---');
{
  const taskA = makeTask({
    id: 'task-001',
    title: 'مهمة أ',
    date: '2026-09-21',
    priority: 'high',
    createdAt: '2026-01-01T10:00:00.000Z',
  });
  const taskB = makeTask({
    id: 'task-002',
    title: 'مهمة ب',
    date: '2026-09-21',
    priority: 'high',
    createdAt: '2026-01-01T10:00:00.000Z',
  });

  const res = determineNextAction([taskB, taskA], [], TODAY);
  assert((res as any).selectedTaskId === 'task-001', 'Lexicographically smaller task.id wins tie-break');
}

// 5. TODAY\'S TASK SELECTION
console.log('\n--- 5. TODAY\'S TASK SELECTION ---');
{
  const todayTask = makeTask({
    id: 't-today-only',
    title: 'مهمة اليوم',
    date: TODAY,
    priority: 'medium',
    completed: false,
  });

  const res = determineNextAction([todayTask], [], TODAY);
  assert(res.type === 'existing_task', 'Selected existing task');
  assert(res.tier === 2, 'Tier is 2 (today)');
  assert((res as any).selectedTaskId === 't-today-only', 'Today task selected when no overdue tasks exist');
}

// 6. TODAY\'S PRIORITY ORDERING
console.log('\n--- 6. TODAY\'S PRIORITY ORDERING ---');
{
  const todayLow = makeTask({
    id: 't-today-low',
    title: 'مهمة منخفضة',
    date: TODAY,
    priority: 'low',
    createdAt: '2026-01-01T08:00:00.000Z',
  });
  const todayMed = makeTask({
    id: 't-today-med',
    title: 'مهمة متوسطة',
    date: TODAY,
    priority: 'medium',
    createdAt: '2026-01-01T09:00:00.000Z',
  });
  const todayHigh = makeTask({
    id: 't-today-high',
    title: 'مهمة عاجلة',
    date: TODAY,
    priority: 'high',
    createdAt: '2026-01-01T12:00:00.000Z',
  });

  const res = determineNextAction([todayLow, todayMed, todayHigh], [], TODAY);
  assert((res as any).selectedTaskId === 't-today-high', 'High priority today task selected over medium and low');
}

// 7. LOWER-PROGRESS LINKED GOAL TIE-BREAK
console.log('\n--- 7. LOWER-PROGRESS LINKED GOAL TIE-BREAK ---');
{
  const goalLagging = makeGoal({
    id: 'g-lagging',
    title: 'هدف متأخر',
    progress: 20,
  });
  const goalAdvanced = makeGoal({
    id: 'g-advanced',
    title: 'هدف متقدم',
    progress: 75,
  });

  const taskLagging = makeTask({
    id: 't-task-lagging',
    title: 'عمل على الهدف المتأخر',
    date: TODAY,
    priority: 'medium',
    goalId: 'g-lagging',
    createdAt: '2026-01-01T11:00:00.000Z',
  });
  const taskAdvanced = makeTask({
    id: 't-task-advanced',
    title: 'عمل على الهدف المتقدم',
    date: TODAY,
    priority: 'medium',
    goalId: 'g-advanced',
    createdAt: '2026-01-01T09:00:00.000Z',
  });

  const res = determineNextAction([taskAdvanced, taskLagging], [goalLagging, goalAdvanced], TODAY);
  assert(res.type === 'existing_task', 'Selected existing task');
  assert((res as any).selectedTaskId === 't-task-lagging', 'Lower-progress linked goal task wins tie-break (20% vs 75%)');
}

// 8. UNLINKED TASK REMAINS VALID CANDIDATE
console.log('\n--- 8. UNLINKED TASK REMAINS VALID CANDIDATE ---');
{
  const activeGoal = makeGoal({
    id: 'g-active-1',
    title: 'هدف نشط',
    progress: 50,
  });

  const unlinkedTaskEarlier = makeTask({
    id: 't-unlinked-earlier',
    title: 'مهمة عامة غير مرتبطة بهدف',
    date: TODAY,
    priority: 'high',
    goalId: undefined,
    createdAt: '2026-01-01T09:00:00.000Z',
  });
  const linkedTaskLater = makeTask({
    id: 't-linked-later',
    title: 'مهمة مرتبطة بهدف لاحق',
    date: TODAY,
    priority: 'high',
    goalId: 'g-active-1',
    createdAt: '2026-01-01T11:00:00.000Z',
  });

  // Unlinked has earlier createdAt, both high priority: unlinked must not be disqualified
  const res1 = determineNextAction([linkedTaskLater, unlinkedTaskEarlier], [activeGoal], TODAY);
  assert((res1 as any).selectedTaskId === 't-unlinked-earlier', 'Unlinked task remains valid and wins on earlier createdAt');

  // And if linked has earlier createdAt, linked wins
  const linkedTaskEarlier = makeTask({
    id: 't-linked-earlier',
    title: 'مهمة مرتبطة مبكرة',
    date: TODAY,
    priority: 'high',
    goalId: 'g-active-1',
    createdAt: '2026-01-01T08:00:00.000Z',
  });
  const res2 = determineNextAction([unlinkedTaskEarlier, linkedTaskEarlier], [activeGoal], TODAY);
  assert((res2 as any).selectedTaskId === 't-linked-earlier', 'Linked task wins when it has earlier createdAt');
}

// 9. DETERMINISTIC RESULT UNDER REVERSED INPUT ORDER
console.log('\n--- 9. DETERMINISTIC RESULT UNDER REVERSED INPUT ORDER ---');
{
  const tasks = [
    makeTask({ id: 't1', title: 'Task 1', priority: 'medium', date: TODAY, createdAt: '2026-01-01T10:00:00Z' }),
    makeTask({ id: 't2', title: 'Task 2', priority: 'high', date: TODAY, createdAt: '2026-01-01T11:00:00Z' }),
    makeTask({ id: 't3', title: 'Task 3', priority: 'high', date: TODAY, createdAt: '2026-01-01T09:00:00Z' }),
    makeTask({ id: 't4', title: 'Task 4', priority: 'low', date: '2026-09-20', createdAt: '2026-01-01T12:00:00Z' }),
  ];
  const goals = [
    makeGoal({ id: 'g1', title: 'Goal 1', progress: 30 }),
    makeGoal({ id: 'g2', title: 'Goal 2', progress: 10 }),
  ];

  const resForward = determineNextAction(tasks, goals, TODAY);
  const resReversed = determineNextAction([...tasks].reverse(), [...goals].reverse(), TODAY);

  assert(resForward.type === resReversed.type, 'Result type matches under reverse');
  assert(resForward.tier === resReversed.tier, 'Result tier matches under reverse');
  assert((resForward as any).selectedTaskId === (resReversed as any).selectedTaskId, 'Same task selected regardless of reverse order');
}

// 10. DETERMINISTIC RESULT UNDER SHUFFLED INPUT ORDER
console.log('\n--- 10. DETERMINISTIC RESULT UNDER SHUFFLED INPUT ORDER ---');
{
  const tasks = [
    makeTask({ id: 'ta', title: 'A', priority: 'medium', date: TODAY, createdAt: '2026-01-01T10:00:00Z' }),
    makeTask({ id: 'tb', title: 'B', priority: 'high', date: TODAY, createdAt: '2026-01-01T12:00:00Z' }),
    makeTask({ id: 'tc', title: 'C', priority: 'high', date: TODAY, createdAt: '2026-01-01T08:00:00Z' }),
    makeTask({ id: 'td', title: 'D', priority: 'low', date: TODAY, createdAt: '2026-01-01T07:00:00Z' }),
  ];
  const goals = [makeGoal({ id: 'g1', title: 'Goal 1', progress: 25 })];

  const expectedRes = determineNextAction(tasks, goals, TODAY);

  // Run 10 permutations
  for (let i = 0; i < 10; i++) {
    const shuffledTasks = [...tasks].sort(() => (i % 2 === 0 ? 1 : -1));
    const shuffledRes = determineNextAction(shuffledTasks, goals, TODAY);
    assert(
      (shuffledRes as any).selectedTaskId === (expectedRes as any).selectedTaskId,
      `Permutation ${i + 1} produces exact same selected task`
    );
  }
}

// 11. ZERO PENDING TASKS -> UNATTENDED GOAL PATH
console.log('\n--- 11. ZERO PENDING TASKS -> UNATTENDED GOAL PATH ---');
{
  const completedTask = makeTask({
    id: 't-completed',
    title: 'مهمة منجزة',
    date: TODAY,
    completed: true,
  });
  const unattendedGoal = makeGoal({
    id: 'g-unattended',
    title: 'تعلم لغة جديدة',
    progress: 10,
  });

  const res = determineNextAction([completedTask], [unattendedGoal], TODAY);
  assert(res.type === 'new_task_required', 'Recommendation is new_task_required');
  assert(res.tier === 3, 'Tier is 3 (unattended goal)');
  assert((res as any).selectedGoalId === 'g-unattended', 'Unattended goal selected');
  assert((res as any).selectedGoal.title === 'تعلم لغة جديدة', 'Selected goal title matches');
}

// 12. DETERMINISTIC UNATTENDED GOAL SELECTION MATCHES GATE 16
console.log('\n--- 12. DETERMINISTIC UNATTENDED GOAL SELECTION MATCHES GATE 16 ---');
{
  const goalHighProg = makeGoal({
    id: 'g-high',
    title: 'هدف بنسبة 80%',
    progress: 80,
    createdAt: '2026-01-01T08:00:00Z',
  });
  const goalLowProg1 = makeGoal({
    id: 'g-low-1',
    title: 'هدف بنسبة 15% مبكر',
    progress: 15,
    createdAt: '2026-01-01T09:00:00Z',
  });
  const goalLowProg2 = makeGoal({
    id: 'g-low-2',
    title: 'هدف بنسبة 15% متأخر',
    progress: 15,
    createdAt: '2026-01-01T11:00:00Z',
  });

  const unattendedList = [goalHighProg, goalLowProg2, goalLowProg1];
  const directGate16Selection = selectDeterministicUnattendedGoal(unattendedList);
  assert(directGate16Selection?.id === 'g-low-1', 'Direct Gate 16 selection picks lowest progress & earlier createdAt');

  const engineRes = determineNextAction([], unattendedList, TODAY);
  assert(engineRes.type === 'new_task_required', 'Engine selected new_task_required');
  assert((engineRes as any).selectedGoalId === directGate16Selection?.id, 'Engine selection matches Gate 16 exact selection');
}

// 13. EXISTING ACTIONABLE TASK PREVENTS DUPLICATE PROPOSAL
console.log('\n--- 13. EXISTING ACTIONABLE TASK PREVENTS DUPLICATE PROPOSAL ---');
{
  const goalWithTask = makeGoal({
    id: 'g-has-task',
    title: 'هدف لديه مهمة معلقة اليوم',
    progress: 10,
  });
  const actionableTask = makeTask({
    id: 't-actionable',
    title: 'مهمة الهدف القائمة',
    date: TODAY,
    completed: false,
    goalId: 'g-has-task',
  });

  const res = determineNextAction([actionableTask], [goalWithTask], TODAY);
  assert(res.type === 'existing_task', 'Existing actionable task prevents new_task_required');
  assert(res.tier === 2, 'Recommends existing task (tier 2)');
  assert((res as any).selectedTaskId === 't-actionable', 'Actionable task selected instead of new task proposal');
}

// 14. ALL CLEAR WHEN EVERYTHING IS COMPLETED / ATTENDED
console.log('\n--- 14. ALL CLEAR WHEN EVERYTHING IS COMPLETED / ATTENDED ---');
{
  const completedTask1 = makeTask({
    id: 't-comp-1',
    title: 'مهمة 1 مكتملة',
    date: TODAY,
    completed: true,
    goalId: 'g-done',
  });
  const completedTask2 = makeTask({
    id: 't-comp-2',
    title: 'مهمة 2 مكتملة',
    date: TODAY,
    completed: true,
  });
  const attendedGoal = makeGoal({
    id: 'g-done',
    title: 'هدف تمت مواءمته اليوم',
    progress: 60,
  });

  const res = determineNextAction([completedTask1, completedTask2], [attendedGoal], TODAY);
  assert(res.type === 'all_clear', 'Returns all_clear when all tasks completed and active goals attended');
  assert(res.tier === 4, 'Tier is 4 (all clear)');

  // Also all clear when no goals and no pending tasks
  const resNoGoals = determineNextAction([completedTask2], [], TODAY);
  assert(resNoGoals.type === 'all_clear', 'Returns all_clear when no goals exist and tasks are completed');

  // Also all clear when goals are 100% completed
  const finishedGoal = makeGoal({
    id: 'g-100',
    title: 'هدف منجز 100%',
    progress: 100,
  });
  const resFinishedGoal = determineNextAction([], [finishedGoal], TODAY);
  assert(resFinishedGoal.type === 'all_clear', 'Returns all_clear when all goals are at 100%');
}

// 15. PURE FUNCTION BEHAVIOR
console.log('\n--- 15. PURE FUNCTION BEHAVIOR ---');
{
  const tasks = [
    makeTask({ id: 't1', title: 'Task 1', date: TODAY, priority: 'high' }),
    makeTask({ id: 't2', title: 'Task 2', date: TODAY, priority: 'medium' }),
  ];
  const goals = [makeGoal({ id: 'g1', title: 'Goal 1', progress: 40 })];

  const firstResult = determineNextAction(tasks, goals, TODAY);
  for (let i = 0; i < 10; i++) {
    const repeatResult = determineNextAction(tasks, goals, TODAY);
    assert(
      JSON.stringify(firstResult) === JSON.stringify(repeatResult),
      `Call #${i + 1} produced identical output (pure function)`
    );
  }
}

// 16. NO MUTATION OF INPUT ARRAYS / OBJECTS
console.log('\n--- 16. NO MUTATION OF INPUT ARRAYS / OBJECTS ---');
{
  const task1 = Object.freeze(makeTask({ id: 'freeze-t1', title: 'Frozen 1', date: TODAY, priority: 'high' }));
  const task2 = Object.freeze(makeTask({ id: 'freeze-t2', title: 'Frozen 2', date: TODAY, priority: 'medium' }));
  const tasks = Object.freeze([task1, task2]);

  const goal1 = Object.freeze(makeGoal({ id: 'freeze-g1', title: 'Frozen Goal 1', progress: 30 }));
  const goals = Object.freeze([goal1]);

  let didThrow = false;
  try {
    const res = determineNextAction(tasks as any, goals as any, TODAY);
    assert(res.type === 'existing_task', 'Successfully executed on frozen inputs without attempting mutation');
  } catch (err) {
    didThrow = true;
    console.error('Frozen execution threw:', err);
  }
  assert(!didThrow, 'Zero mutations attempted on frozen input arrays/objects');
}

// 17. MALFORMED / EMPTY DATA HANDLED SAFELY
console.log('\n--- 17. MALFORMED / EMPTY DATA HANDLED SAFELY ---');
{
  // Null / undefined inputs
  const resNull = determineNextAction(null as any, null as any, TODAY);
  assert(resNull.type === 'all_clear', 'Handled null inputs safely as all_clear');

  const resUndefined = determineNextAction(undefined as any, undefined as any, TODAY);
  assert(resUndefined.type === 'all_clear', 'Handled undefined inputs safely as all_clear');

  const resEmpty = determineNextAction([], [], TODAY);
  assert(resEmpty.type === 'all_clear', 'Handled empty arrays safely as all_clear');

  // Tasks missing properties or with invalid dates
  const malformedTasks: any[] = [
    { id: 'mal-1' }, // Missing date, priority, title
    { id: 'mal-2', date: 'invalid-date', completed: false },
    { id: 'mal-3', date: null, completed: false },
    null,
    undefined,
  ];
  const malformedGoals: any[] = [
    { id: 'mal-g1' }, // Missing progress
    { id: '', title: 'Empty id' },
    null,
  ];

  let threwMalformed = false;
  try {
    const resMalformed = determineNextAction(malformedTasks, malformedGoals, TODAY);
    assert(resMalformed.type === 'all_clear' || resMalformed.type === 'new_task_required', 'Malformed data processed without uncaught exceptions');
  } catch (err) {
    threwMalformed = true;
    console.error('Malformed test threw:', err);
  }
  assert(!threwMalformed, 'Malformed data did not throw');
}

// ALIAS VERIFICATION
console.log('\n--- ALIAS VERIFICATION ---');
{
  assert(typeof recommendNextAction === 'function', 'recommendNextAction alias is exported');
  assert(recommendNextAction === determineNextAction, 'recommendNextAction strictly references determineNextAction');
}

console.log('\n========================================');
console.log('🎉 ALL 17 GATE 17.3A TESTS PASSED! 🎉');
console.log('========================================');
