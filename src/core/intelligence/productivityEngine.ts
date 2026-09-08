import { Task } from '../../types/data';
import { ProductivitySummary } from './intelligenceTypes';
import { getTodayString, isDateBeforeToday } from './dateUtils';

/**
 * Deterministic Productivity Analysis Engine
 * Evaluates Planner tasks and calculates completion, priority load, and overdue metrics.
 */
export function analyzeProductivity(tasks: Task[], now: Date = new Date()): ProductivitySummary {
  const todayStr = getTodayString(now);

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.completed).length;
  const pendingTasks = totalTasks - completedTasks;

  const todayTasksList = tasks.filter((t) => t.date === todayStr);
  const todayTasks = todayTasksList.length;
  const todayCompletedTasks = todayTasksList.filter((t) => t.completed).length;

  const completionPercentage =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const highPriorityPendingCount = tasks.filter(
    (t) => !t.completed && t.priority === 'high'
  ).length;

  const overdueTasksCount = tasks.filter(
    (t) => !t.completed && isDateBeforeToday(t.date, now)
  ).length;

  // Recent completion rate: prioritizes today's tasks if any exist; otherwise falls back to overall
  const recentCompletionRate =
    todayTasks > 0
      ? Math.round((todayCompletedTasks / todayTasks) * 100)
      : completionPercentage;

  return {
    totalTasks,
    completedTasks,
    pendingTasks,
    todayTasks,
    todayCompletedTasks,
    completionPercentage,
    highPriorityPendingCount,
    overdueTasksCount,
    recentCompletionRate,
  };
}
