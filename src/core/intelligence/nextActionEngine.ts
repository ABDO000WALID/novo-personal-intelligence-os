import { Goal, Task, TaskPriority } from '../../types/data';
import { normalizeDateString } from './dateUtils';

export type NextActionTier = 1 | 2 | 3 | 4;
export type NextActionTierName = 'overdue' | 'today' | 'unattended_goal' | 'all_clear';

export interface NextActionExistingTask {
  type: 'existing_task';
  tier: 1 | 2;
  tierName: 'overdue' | 'today';
  selectedTaskId: string;
  selectedTask: Task;
}

export interface NextActionNewTaskRequired {
  type: 'new_task_required';
  tier: 3;
  tierName: 'unattended_goal';
  selectedGoalId: string;
  selectedGoal: Goal;
}

export interface NextActionAllClear {
  type: 'all_clear';
  tier: 4;
  tierName: 'all_clear';
}

export type NextActionResult =
  | NextActionExistingTask
  | NextActionNewTaskRequired
  | NextActionAllClear;

const PRIORITY_RANK: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function getPriorityRank(priority?: TaskPriority | string): number {
  if (!priority) return PRIORITY_RANK['medium'];
  return PRIORITY_RANK[priority] ?? PRIORITY_RANK['medium'];
}

/**
 * Deterministically sorts overdue pending tasks:
 * 1. Priority: high > medium > low
 * 2. Earlier createdAt
 * 3. Stable lexical task.id
 */
function sortOverduePendingTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const rankA = getPriorityRank(a.priority);
    const rankB = getPriorityRank(b.priority);
    if (rankA !== rankB) {
      return rankB - rankA;
    }
    const createdA = a.createdAt || '';
    const createdB = b.createdAt || '';
    if (createdA !== createdB) {
      return createdA.localeCompare(createdB);
    }
    return (a.id || '').localeCompare(b.id || '');
  });
}

/**
 * Deterministically sorts today's pending tasks:
 * 1. Priority: high > medium > low
 * 2. If same priority:
 *    - If both tasks are linked to active goals, lower goal progress wins
 *    - If only one is linked to an active goal, do NOT invent progress; preserve both as valid candidates
 * 3. Earlier createdAt
 * 4. Stable lexical task.id
 */
function sortTodayPendingTasks(tasks: Task[], activeGoalsMap: Map<string, Goal>): Task[] {
  return [...tasks].sort((a, b) => {
    // 1. Priority: high > medium > low
    const rankA = getPriorityRank(a.priority);
    const rankB = getPriorityRank(b.priority);
    if (rankA !== rankB) {
      return rankB - rankA;
    }

    // 2. Goal progress tie-break (only when BOTH tasks are linked to active goals)
    const goalA = a.goalId ? activeGoalsMap.get(a.goalId) : undefined;
    const goalB = b.goalId ? activeGoalsMap.get(b.goalId) : undefined;
    if (goalA && goalB) {
      const progA = typeof goalA.progress === 'number' ? goalA.progress : 0;
      const progB = typeof goalB.progress === 'number' ? goalB.progress : 0;
      if (progA !== progB) {
        return progA - progB; // Lower progress wins
      }
    }

    // 3. Earlier createdAt
    const createdA = a.createdAt || '';
    const createdB = b.createdAt || '';
    if (createdA !== createdB) {
      return createdA.localeCompare(createdB);
    }

    // 4. Stable lexical task.id
    return (a.id || '').localeCompare(b.id || '');
  });
}

/**
 * Deterministically selects ONE unattended goal matching Gate 16 contract:
 * 1. Lowest progress first
 * 2. Earlier createdAt first
 * 3. Stable lexical goal.id
 */
export function selectDeterministicUnattendedGoal(unattendedGoals: Goal[]): Goal | null {
  if (!unattendedGoals || !Array.isArray(unattendedGoals) || unattendedGoals.length === 0) {
    return null;
  }

  const sorted = [...unattendedGoals].sort((a, b) => {
    const progA = typeof a.progress === 'number' ? a.progress : 0;
    const progB = typeof b.progress === 'number' ? b.progress : 0;
    if (progA !== progB) {
      return progA - progB;
    }

    const createdA = a.createdAt || '';
    const createdB = b.createdAt || '';
    if (createdA !== createdB) {
      return createdA.localeCompare(createdB);
    }

    return (a.id || '').localeCompare(b.id || '');
  });

  return sorted[0] || null;
}

