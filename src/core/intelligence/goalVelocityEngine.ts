import { Goal, Task, FocusSession } from '../../types/data';

export type GoalActivityState =
  | 'No Execution Data'
  | 'Dormant / Stalled'
  | 'Pacing Deficit'
  | 'Active'
  | 'Steady';

export interface GoalPacingAnalysis {
  goalId: string;
  goalTitle: string;
  currentProgress: number; // 0 to 100
  ageDays: number;
  lifetimePace: number; // percentage points per day: currentProgress / max(ageDays, 1), rounded to 2 decimals
  linkedTaskCount: number;
  completedLinkedTaskCount: number;
  executionCompletionRatio: number | 'no_data'; // percentage: completed / total, rounded to 1 decimal, or 'no_data'
  overdueLinkedTaskCount: number;
  todayLinkedTaskCount: number;
  upcomingLinkedTaskCount: number;
  focusMinutes: number; // total duration of linked focus sessions
  activityState: GoalActivityState;
}

/**
 * Normalizes ISO date string or Date object to YYYY-MM-DD
 */
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Pure parsing of calendar date from an ISO or date string, or null if invalid.
 */
function parseDateOrIso(dateStr?: string | null): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Calculates calendar days between two dates.
 * Calendar day difference ignores intra-day clock time.
 */
function getCalendarDaysElapsed(startDate: Date, endDate: Date): number {
  const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
  const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime();
  const diffMs = endDay - startDay;
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

/**
 * Pure deterministic Goal Velocity & Structural Pacing Engine.
 *
 * Evaluates active goals against linked tasks and focus sessions based exclusively
 * on genuinely persisted fields. Zero historical interpolation or time-series assumptions.
 */
export function calculateGoalPacing(
  goal: Goal,
  tasks: Task[],
  focusSessions: FocusSession[],
  now: Date
): GoalPacingAnalysis {
  const currentProgress = typeof goal.progress === 'number' ? Math.min(100, Math.max(0, goal.progress)) : 0;
  const nowCalendar = new Date(now.getTime());
  const todayStr = toDateString(nowCalendar);
  const sevenDaysAgoTime = nowCalendar.getTime() - 7 * 24 * 60 * 60 * 1000;

  // 1. Goal Lifetime Age
  const createdDate = parseDateOrIso(goal.createdAt) || nowCalendar;
  const ageDays = getCalendarDaysElapsed(createdDate, nowCalendar);

  // 2. Lifetime Progress Pace (expressed in percentage points per day)
  const divisor = Math.max(ageDays, 1);
  const lifetimePace = Math.round((currentProgress / divisor) * 100) / 100;

  // 3. Linked Tasks Extraction
  const linkedTasks = tasks.filter((t) => t && t.goalId === goal.id);
  const linkedTaskCount = linkedTasks.length;
  const completedLinkedTaskCount = linkedTasks.filter((t) => Boolean(t.completed)).length;

  // Execution Completion Ratio
  const executionCompletionRatio: number | 'no_data' =
    linkedTaskCount > 0
      ? Math.round((completedLinkedTaskCount / linkedTaskCount) * 1000) / 10
      : 'no_data';

  // 4. Scheduled Task Distribution
  let overdueLinkedTaskCount = 0;
  let todayLinkedTaskCount = 0;
  let upcomingLinkedTaskCount = 0;

  for (const t of linkedTasks) {
    if (!t.completed && t.date) {
      if (t.date < todayStr) {
        overdueLinkedTaskCount++;
      } else if (t.date === todayStr) {
        todayLinkedTaskCount++;
      } else {
        upcomingLinkedTaskCount++;
      }
    }
  }

  // 5. Focus Investment
  const linkedSessions = focusSessions.filter((s) => s && s.goalId === goal.id);
  const focusMinutes = linkedSessions.reduce((acc, s) => {
    const dur = typeof s.duration === 'number' && s.duration > 0 ? s.duration : 0;
    return acc + dur;
  }, 0);

  // 6. Activity State Classification
  // Check recency of goal update
  const updatedDate = parseDateOrIso(goal.updatedAt) || createdDate;
  const daysSinceGoalUpdate = getCalendarDaysElapsed(updatedDate, nowCalendar);

  // Check recent completed task activity within last 7 days (exact parity with Gate 17.4 definition)
  const hasRecentlyCompletedTask = linkedTasks.some((t) => {
    if (!t.completed || !t.date) return false;
    const tDate = parseDateOrIso(t.date);
    if (!tDate) return false;
    return tDate.getTime() >= sevenDaysAgoTime;
  });

  const isDormantOrStalled = daysSinceGoalUpdate > 7 && !hasRecentlyCompletedTask;

  let activityState: GoalActivityState;

  if (linkedTaskCount === 0) {
    if (isDormantOrStalled) {
      activityState = 'Dormant / Stalled';
    } else {
      activityState = 'No Execution Data';
    }
  } else if (isDormantOrStalled) {
    activityState = 'Dormant / Stalled';
  } else if (overdueLinkedTaskCount > 0) {
    activityState = 'Pacing Deficit';
  } else if (todayLinkedTaskCount > 0 || daysSinceGoalUpdate <= 3) {
    activityState = 'Active';
  } else {
    activityState = 'Steady';
  }

  return {
    goalId: goal.id,
    goalTitle: goal.title,
    currentProgress,
    ageDays,
    lifetimePace,
    linkedTaskCount,
    completedLinkedTaskCount,
    executionCompletionRatio,
    overdueLinkedTaskCount,
    todayLinkedTaskCount,
    upcomingLinkedTaskCount,
    focusMinutes,
    activityState,
  };
}

/**
 * Pure function to analyze all provided goals.
 * Deterministically sorts results by goal.id lexical order to ensure order invariance.
 */
export function analyzeAllGoalsPacing(
  goals: Goal[],
  tasks: Task[],
  focusSessions: FocusSession[],
  now: Date = new Date()
): GoalPacingAnalysis[] {
  const safeGoals = Array.isArray(goals) ? goals : [];
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safeFocus = Array.isArray(focusSessions) ? focusSessions : [];

  const analyses = safeGoals
    .filter((g) => g && typeof g.id === 'string' && g.id.trim() !== '')
    .map((g) => calculateGoalPacing(g, safeTasks, safeFocus, now));

  // Deterministic sort by goalId
  return analyses.sort((a, b) => a.goalId.localeCompare(b.goalId));
}
