import {
  Goal,
  Task,
  Note,
  FocusSession,
  KnowledgeItem,
} from '../../types/data';

export interface GoalRelationshipSummary {
  goalId: string;
  tasks: Task[];
  completedTasks: Task[];
  pendingTasks: Task[];
  notes: Note[];
  sessions: FocusSession[];
  totalFocusMinutes: number;
  knowledgeItems: KnowledgeItem[];
}

/**
 * Deterministic Relationship Engine
 * Resolves relational links between core entities (Goals -> Tasks, Notes, Focus, Knowledge)
 * without imposing rigid relational database overhead.
 */
export function getTasksForGoal(tasks: Task[], goalId: string): Task[] {
  if (!goalId || !tasks) return [];
  return tasks.filter((t) => t.goalId === goalId);
}

export function getNotesForGoal(notes: Note[], goalId: string): Note[] {
  if (!goalId || !notes) return [];
  return notes.filter((n) => n.goalId === goalId);
}

export function getSessionsForGoal(sessions: FocusSession[], goalId: string): FocusSession[] {
  if (!goalId || !sessions) return [];
  return sessions.filter((s) => s.goalId === goalId);
}

export function getSessionsForTask(sessions: FocusSession[], taskId: string): FocusSession[] {
  if (!taskId || !sessions) return [];
  return sessions.filter((s) => s.taskId === taskId);
}

export function getKnowledgeForGoal(items: KnowledgeItem[], goalId: string): KnowledgeItem[] {
  if (!goalId || !items) return [];
  return items.filter((k) => k.goalId === goalId);
}

export function getGoalRelationshipSummary(
  goal: Goal,
  data: {
    tasks: Task[];
    notes: Note[];
    sessions: FocusSession[];
    knowledgeItems?: KnowledgeItem[];
  }
): GoalRelationshipSummary {
  const goalTasks = getTasksForGoal(data.tasks, goal.id);
  const completedTasks = goalTasks.filter((t) => t.completed);
  const pendingTasks = goalTasks.filter((t) => !t.completed);
  const goalNotes = getNotesForGoal(data.notes, goal.id);
  const goalSessions = getSessionsForGoal(data.sessions, goal.id);
  const totalFocusMinutes = goalSessions.reduce((acc, s) => acc + (s.duration || 0), 0);
  const knowledge = getKnowledgeForGoal(data.knowledgeItems || [], goal.id);

  return {
    goalId: goal.id,
    tasks: goalTasks,
    completedTasks,
    pendingTasks,
    notes: goalNotes,
    sessions: goalSessions,
    totalFocusMinutes,
    knowledgeItems: knowledge,
  };
}
