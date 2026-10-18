import { Task, Goal, FocusSession } from '../../types/data';

export type AttentionTier = 1 | 2 | 3 | 4 | 5;

export type AttentionRadarType =
  | 'overdue_task'      // Tier 1
  | 'stalled_goal'      // Tier 2
  | 'urgent_today_task' // Tier 3
  | 'focus_deficit'     // Tier 4
  | 'all_clear';        // Tier 5

export interface AttentionRadarOverdueResult {
  tier: 1;
  type: 'overdue_task';
  selectedTaskId: string;
  selectedTaskTitle: string;
  taskPriority: string;
  taskDueDate: string;
  daysOverdue: number;
}

export interface AttentionRadarStalledGoalResult {
  tier: 2;
  type: 'stalled_goal';
  selectedGoalId: string;
  selectedGoalTitle: string;
  currentProgress: number;
  daysInactive: number;
}

export interface AttentionRadarUrgentTaskResult {
  tier: 3;
  type: 'urgent_today_task';
  selectedTaskId: string;
  selectedTaskTitle: string;
  taskPriority: 'high';
  taskDueDate: string;
}

export interface AttentionRadarFocusDeficitResult {
  tier: 4;
  type: 'focus_deficit';
  pendingTasksTodayCount: number;
  todayFocusMinutes: number;
}

export interface AttentionRadarAllClearResult {
  tier: 5;
  type: 'all_clear';
  pendingTasksTodayCount: number;
  activeGoalsCount: number;
  todayFocusMinutes: number;
}

export type AttentionRadarResult =
  | AttentionRadarOverdueResult
  | AttentionRadarStalledGoalResult
  | AttentionRadarUrgentTaskResult
  | AttentionRadarFocusDeficitResult
  | AttentionRadarAllClearResult;

export interface AttentionInputState {
  tasks: Task[];
  goals: Goal[];
  focusSessions?: FocusSession[];
  todayFocusMinutes?: number;
  todayStr: string;
  now?: Date;
}

const PRIORITY_WEIGHTS: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function parseIsoOrDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function getDaysDifference(earlierDate: Date, laterDate: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const utc1 = Date.UTC(earlierDate.getFullYear(), earlierDate.getMonth(), earlierDate.getDate());
  const utc2 = Date.UTC(laterDate.getFullYear(), laterDate.getMonth(), laterDate.getDate());
  return Math.max(0, Math.floor((utc2 - utc1) / msPerDay));
}

/**
 * Pure, deterministic engine evaluating workspace bottlenecks and attention priorities.
 * Zero writes, zero side-effects, immutable input handling, deterministic tie-breaking.
 */
