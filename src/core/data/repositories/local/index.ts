import {
  ITaskRepository,
  IGoalRepository,
  INoteRepository,
  IFocusRepository,
  IMoneyRepository,
  IChatRepository,
  IKnowledgeRepository,
} from '../../interfaces';

import {
  Task,
  Goal,
  Note,
  FocusSession,
  Transaction,
  Conversation,
  KnowledgeItem,
} from '../../../../types/data';

import { ActiveFocusState } from '../../../../modules/focus/domain/types';
import { storageService, INITIAL_SEEDS } from '../../../storage/storageService';
import { STORAGE_KEYS } from '../../../storage/storageKeys';
import { LocalAsyncRepository } from './LocalAsyncRepository';
import { AuthLifecycle } from '../../../auth/authLifecycle';

function getScopedKey(key: string): string | null {
  const uid = AuthLifecycle.getUid();
  if (!uid) return null;
  return `novo:${uid}:${key}`;
}

export class LocalTaskRepository extends LocalAsyncRepository<Task> implements ITaskRepository {
  constructor() {
    super(STORAGE_KEYS.TASKS, INITIAL_SEEDS.tasks);
  }
}

export class LocalGoalRepository extends LocalAsyncRepository<Goal> implements IGoalRepository {
  constructor() {
    super(STORAGE_KEYS.GOALS, INITIAL_SEEDS.goals);
  }
}

export class LocalNoteRepository extends LocalAsyncRepository<Note> implements INoteRepository {
  constructor() {
    super(STORAGE_KEYS.NOTES, INITIAL_SEEDS.notes);
  }
}

export class LocalFocusRepository extends LocalAsyncRepository<FocusSession> implements IFocusRepository {
  constructor() {
    super(STORAGE_KEYS.FOCUS_SESSIONS, INITIAL_SEEDS.focusSessions);
  }

  async getSessions(): Promise<FocusSession[]> { return this.getAll(); }

  async saveSessions(sessions: FocusSession[]): Promise<void> { this.saveAll(sessions); }

  async getActiveState(): Promise<ActiveFocusState | null> {
    const key = getScopedKey('novo_active_focus');
    if (!key) return null;
    return storageService.getItem<ActiveFocusState | null>(key, null);
  }

  async saveActiveState(state: ActiveFocusState): Promise<void> {
    const key = getScopedKey('novo_active_focus');
    if (!key) return;
    storageService.setItem(key, state);
  }

  async removeActiveState(): Promise<void> {
    const key = getScopedKey('novo_active_focus');
    if (!key) return;
    storageService.removeItem(key);
  }
}

export class LocalMoneyRepository extends LocalAsyncRepository<Transaction> implements IMoneyRepository {
  constructor() {
    super(STORAGE_KEYS.MONEY_ENTRIES, INITIAL_SEEDS.transactions);
  }
}

export class LocalChatRepository extends LocalAsyncRepository<Conversation> implements IChatRepository {
  constructor() {
    super(STORAGE_KEYS.CONVERSATIONS, INITIAL_SEEDS.conversations);
  }

  async getConversations(): Promise<Conversation[]> { return this.getAll(); }

  async saveConversations(conversations: Conversation[]): Promise<void> { this.saveAll(conversations); }

  async getActiveChatId(): Promise<string | null> {
    const key = getScopedKey(STORAGE_KEYS.ACTIVE_CHAT_ID);
    if (!key) return null;
    return storageService.getItem<string | null>(key, null);
  }

  async saveActiveChatId(id: string): Promise<void> {
    const key = getScopedKey(STORAGE_KEYS.ACTIVE_CHAT_ID);
    if (!key) return;
    storageService.setItem(key, id);
  }
}

export class LocalKnowledgeRepository extends LocalAsyncRepository<KnowledgeItem> implements IKnowledgeRepository {
  constructor() {
    super(STORAGE_KEYS.KNOWLEDGE, INITIAL_SEEDS.knowledge);
  }
}
