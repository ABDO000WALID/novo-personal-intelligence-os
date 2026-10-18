import { Task } from '../../types/data';
import { ProductivitySummary } from './intelligenceTypes';
import { getTodayString, isDateBeforeToday } from './dateUtils';

/**
 * Deterministic Productivity Analysis Engine
 * Evaluates Planner tasks and calculates completion, priority load, and overdue metrics.
 */
export function analyzeProductivity(tasks: Task[], now: Date = new Date()): ProductivitySummary {
  const todayStr = getTodayString(now);
  const safeTasks = Array.isArray(tasks) ? tasks : [];

  const totalTasks = safeTasks.length;
  const completedTasks = safeTasks.filter((t) => t && t.completed).length;
  const pendingTasks = totalTasks - completedTasks;

  const normalizeDate = (d?: string): string => {
    if (!d) return '';
    return d.includes('T') ? d.split('T')[0] : d;
  };

  const todayTasksList = safeTasks.filter((t) => t && normalizeDate(t.date) === todayStr);
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