/**
 * Pure deterministic Next Action Engine
 * Evaluates tasks and goals and returns NOVO's authoritative next action.
 * Zero mutations, zero side effects, same inputs => same output.
 */
export function determineNextAction(
  tasks: Task[],
  goals: Goal[],
  today?: string | Date
): NextActionResult {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safeGoals = Array.isArray(goals) ? goals : [];
  const todayStr = normalizeDateString(today) || normalizeDateString(new Date());

  // Active goals: valid id and progress < 100
  const activeGoals = safeGoals.filter(
    (g) =>
      g &&
      typeof g.id === 'string' &&
      g.id.trim() !== '' &&
      (typeof g.progress !== 'number' || g.progress < 100)
  );
  const activeGoalsMap = new Map<string, Goal>();
  for (const g of activeGoals) {
    activeGoalsMap.set(g.id, g);
  }

  // TIER 1 — OVERDUE PENDING TASK
  // Incomplete tasks where task.date < today
  const overduePendingTasks = safeTasks.filter(
    (t) =>
      t &&
      !t.completed &&
      typeof t.date === 'string' &&
      normalizeDateString(t.date) < todayStr
  );

  if (overduePendingTasks.length > 0) {
    const sortedOverdue = sortOverduePendingTasks(overduePendingTasks);
    const selectedTask = sortedOverdue[0];
    return {
      type: 'existing_task',
      tier: 1,
      tierName: 'overdue',
      selectedTaskId: selectedTask.id,
      selectedTask,
    };
  }

  // TIER 2 — TODAY'S PENDING TASK
  // If no overdue pending tasks, inspect incomplete tasks where task.date === today
  const todayPendingTasks = safeTasks.filter(
    (t) =>
      t &&
      !t.completed &&
      typeof t.date === 'string' &&
      normalizeDateString(t.date) === todayStr
  );

  if (todayPendingTasks.length > 0) {
    const sortedToday = sortTodayPendingTasks(todayPendingTasks, activeGoalsMap);
    const selectedTask = sortedToday[0];
    return {
      type: 'existing_task',
      tier: 2,
      tierName: 'today',
      selectedTaskId: selectedTask.id,
      selectedTask,
    };
  }

  // TIER 3 — UNATTENDED ACTIVE GOAL
  // Only when zero overdue pending tasks and zero pending tasks today.
  // Goals attended today: active goals with at least one task scheduled today (completed or pending).
  const todayTasks = safeTasks.filter(
    (t) => t && typeof t.date === 'string' && normalizeDateString(t.date) === todayStr
  );
  const scheduledGoalIdsToday = new Set<string>();
  for (const t of todayTasks) {
    if (t && t.goalId && activeGoalsMap.has(t.goalId)) {
      scheduledGoalIdsToday.add(t.goalId);
    }
  }

  const unattendedGoals = activeGoals.filter((g) => !scheduledGoalIdsToday.has(g.id));

  if (unattendedGoals.length > 0) {
    const selectedGoal = selectDeterministicUnattendedGoal(unattendedGoals);
    if (selectedGoal) {
      // DUPLICATE PROTECTION:
      // Check whether there is already an actionable task today explicitly linked to that same goal.
      const actionableTasksForGoal = safeTasks.filter(
        (t) =>
          t &&
          !t.completed &&
          typeof t.date === 'string' &&
          normalizeDateString(t.date) === todayStr &&
          t.goalId === selectedGoal.id
      );

      if (actionableTasksForGoal.length > 0) {
        const sortedActionable = sortTodayPendingTasks(actionableTasksForGoal, activeGoalsMap);
        const existingTask = sortedActionable[0];
        return {
          type: 'existing_task',
          tier: 2,
          tierName: 'today',
          selectedTaskId: existingTask.id,
          selectedTask: existingTask,
        };
      }

      return {
        type: 'new_task_required',
        tier: 3,
        tierName: 'unattended_goal',
        selectedGoalId: selectedGoal.id,
        selectedGoal,
      };
    }
  }

  // TIER 4 — ALL CLEAR
  return {
    type: 'all_clear',
    tier: 4,
    tierName: 'all_clear',
  };
}

export const recommendNextAction = determineNextAction;
