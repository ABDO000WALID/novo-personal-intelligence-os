export interface Note {
  id: string;
  title: string;
  content: string;
  goalId?: string; // Optional relationship to a Goal
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  progress: number; // 0 to 100
  createdAt: string;
  updatedAt: string;
}

export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
  priority: TaskPriority;
  goalId?: string; // Optional relationship to a Goal
  noteId?: string; // Optional relationship to a Note
  createdAt: string;
}

export interface FocusSession {
  id: string;
  duration: number; // duration in minutes (legacy/preset)
  taskId?: string; // Optional relationship to a Task
  goalId?: string; // Optional relationship to a Goal
  completedAt: string;
  // New fields for Phase 8 Analytics
  mode?: 'preset' | 'custom' | 'stopwatch';
  actualDurationSeconds?: number;
  startedAt?: string;
  pausedDurationSeconds?: number;
}

export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  replyToMessageId?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export type KnowledgeCategory =
  | 'study'
  | 'programming'
  | 'project'
  | 'idea'
  | 'personal'
  | 'finance'
  | 'general';

export type KnowledgeImportance = 'low' | 'medium' | 'high';

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  tags: string[];
  importance: KnowledgeImportance;
  pinned: boolean;
  source?: 'manual' | 'note';
  goalId?: string; // Optional relationship to a Goal
  noteId?: string; // Optional relationship to a Note
  createdAt: string;
  updatedAt: string;
}
