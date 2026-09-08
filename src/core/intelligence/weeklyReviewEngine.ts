import {
  Task,
  Note,
  Goal,
  FocusSession,
  Transaction,
  KnowledgeItem,
} from '../../types/data';
import { getStartOfWeek, getEndOfWeek, isWithinDays } from './dateUtils';

export interface WeeklyReview {
  weekStart: string;
  weekEnd: string;
  tasksCreated: number;
  tasksCompleted: number;
  taskCompletionRate: number; // 0 to 100
  notesCreated: number;
  goalsProgressed: number;
  focusSessions: number;
  focusMinutes: number;
  income: number;
  expenses: number;
  activityCount: number;
  summary: string;
  summaryAr: string;
}

export interface WeeklyReviewSourceData {
  tasks?: Task[];
  notes?: Note[];
  goals?: Goal[];
  sessions?: FocusSession[];
  transactions?: Transaction[];
  knowledgeItems?: KnowledgeItem[];
}

/**
 * Deterministic Weekly Review Engine
 * Computes weekly productivity retrospectives directly from local storage records.
 */
export function generateWeeklyReview(
  data: WeeklyReviewSourceData,
  now: Date = new Date()
): WeeklyReview {
  const startDate = getStartOfWeek(now);
  const endDate = getEndOfWeek(now);
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  const tasks = data.tasks || [];
  const notes = data.notes || [];
  const goals = data.goals || [];
  const sessions = data.sessions || [];
  const transactions = data.transactions || [];
  const knowledgeItems = data.knowledgeItems || [];

  // Filter items in the current week window (or within last 7 days)
  const isItemThisWeek = (dateStr?: string): boolean => {
    if (!dateStr) return false;
    const time = new Date(dateStr).getTime();
    if (isNaN(time)) return false;
    return (time >= startTime && time <= endTime) || isWithinDays(dateStr, 7, now);
  };

  // 1. Task metrics
  let tasksCreated = 0;
  let tasksCompleted = 0;

  for (const task of tasks) {
    if (isItemThisWeek(task.createdAt) || isItemThisWeek(task.date)) {
      tasksCreated++;
    }
    if (task.completed && (isItemThisWeek(task.createdAt) || isItemThisWeek(task.date))) {
      tasksCompleted++;
    }
  }

  const taskCompletionRate =
    tasksCreated > 0 ? Math.round((tasksCompleted / tasksCreated) * 100) : 0;

  // 2. Notes & Knowledge metrics
  let notesCreated = 0;
  for (const note of notes) {
    if (isItemThisWeek(note.createdAt)) {
      notesCreated++;
    }
  }
  for (const k of knowledgeItems) {
    if (isItemThisWeek(k.createdAt)) {
      notesCreated++;
    }
  }

  // 3. Goals progressed
  let goalsProgressed = 0;
  for (const goal of goals) {
    if (goal.progress > 0 && isItemThisWeek(goal.updatedAt || goal.createdAt)) {
      goalsProgressed++;
    }
  }

  // 4. Focus sessions
  let focusSessions = 0;
  let focusMinutes = 0;
  for (const s of sessions) {
    if (isItemThisWeek(s.completedAt)) {
      focusSessions++;
      focusMinutes += s.duration || 0;
    }
  }

  // 5. Money
  let income = 0;
  let expenses = 0;
  for (const tx of transactions) {
    if (isItemThisWeek(tx.createdAt)) {
      if (tx.type === 'income') {
        income += tx.amount || 0;
      } else {
        expenses += Math.abs(tx.amount || 0);
      }
    }
  }

  const activityCount =
    tasksCompleted +
    tasksCreated +
    notesCreated +
    focusSessions +
    transactions.filter((tx) => isItemThisWeek(tx.createdAt)).length;

  // Summary generation
  let summary = '';
  let summaryAr = '';

  if (activityCount === 0) {
    summary = 'No activity recorded yet for this week.';
    summaryAr = 'لم يتم تسجيل أي نشاط هذا الأسبوع بعد.';
  } else if (tasksCompleted > 0 && taskCompletionRate >= 75) {
    summary = `Strong week: you completed ${taskCompletionRate}% of your tasks with ${focusMinutes} focus minutes.`;
    summaryAr = `أسبوع مميز: أكملت ${taskCompletionRate}% من مهامك مع ${focusMinutes} دقيقة تركيز.`;
  } else if (tasksCreated >= 3 && focusSessions === 0) {
    summary = 'Your planning activity was high, but focus sessions were limited. Schedule focused work blocks.';
    summaryAr = 'نشاط التخطيط لديك كان مرتفعاً، لكن جلسات التركيز كانت محدودة. خصص أوقاتاً للعمل العميق.';
  } else if (focusMinutes >= 60) {
    summary = `Deep focus highlight: ${focusMinutes} minutes logged across ${focusSessions} session${focusSessions > 1 ? 's' : ''}.`;
    summaryAr = `إنجاز تركيز نوعي: تم تسجيل ${focusMinutes} دقيقة عبر ${focusSessions} جلسات عمل عميق.`;
  } else {
    summary = `Steady progress: ${tasksCompleted} tasks completed and ${goalsProgressed} goals actively updated.`;
    summaryAr = `تقدم متوازن: تم إنجاز ${tasksCompleted} مهام وتحديث ${goalsProgressed} أهداف نشطة.`;
  }

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return {
    weekStart: formatDate(startDate),
    weekEnd: formatDate(endDate),
    tasksCreated,
    tasksCompleted,
    taskCompletionRate,
    notesCreated,
    goalsProgressed,
    focusSessions,
    focusMinutes,
    income,
    expenses,
    activityCount,
    summary,
    summaryAr,
  };
}
