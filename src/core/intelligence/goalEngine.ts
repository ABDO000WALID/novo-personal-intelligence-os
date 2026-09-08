import { Goal } from '../../types/data';
import { GoalHealthResult, GoalHealthStatus } from './intelligenceTypes';
import { isWithinDays } from './dateUtils';

/**
 * Deterministic Goal Analysis Engine
 * Calculates progress distribution, velocity indicators, and overall goal health status.
 */
export function analyzeGoals(goals: Goal[], now: Date = new Date()): GoalHealthResult {
  const totalGoals = goals.length;
  const completedGoals = goals.filter((g) => g.progress >= 100).length;
  const activeGoals = totalGoals - completedGoals;

  const totalProgress = goals.reduce((acc, g) => acc + Math.min(100, Math.max(0, g.progress)), 0);
  const averageProgress = totalGoals > 0 ? Math.round(totalProgress / totalGoals) : 0;

  const goalsBelow25 = goals.filter((g) => g.progress < 25).length;
  const goalsAbove75 = goals.filter((g) => g.progress >= 75 && g.progress < 100).length;

  const recentlyUpdatedGoals = goals.filter((g) =>
    isWithinDays(g.updatedAt || g.createdAt, 7, now)
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
