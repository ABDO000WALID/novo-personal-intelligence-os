import { Goal, Task } from '../../types/data';
import { GoalHealthResult, GoalHealthStatus } from './intelligenceTypes';
import { isWithinDays, normalizeDateString } from './dateUtils';

export interface GoalTaskActivity {
  total: number;
  completed: number;
  pending: number;
}

/**
 * Pure derived calculation of task activity for a given goal.
 * Does not mutate any store or database.
 */
export function getGoalTaskActivity(goalId: string, tasks: Task[]): GoalTaskActivity {
  if (!goalId || !Array.isArray(tasks)) {
    return { total: 0, completed: 0, pending: 0 };
  }
  const linkedTasks = tasks.filter((t) => t && t.goalId === goalId);
  const completed = linkedTasks.filter((t) => Boolean(t.completed)).length;
  const pending = linkedTasks.length - completed;
  return {
    total: linkedTasks.length,
    completed,
    pending,
  };
}

/**
 * Deterministic Goal Analysis Engine
 * Calculates progress distribution, velocity indicators, and overall goal health status.
 */
export function analyzeGoals(goals: Goal[], now: Date = new Date()): GoalHealthResult {
  const safeGoals = Array.isArray(goals) ? goals : [];
  const totalGoals = safeGoals.length;

  const sanitizeProgress = (g?: Goal): number => {
    if (!g || typeof g.progress !== 'number' || isNaN(g.progress)) return 0;
    return Math.min(100, Math.max(0, g.progress));
  };

  const completedGoals = safeGoals.filter((g) => sanitizeProgress(g) >= 100).length;
  const activeGoals = totalGoals - completedGoals;

  const totalProgress = safeGoals.reduce((acc, g) => acc + sanitizeProgress(g), 0);
  const averageProgress = totalGoals > 0 ? Math.round(totalProgress / totalGoals) : 0;

  const goalsBelow25 = safeGoals.filter((g) => sanitizeProgress(g) < 25).length;
  const goalsAbove75 = safeGoals.filter((g) => {
    const p = sanitizeProgress(g);
    return p >= 75 && p < 100;
  }).length;

  const recentlyUpdatedGoals = safeGoals.filter((g) =>
    g && isWithinDays(g.updatedAt || g.createdAt, 7, now)
  ).length;

  // Deterministic health classification
  let healthStatus: GoalHealthStatus = 'good';

  if (totalGoals === 0) {
    healthStatus = 'good';
  } else if (completedGoals === totalGoals || averageProgress >= 70) {
    healthStatus = 'excellent';
  } else if (activeGoals > 0 && goalsBelow25 > activeGoals / 2 && averageProgress < 40) {
    healthStatus = 'at_risk';
  } else if (averageProgress < 45 || goalsBelow25 >= 2) {
    healthStatus = 'needs_attention';
  } else {
    healthStatus = 'good';
  }

  return {
    totalGoals,
    activeGoals,
    completedGoals,
    averageProgress,
    goalsBelow25,
    goalsAbove75,
    recentlyUpdatedGoals,
    healthStatus,
  };
}

export interface DailyGoalAlignmentResult {
  todayTaskCount: number;
  todayGoalTaskCount: number;
  todayGoalCompletionCount: number;
  alignmentRate: number; // 0 - 100 percentage
  primaryGoal: Goal | null;
  unattendedGoals: Goal[];
  goalAlignedPriorityTasks: Task[];
}

/**
 * Deterministic Daily Goal Alignment Engine
 * Analyzes today's tasks and active goals to evaluate goal-linked execution.
 * Pure function, zero side-effects, does not mutate any store or object.
 */
export function analyzeDailyGoalAlignment(
  tasks: Task[],
  goals: Goal[],
  targetDate: string | Date = new Date()
): DailyGoalAlignmentResult {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safeGoals = Array.isArray(goals) ? goals : [];

  // Active goals: present, has valid id, and not completed (progress < 100)
  const activeGoals = safeGoals.filter(
    (g) =>
      g &&
      typeof g.id === 'string' &&
      g.id.trim() !== '' &&
      (typeof g.progress !== 'number' || isNaN(g.progress) || g.progress < 100)
  );

  const activeGoalsMap = new Map<string, Goal>();
  for (const g of activeGoals) {
    activeGoalsMap.set(g.id, g);
  }

  const dateStr = normalizeDateString(targetDate);
  const todayTasks = safeTasks.filter((t) => t && normalizeDateString(t.date) === dateStr);
  const todayTaskCount = todayTasks.length;

  // A task counts as goal-aligned only if it references a valid active goal
  const todayGoalTasks = todayTasks.filter(
    (t) => Boolean(t && t.goalId && activeGoalsMap.has(t.goalId))
  );
  const todayGoalTaskCount = todayGoalTasks.length;
  const todayGoalCompletionCount = todayGoalTasks.filter((t) => Boolean(t.completed)).length;

  const alignmentRate =
    todayTaskCount > 0 ? Math.round((todayGoalTaskCount / todayTaskCount) * 100) : 0;

  // Count scheduled tasks per active goal
  const taskCountPerGoal = new Map<string, number>();
  for (const t of todayGoalTasks) {
    const gid = t.goalId!;
    taskCountPerGoal.set(gid, (taskCountPerGoal.get(gid) || 0) + 1);
  }

  // Primary goal: active goal with greatest number of today's linked tasks.
  // Ties resolved deterministically by preserving order in activeGoals (count > maxCount).
  let maxCount = 0;
  let primaryGoal: Goal | null = null;
  for (const g of activeGoals) {
    const count = taskCountPerGoal.get(g.id) || 0;
    if (count > maxCount) {
      maxCount = count;
      primaryGoal = g;
    }
  }

  // Unattended goals: active goals with zero tasks scheduled for targetDate
  const unattendedGoals = activeGoals.filter(
    (g) => (taskCountPerGoal.get(g.id) || 0) === 0
  );

  // Goal-aligned priority tasks: small deterministic list of today's goal-linked tasks that are high priority
  const goalAlignedPriorityTasks = todayGoalTasks.filter((t) => t.priority === 'high');

  return {
    todayTaskCount,
    todayGoalTaskCount,
    todayGoalCompletionCount,
    alignmentRate,
    primaryGoal,
    unattendedGoals,
    goalAlignedPriorityTasks,
  };
}
