import {
  Task,
  Goal,
  Note,
  FocusSession,
  Transaction,
  Conversation,
  KnowledgeItem,
} from '../../../types/data';
import { ActiveFocusState } from '../../../modules/focus/domain/types';


export interface IAsyncRepository<T> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
  create(item: T): Promise<void>;
  update(id: string, changes: Partial<T>): Promise<void>;
  delete(id: string): Promise<void>;
  subscribe(onData: (items: T[]) => void): () => void;
}

export interface ITaskRepository extends IAsyncRepository<Task> {
  getAll(): Promise<Task[]>;
  saveAll(tasks: Task[]): Promise<void>;
}

export interface IGoalRepository extends IAsyncRepository<Goal> {
  getAll(): Promise<Goal[]>;
  saveAll(goals: Goal[]): Promise<void>;
}

export interface INoteRepository extends IAsyncRepository<Note> {
  getAll(): Promise<Note[]>;
  saveAll(notes: Note[]): Promise<void>;
}

export interface IFocusRepository extends IAsyncRepository<FocusSession> {
  getSessions(): Promise<FocusSession[]>;
  saveSessions(sessions: FocusSession[]): Promise<void>;
  getActiveState(): Promise<ActiveFocusState | null>;
  saveActiveState(state: ActiveFocusState): Promise<void>;
  removeActiveState(): Promise<void>;
}

export interface IMoneyRepository extends IAsyncRepository<Transaction> {
  getAll(): Promise<Transaction[]>;
  saveAll(transactions: Transaction[]): Promise<void>;
}

export interface IChatRepository extends IAsyncRepository<Conversation> {
  getConversations(): Promise<Conversation[]>;
  saveConversations(conversations: Conversation[]): Promise<void>;
  getActiveChatId(): Promise<string | null>;
  saveActiveChatId(id: string): Promise<void>;
}

export interface IKnowledgeRepository extends IAsyncRepository<KnowledgeItem> {
  getAll(): Promise<KnowledgeItem[]>;
  saveAll(items: KnowledgeItem[]): Promise<void>;
}