export function evaluateAttentionRadar(input: AttentionInputState): AttentionRadarResult {
  const tasks = Array.isArray(input?.tasks) ? [...input.tasks] : [];
  const goals = Array.isArray(input?.goals) ? [...input.goals] : [];
  const sessions = Array.isArray(input?.focusSessions) ? [...input.focusSessions] : [];
  const todayStr = input?.todayStr || '';
  
  // Deterministic reference date: if input.now is provided, use it; else parse todayStr.
  const referenceDate = input?.now instanceof Date && !isNaN(input.now.getTime())
    ? input.now
    : (parseIsoOrDate(todayStr) || new Date('2026-09-23T12:00:00Z'));

  // Calculate today focus minutes deterministically
  let computedTodayFocusMinutes = 0;
  if (typeof input?.todayFocusMinutes === 'number' && !isNaN(input.todayFocusMinutes)) {
    computedTodayFocusMinutes = input.todayFocusMinutes;
  } else {
    for (const session of sessions) {
      if (session && typeof session.duration === 'number') {
        const sessionDate = session.completedAt ? session.completedAt.split('T')[0] : '';
        if (sessionDate === todayStr) {
          computedTodayFocusMinutes += session.duration;
        }
      }
    }
  }

  // ==========================================
  // TIER 1 — OVERDUE TASK
  // Condition: incomplete task, task.date < todayStr
  // Sorting: high > medium > low, earlier createdAt, lexical task.id
  // ==========================================
  const normalizeTaskDate = (d?: string): string => {
    if (!d) return '';
    return d.includes('T') ? d.split('T')[0] : d;
  };

  const overdueTasks = tasks.filter((t) => {
    if (!t || t.completed || !t.date) return false;
    return normalizeTaskDate(t.date) < todayStr;
  });

  if (overdueTasks.length > 0) {
    overdueTasks.sort((a, b) => {
      const pA = PRIORITY_WEIGHTS[a.priority || 'medium'] || 2;
      const pB = PRIORITY_WEIGHTS[b.priority || 'medium'] || 2;
      if (pA !== pB) return pB - pA; // Descending weight

      const cA = a.createdAt || '';
      const cB = b.createdAt || '';
      if (cA !== cB) return cA.localeCompare(cB); // Earlier wins

      return (a.id || '').localeCompare(b.id || '');
    });

    const chosenTask = overdueTasks[0];
    const taskDateObj = parseIsoOrDate(chosenTask.date);
    const daysOverdue = taskDateObj ? Math.max(1, getDaysDifference(taskDateObj, referenceDate)) : 1;

    return {
      tier: 1,
      type: 'overdue_task',
      selectedTaskId: chosenTask.id,
      selectedTaskTitle: chosenTask.title,
      taskPriority: chosenTask.priority || 'medium',
      taskDueDate: chosenTask.date,
      daysOverdue,
    };
  }

  // ==========================================
  // TIER 2 — STALLED GOAL
  // Only when there are NO overdue tasks.
  // Condition:
  // - progress < 100
  // - updatedAt is > 7 days old compared to referenceDate
  // - no linked task completed during the last 7 days
  // Selection:
  // 1. most days since last activity/update
  // 2. lowest progress
  // 3. earlier createdAt
  // 4. lexical goal.id
  // ==========================================
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const sevenDaysBeforeRefTime = referenceDate.getTime() - sevenDaysMs;

  interface StalledGoalCandidate {
    goal: Goal;
    daysInactive: number;
    progress: number;
  }

  const stalledCandidates: StalledGoalCandidate[] = [];

  for (const g of goals) {
    if (!g || typeof g.progress !== 'number' || g.progress >= 100) continue;

    // Check last update time
    const updatedTimeObj = parseIsoOrDate(g.updatedAt) || parseIsoOrDate(g.createdAt);
    if (!updatedTimeObj) continue;

    const daysSinceGoalUpdate = getDaysDifference(updatedTimeObj, referenceDate);
    if (daysSinceGoalUpdate <= 7) {
      // Goal was updated within the last 7 days -> Not stalled
      continue;
    }

    // Check if any linked task was completed during the last 7 days
    const linkedCompletedRecently = tasks.some((t) => {
      if (!t || t.goalId !== g.id || !t.completed) return false;
      const completedTimeObj = parseIsoOrDate(t.date);
      if (!completedTimeObj) return false;
      return completedTimeObj.getTime() >= sevenDaysBeforeRefTime;
    });

    if (linkedCompletedRecently) {
      // Goal has recent completed task activity -> Not stalled
      continue;
    }

    // Goal is stalled. Determine daysInactive (at least daysSinceGoalUpdate)
    let daysInactive = daysSinceGoalUpdate;
    // Find the latest completed task time linked to this goal, if any
    const linkedCompletedTasks = tasks.filter((t) => t && t.goalId === g.id && t.completed);
    for (const lt of linkedCompletedTasks) {
      const dt = parseIsoOrDate(lt.date);
      if (dt) {
        const diff = getDaysDifference(dt, referenceDate);
        if (diff < daysInactive) {
          daysInactive = diff;
        }
      }
    }

    stalledCandidates.push({
      goal: g,
      daysInactive,
      progress: g.progress,
    });
  }

  if (stalledCandidates.length > 0) {
    stalledCandidates.sort((a, b) => {
      // 1. Most days inactive (descending)
      if (a.daysInactive !== b.daysInactive) {
        return b.daysInactive - a.daysInactive;
      }
      // 2. Lowest progress (ascending)
      if (a.progress !== b.progress) {
        return a.progress - b.progress;
      }
      // 3. Earlier createdAt (ascending)
      const cA = a.goal.createdAt || '';
      const cB = b.goal.createdAt || '';
      if (cA !== cB) {
        return cA.localeCompare(cB);
      }
      // 4. Lexical goal.id
      return (a.goal.id || '').localeCompare(b.goal.id || '');
    });

    const chosen = stalledCandidates[0];
    return {
      tier: 2,
      type: 'stalled_goal',
      selectedGoalId: chosen.goal.id,
      selectedGoalTitle: chosen.goal.title,
      currentProgress: chosen.progress,
      daysInactive: chosen.daysInactive,
    };
  }

  // ==========================================
  // TIER 3 — TODAY HIGH-PRIORITY TASK
  // Only when:
  // - no overdue task
  // - no qualifying stalled goal
  // Condition: incomplete high-priority task scheduled today
  // Selection:
  // 1. earlier createdAt
  // 2. lexical task.id
  // ==========================================
  const todayPendingTasks = tasks.filter((t) => {
    if (!t || t.completed || !t.date) return false;
    return normalizeTaskDate(t.date) === todayStr;
  });

  const todayHighPriorityTasks = todayPendingTasks.filter((t) => t.priority === 'high');

  if (todayHighPriorityTasks.length > 0) {
    todayHighPriorityTasks.sort((a, b) => {
      const cA = a.createdAt || '';
      const cB = b.createdAt || '';
      if (cA !== cB) return cA.localeCompare(cB); // Earlier wins
      return (a.id || '').localeCompare(b.id || '');
    });

    const chosenTask = todayHighPriorityTasks[0];
    return {
      tier: 3,
      type: 'urgent_today_task',
      selectedTaskId: chosenTask.id,
      selectedTaskTitle: chosenTask.title,
      taskPriority: 'high',
      taskDueDate: chosenTask.date,
    };
  }

  // ==========================================
  // TIER 4 — FOCUS DEFICIT
  // Only when:
  // - no overdue task
  // - no stalled goal
  // - no Tier 3 high-priority bottleneck
  // - multiple pending tasks today (>= 3)
  // - todayFocusMinutes is 0 or below low-focus threshold (<= 10 mins)
  // (NOTE: No arbitrary hour >= 13 rule)
  // ==========================================
  const pendingTasksTodayCount = todayPendingTasks.length;
  if (pendingTasksTodayCount >= 3 && computedTodayFocusMinutes <= 10) {
    return {
      tier: 4,
      type: 'focus_deficit',
      pendingTasksTodayCount,
      todayFocusMinutes: computedTodayFocusMinutes,
    };
  }

  // ==========================================
  // TIER 5 — ALL CLEAR
  // When none of the above conditions hold
  // ==========================================
  const activeGoalsCount = goals.filter((g) => g && typeof g.progress === 'number' && g.progress < 100).length;

  return {
    tier: 5,
    type: 'all_clear',
    pendingTasksTodayCount,
    activeGoalsCount,
    todayFocusMinutes: computedTodayFocusMinutes,
  };
}
