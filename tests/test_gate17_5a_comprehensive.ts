import { Goal, Task, FocusSession } from './src/types/data';
import {
  calculateGoalPacing,
  analyzeAllGoalsPacing,
  GoalPacingAnalysis,
} from './src/core/intelligence/goalVelocityEngine';

console.log('========================================');
console.log('STARTING GATE 17.5A COMPREHENSIVE SUITE');
console.log('========================================');

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ [PASS] ${message}`);
}

const NOW = new Date('2026-09-23T12:00:00.000Z');
const TODAY_STR = '2026-09-23';

function makeGoal(partial: Partial<Goal> & { id: string; title: string }): Goal {
  return {
    description: 'Test goal description',
    progress: 0,
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
    ...partial,
  };
}

function makeTask(partial: Partial<Task> & { id: string; title: string }): Task {
  return {
    date: TODAY_STR,
    completed: false,
    priority: 'medium',
    createdAt: '2026-09-23T00:00:00.000Z',
    ...partial,
  };
}

function makeFocusSession(partial: Partial<FocusSession> & { id: string; duration: number }): FocusSession {
  return {
    completedAt: '2026-09-23T10:00:00.000Z',
    ...partial,
  };
}

// ----------------------------------------------------
// 1. Goal Lifetime Age Calculation
// ----------------------------------------------------
{
  const goalSameDay = makeGoal({ id: 'g1', title: 'Same Day', createdAt: '2026-09-23T08:00:00.000Z' });
  const p1 = calculateGoalPacing(goalSameDay, [], [], NOW);
  assert(p1.ageDays === 0, '1. Same day goal has ageDays === 0');

  const goal10DaysAgo = makeGoal({ id: 'g2', title: '10 Days Old', createdAt: '2026-09-13T12:00:00.000Z' });
  const p2 = calculateGoalPacing(goal10DaysAgo, [], [], NOW);
  assert(p2.ageDays === 10, '1b. 10-day old goal has ageDays === 10');
}

// ----------------------------------------------------
// 2. Lifetime Progress Pace Calculation
// ----------------------------------------------------
{
  // Same day goal: divisor is max(0, 1) = 1. Progress 45 => 45 %/day
  const goalFresh = makeGoal({ id: 'g3', title: 'Fresh', progress: 45, createdAt: '2026-09-23T08:00:00.000Z' });
  const p3 = calculateGoalPacing(goalFresh, [], [], NOW);
  assert(p3.lifetimePace === 45, '2. Fresh goal lifetime pace divides by 1');

  // 10 days old with progress 50 => 50 / 10 = 5.0 %/day
  const goalTen = makeGoal({ id: 'g4', title: 'Ten Days', progress: 50, createdAt: '2026-09-13T12:00:00.000Z' });
  const p4 = calculateGoalPacing(goalTen, [], [], NOW);
  assert(p4.lifetimePace === 5, '2b. 10-day old goal pace = 50 / 10 = 5%/day');
}

// ----------------------------------------------------
// 3. Zero-Linked-Task Handling
// ----------------------------------------------------
{
  const goalNoTasks = makeGoal({ id: 'g-notasks', title: 'No Tasks', progress: 20 });
  const p = calculateGoalPacing(goalNoTasks, [], [], NOW);
  assert(p.linkedTaskCount === 0, '3. Zero linked tasks detected');
  assert(p.completedLinkedTaskCount === 0, '3b. Zero completed linked tasks');
  assert(p.executionCompletionRatio === 'no_data', '3c. Execution ratio is strictly "no_data" (not 0% or NaN)');
  assert(p.activityState === 'No Execution Data', '3d. Fresh goal with 0 tasks is "No Execution Data"');
}

// ----------------------------------------------------
// 4. Execution Completion Ratio
// ----------------------------------------------------
{
  const g = makeGoal({ id: 'g-exec', title: 'Exec Goal' });
  const tasks: Task[] = [
    makeTask({ id: 't1', title: 'Task 1', goalId: g.id, completed: true }),
    makeTask({ id: 't2', title: 'Task 2', goalId: g.id, completed: false }),
    makeTask({ id: 't3', title: 'Task 3', goalId: g.id, completed: true }),
    makeTask({ id: 't4', title: 'Other Goal Task', goalId: 'other-g', completed: false }),
  ];
  const p = calculateGoalPacing(g, tasks, [], NOW);
  assert(p.linkedTaskCount === 3, '4. Filters tasks strictly to target goalId');
  assert(p.completedLinkedTaskCount === 2, '4b. Correct completed count (2)');
  assert(p.executionCompletionRatio === 66.7, '4c. Execution ratio rounded to 1 decimal: 2/3 = 66.7%');
}

// ----------------------------------------------------
// 5. Scheduled Task Classification
// ----------------------------------------------------
{
  const g = makeGoal({ id: 'g-dist', title: 'Dist Goal' });
  const tasks: Task[] = [
    makeTask({ id: 't-od', title: 'Overdue', goalId: g.id, completed: false, date: '2026-09-20' }),
    makeTask({ id: 't-td', title: 'Today', goalId: g.id, completed: false, date: '2026-09-23' }),
    makeTask({ id: 't-up', title: 'Upcoming', goalId: g.id, completed: false, date: '2026-09-25' }),
    makeTask({ id: 't-done-od', title: 'Done Overdue', goalId: g.id, completed: true, date: '2026-09-20' }),
  ];
  const p = calculateGoalPacing(g, tasks, [], NOW);
  assert(p.overdueLinkedTaskCount === 1, '5. Correct overdue incomplete task count (1)');
  assert(p.todayLinkedTaskCount === 1, '5b. Correct today incomplete task count (1)');
  assert(p.upcomingLinkedTaskCount === 1, '5c. Correct upcoming incomplete task count (1)');
}

// ----------------------------------------------------
// 6. Focus Aggregation
// ----------------------------------------------------
{
  const g = makeGoal({ id: 'g-foc', title: 'Focus Goal' });
  const sessions: FocusSession[] = [
    makeFocusSession({ id: 's1', duration: 25, goalId: g.id }),
    makeFocusSession({ id: 's2', duration: 50, goalId: g.id }),
    makeFocusSession({ id: 's3', duration: 30, goalId: 'other-goal' }),
    makeFocusSession({ id: 's4', duration: 0, goalId: g.id }),
  ];
  const p = calculateGoalPacing(g, [], sessions, NOW);
  assert(p.focusMinutes === 75, '6. Accurately sums focus minutes (25 + 50 = 75) strictly for target goal');
}

// ----------------------------------------------------
// 7. Activity-State Classification
// ----------------------------------------------------
{
  // A. Dormant / Stalled: updatedAt > 7 days ago, no recent completed tasks
  const gDormant = makeGoal({
    id: 'g-dormant',
    title: 'Dormant Goal',
    updatedAt: '2026-09-10T00:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
  });
  const pDormant = calculateGoalPacing(gDormant, [], [], NOW);
  assert(pDormant.activityState === 'Dormant / Stalled', '7a. Inactive > 7 days is Dormant / Stalled');

  // B. Pacing Deficit: has overdue incomplete linked tasks
  const gDeficit = makeGoal({
    id: 'g-def',
    title: 'Deficit Goal',
    updatedAt: '2026-09-22T00:00:00.000Z',
  });
  const tasksDeficit = [
    makeTask({ id: 't-od1', title: 'Overdue task', goalId: gDeficit.id, completed: false, date: '2026-09-20' }),
  ];
  const pDeficit = calculateGoalPacing(gDeficit, tasksDeficit, [], NOW);
  assert(pDeficit.activityState === 'Pacing Deficit', '7b. Overdue task yields Pacing Deficit');

  // C. Active: has tasks today OR updated <= 3 days ago
  const gActive = makeGoal({
    id: 'g-act',
    title: 'Active Goal',
    updatedAt: '2026-09-22T00:00:00.000Z',
  });
  const tasksActive = [
    makeTask({ id: 't-today', title: 'Today task', goalId: gActive.id, completed: false, date: TODAY_STR }),
  ];
  const pActive = calculateGoalPacing(gActive, tasksActive, [], NOW);
  assert(pActive.activityState === 'Active', '7c. Today task yields Active state');

  // D. Steady: tasks exist, not dormant, no overdue, no today tasks, updated > 3 days and <= 7 days
  const gSteady = makeGoal({
    id: 'g-ste',
    title: 'Steady Goal',
    updatedAt: '2026-09-18T00:00:00.000Z', // 5 days ago
  });
  const tasksSteady = [
    makeTask({ id: 't-up1', title: 'Upcoming task', goalId: gSteady.id, completed: false, date: '2026-09-28' }),
  ];
  const pSteady = calculateGoalPacing(gSteady, tasksSteady, [], NOW);
  assert(pSteady.activityState === 'Steady', '7d. Healthy upcoming pacing yields Steady state');
}

// ----------------------------------------------------
// 8. Deterministic Output for Identical Input
// ----------------------------------------------------
{
  const g = makeGoal({ id: 'g-det', title: 'Deterministic', progress: 30 });
  const tasks = [makeTask({ id: 't-det', title: 'T1', goalId: g.id, completed: true })];
  const res1 = calculateGoalPacing(g, tasks, [], NOW);
  const res2 = calculateGoalPacing(g, tasks, [], NOW);
  assert(JSON.stringify(res1) === JSON.stringify(res2), '8. Identical inputs produce bit-for-bit identical output');
}

// ----------------------------------------------------
// 9. Input Immutability / Frozen Objects
// ----------------------------------------------------
{
  const gFrozen = Object.freeze(makeGoal({ id: 'g-froz', title: 'Frozen Goal', progress: 50 }));
  const tFrozen = Object.freeze(makeTask({ id: 't-froz', title: 'Frozen Task', goalId: gFrozen.id }));
  const sFrozen = Object.freeze(makeFocusSession({ id: 's-froz', duration: 25, goalId: gFrozen.id }));

  const res = calculateGoalPacing(gFrozen, [tFrozen], [sFrozen], NOW);
  assert(res.goalId === 'g-froz' && res.focusMinutes === 25, '9. Safe execution with Object.freeze without mutation errors');
}

// ----------------------------------------------------
// 10. Input-Order Permutation
// ----------------------------------------------------
{
  const gA = makeGoal({ id: 'goal-a', title: 'Goal A' });
  const gB = makeGoal({ id: 'goal-b', title: 'Goal B' });
  const gC = makeGoal({ id: 'goal-c', title: 'Goal C' });

  const list1 = analyzeAllGoalsPacing([gC, gA, gB], [], [], NOW);
  const list2 = analyzeAllGoalsPacing([gB, gC, gA], [], [], NOW);

  assert(list1[0].goalId === 'goal-a' && list1[1].goalId === 'goal-b' && list1[2].goalId === 'goal-c', '10. Results are deterministically sorted by goalId');
  assert(JSON.stringify(list1) === JSON.stringify(list2), '10b. Input order permutation produces identical ordered results');
}

// ----------------------------------------------------
// 11. 0% Progress
// ----------------------------------------------------
{
  const g0 = makeGoal({ id: 'g-zero', title: 'Zero', progress: 0, createdAt: '2026-09-13T00:00:00.000Z' });
  const p0 = calculateGoalPacing(g0, [], [], NOW);
  assert(p0.currentProgress === 0, '11. Progress is 0%');
  assert(p0.lifetimePace === 0, '11b. Lifetime pace is 0.00 %/day');
}

// ----------------------------------------------------
// 12. 100% Progress
// ----------------------------------------------------
{
  const g100 = makeGoal({ id: 'g-hundred', title: 'Complete', progress: 100, createdAt: '2026-09-13T00:00:00.000Z' });
  const p100 = calculateGoalPacing(g100, [], [], NOW);
  assert(p100.currentProgress === 100, '12. Progress is 100%');
  assert(p100.lifetimePace === 10, '12b. Lifetime pace is 10.00 %/day (100 / 10)');
}

// ----------------------------------------------------
// 13. Goals with No Tasks
// ----------------------------------------------------
{
  const gNoT = makeGoal({ id: 'g-empty', title: 'Empty Goal' });
  const pNoT = calculateGoalPacing(gNoT, [], [], NOW);
  assert(pNoT.linkedTaskCount === 0 && pNoT.executionCompletionRatio === 'no_data', '13. Goal with no tasks safely handled');
}

// ----------------------------------------------------
// 14. Goals with Only Future Tasks
// ----------------------------------------------------
{
  const gFut = makeGoal({ id: 'g-fut', title: 'Future Goal', updatedAt: '2026-09-22T00:00:00.000Z' });
  const tFut = [makeTask({ id: 'tf', title: 'Future', goalId: gFut.id, date: '2026-10-01' })];
  const pFut = calculateGoalPacing(gFut, tFut, [], NOW);
  assert(pFut.upcomingLinkedTaskCount === 1 && pFut.overdueLinkedTaskCount === 0 && pFut.todayLinkedTaskCount === 0, '14. Accurately identifies only future tasks');
}

// ----------------------------------------------------
// 15. Goals with Overdue Linked Tasks
// ----------------------------------------------------
{
  const gOd = makeGoal({ id: 'g-od', title: 'Overdue Goal', updatedAt: '2026-09-22T00:00:00.000Z' });
  const tOd = [
    makeTask({ id: 'to1', title: 'Past 1', goalId: gOd.id, date: '2026-09-01', completed: false }),
    makeTask({ id: 'to2', title: 'Past 2', goalId: gOd.id, date: '2026-09-10', completed: false }),
  ];
  const pOd = calculateGoalPacing(gOd, tOd, [], NOW);
  assert(pOd.overdueLinkedTaskCount === 2, '15. Accurately counts multiple overdue tasks');
  assert(pOd.activityState === 'Pacing Deficit', '15b. Sets activityState to Pacing Deficit');
}

// ----------------------------------------------------
// 16. Goals with Mixed Linked Task States
// ----------------------------------------------------
{
  const gMix = makeGoal({ id: 'g-mix', title: 'Mixed Goal' });
  const tMix = [
    makeTask({ id: 'tm1', title: 'Done Past', goalId: gMix.id, date: '2026-09-01', completed: true }),
    makeTask({ id: 'tm2', title: 'Incomplete Past', goalId: gMix.id, date: '2026-09-01', completed: false }),
    makeTask({ id: 'tm3', title: 'Today Task', goalId: gMix.id, date: TODAY_STR, completed: false }),
    makeTask({ id: 'tm4', title: 'Future Task', goalId: gMix.id, date: '2026-10-01', completed: false }),
  ];
  const pMix = calculateGoalPacing(gMix, tMix, [], NOW);
  assert(pMix.linkedTaskCount === 4, '16. Total linked = 4');
  assert(pMix.completedLinkedTaskCount === 1, '16b. Completed linked = 1');
  assert(pMix.overdueLinkedTaskCount === 1, '16c. Overdue incomplete = 1');
  assert(pMix.todayLinkedTaskCount === 1, '16d. Today incomplete = 1');
  assert(pMix.upcomingLinkedTaskCount === 1, '16e. Upcoming incomplete = 1');
  assert(pMix.executionCompletionRatio === 25, '16f. Completion ratio = 25%');
}

// ----------------------------------------------------
// 17. Compatibility with Gate 17.4 Dormant Criterion
// ----------------------------------------------------
{
  // A goal updated 10 days ago with a linked task completed 2 days ago is NOT dormant
  const gActiveByTask = makeGoal({
    id: 'g-comp',
    title: 'Updated 10d ago but task completed 2d ago',
    updatedAt: '2026-09-13T00:00:00.000Z',
  });
  const tRecent = [
    makeTask({ id: 'tr', title: 'Recent Done', goalId: gActiveByTask.id, date: '2026-09-21', completed: true }),
  ];
  const pComp = calculateGoalPacing(gActiveByTask, tRecent, [], NOW);
  assert(pComp.activityState !== 'Dormant / Stalled', '17. Recent completed task prevents Dormant / Stalled state matching Gate 17.4 contract');
}

console.log('========================================');
console.log('GATE 17.5A COMPREHENSIVE SUITE: 23/23 PASS');
console.log('========================================');
