import {
  Note,
  Goal,
  Task,
  FocusSession,
  Transaction,
  Conversation,
  KnowledgeItem,
} from '../../types/data';
import { isDateToday, getStartOfWeek } from './dateUtils';

export type ActivityModule =
  | 'notes'
  | 'goals'
  | 'planner'
  | 'focus'
  | 'money'
  | 'chat'
  | 'knowledge';

export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  titleAr?: string;
  description: string;
  descriptionAr?: string;
  createdAt: string; // ISO 8601
  timestamp?: string; // ISO 8601
  module: ActivityModule;
}

// Backward-compatibility alias for Phase 2A components
export type ActivityEvent = ActivityItem;

export interface ActivitySourceData {
  notes?: Note[];
  goals?: Goal[];
  tasks?: Task[];
  sessions?: FocusSession[];
  transactions?: Transaction[];
  conversations?: Conversation[];
  knowledgeItems?: KnowledgeItem[];
}

/**
 * Deterministic Activity Timeline Engine
 * Generates normalized cross-module timeline events directly from existing storage records.
 * Avoids duplicate database storage and keeps activity feeds completely synchronized.
 */
export function generateActivityTimeline(
  data: ActivitySourceData,
  limit: number = 30,
  fallbackTime?: string | Date
): ActivityItem[] {
  const fallbackIso =
    fallbackTime instanceof Date
      ? fallbackTime.toISOString()
      : typeof fallbackTime === 'string' && fallbackTime.trim() !== ''
      ? fallbackTime
      : '1970-01-01T00:00:00.000Z';

  const events: ActivityItem[] = [];

  // 1. Task events (Completed & pending tasks)
  if (data.tasks) {
    for (const task of data.tasks) {
      if (task.completed) {
        events.push({
          id: `act-task-done-${task.id}`,
          type: 'completed_task',
          module: 'planner',
          title: 'Task Completed',
          titleAr: 'إنجاز مهمة',
          description: task.title,
          descriptionAr: task.title,
          createdAt: task.createdAt || fallbackIso,
        });
      } else {
        events.push({
          id: `act-task-create-${task.id}`,
          type: 'created_task',
          module: 'planner',
          title: 'Task Planned',
          titleAr: 'تخطيط مهمة',
          description: task.title,
          descriptionAr: task.title,
          createdAt: task.createdAt || fallbackIso,
        });
      }
    }
  }

  // 2. Goal events
  if (data.goals) {
    for (const goal of data.goals) {
      events.push({
        id: `act-goal-${goal.id}`,
        type: goal.progress >= 100 ? 'goal_achieved' : 'goal_updated',
        module: 'goals',
        title: goal.progress >= 100 ? 'Goal Achieved' : 'Goal Progress Updated',
        titleAr: goal.progress >= 100 ? 'تحقيق هدف' : 'تحديث مسار الهدف',
        description: `${goal.title} (${goal.progress}%)`,
        descriptionAr: `${goal.title} (${goal.progress}%)`,
        createdAt: goal.updatedAt || goal.createdAt || fallbackIso,
      });
    }
  }

  // 3. Focus sessions
  if (data.sessions) {
    for (const session of data.sessions) {
      events.push({
        id: `act-focus-${session.id}`,
        type: 'focus_completed',
        module: 'focus',
        title: 'Focus Session Completed',
        titleAr: 'جلسة تركيز منجزة',
        description: `${session.duration} minutes of deep focus`,
        descriptionAr: `${session.duration} دقيقة من التركيز العميق`,
        createdAt: session.completedAt || fallbackIso,
      });
    }
  }

  // 4. Notes
  if (data.notes) {
    for (const note of data.notes) {
      const isUpdated = note.updatedAt && note.updatedAt !== note.createdAt;
      events.push({
        id: `act-note-${note.id}`,
        type: isUpdated ? 'note_updated' : 'note_created',
        module: 'notes',
        title: isUpdated ? 'Note Updated' : 'Note Created',
        titleAr: isUpdated ? 'تحديث ملاحظة' : 'تدوين ملاحظة جديدة',
        description: note.title,
        descriptionAr: note.title,
        createdAt: note.updatedAt || note.createdAt || fallbackIso,
      });
    }
  }

  // 5. Money Transactions
  if (data.transactions) {
    for (const tx of data.transactions) {
      const isIncome = tx.type === 'income';
      events.push({
        id: `act-tx-${tx.id}`,
        type: isIncome ? 'income_added' : 'expense_logged',
        module: 'money',
        title: isIncome ? 'Income Recorded' : 'Expense Logged',
        titleAr: isIncome ? 'تسجيل إيراد مالي' : 'تسجيل مصروف',
        description: `${tx.description || tx.category}: $${Math.abs(tx.amount)}`,
        descriptionAr: `${tx.description || tx.category}: $${Math.abs(tx.amount)}`,
        createdAt: tx.createdAt || fallbackIso,
      });
    }
  }

  // 6. Knowledge items
  if (data.knowledgeItems) {
    for (const item of data.knowledgeItems) {
      events.push({
        id: `act-know-${item.id}`,
        type: item.pinned ? 'knowledge_pinned' : 'knowledge_added',
        module: 'knowledge',
        title: item.pinned ? 'Strategic Memory Pinned' : 'Knowledge Added',
        titleAr: item.pinned ? 'تثبيت معرفة استراتيجية' : 'إضافة معرفة للذاكرة',
        description: item.title,
        descriptionAr: item.title,
        createdAt: item.updatedAt || item.createdAt || fallbackIso,
      });
    }
  }

  // 7. Chat Conversations
  if (data.conversations) {
    for (const conv of data.conversations) {
      if (conv.messages && conv.messages.length > 0) {
        events.push({
          id: `act-chat-${conv.id}`,
          type: 'chat_session',
          module: 'chat',
          title: 'NOVO Dialogue Session',
          titleAr: 'جلسة حوار مع NOVO',
          description: conv.title || 'Conversation',
          descriptionAr: conv.title || 'محادثة',
          createdAt: conv.updatedAt || conv.createdAt || fallbackIso,
        });
      }
    }
  }

  // Ensure both createdAt and timestamp exist on each item
  const normalizedEvents = events.map((e) => ({
    ...e,
    timestamp: e.timestamp || e.createdAt,
  }));

  // Sort descending by timestamp (newest first), tie-breaking by id
  const sorted = normalizedEvents.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime() || 0;
    const timeB = new Date(b.createdAt).getTime() || 0;
    if (timeB !== timeA) return timeB - timeA;
    return a.id.localeCompare(b.id);
  });

  return sorted.slice(0, limit);
}

/**
 * Returns recent activity items up to the specified limit (default 15).
 */
export function getRecentActivity(
  data: ActivitySourceData,
  limit: number = 15,
  fallbackTime?: string | Date
): ActivityItem[] {
  return generateActivityTimeline(data, limit, fallbackTime);
}

/**
 * Returns activity items created today. Accepts either raw source data or precomputed timeline.
 */
export function getTodayActivity(
  data: ActivitySourceData | ActivityItem[],
  now: Date = new Date()
): ActivityItem[] {
  const all = Array.isArray(data) ? data : generateActivityTimeline(data, 100);
  return all.filter((item) => isDateToday(item.createdAt, now));
}

/**
 * Returns activity items created in the current week. Accepts either raw source data or precomputed timeline.
 */
export function getWeekActivity(
  data: ActivitySourceData | ActivityItem[],
  now: Date = new Date()
): ActivityItem[] {
  const all = Array.isArray(data) ? data : generateActivityTimeline(data, 200);
  const weekStart = getStartOfWeek(now).getTime();
  const nowTime = now.getTime();

  return all.filter((item) => {
    const itemTime = new Date(item.createdAt).getTime() || 0;
    return itemTime >= weekStart && itemTime <= nowTime;
  });
}
