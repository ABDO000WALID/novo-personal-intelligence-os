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
import { INITIAL_SEEDS } from '../../../storage/storageService';
import { FirebaseAsyncRepository } from './FirebaseAsyncRepository';
import { AuthLifecycle } from '../../../auth/authLifecycle';
import { app } from '../../../auth/firebase';
import { fs } from './firestoreProvider';

export class FirebaseTaskRepository extends FirebaseAsyncRepository<Task> implements ITaskRepository {
  constructor() {
    super('tasks', INITIAL_SEEDS.tasks);
  }
}

export class FirebaseGoalRepository extends FirebaseAsyncRepository<Goal> implements IGoalRepository {
  constructor() {
    super('goals', INITIAL_SEEDS.goals);
  }
}

export class FirebaseNoteRepository extends FirebaseAsyncRepository<Note> implements INoteRepository {
  constructor() {
    super('notes', INITIAL_SEEDS.notes);
  }
}

export class FirebaseFocusRepository extends FirebaseAsyncRepository<FocusSession> implements IFocusRepository {
  constructor() {
    super('focus_sessions', INITIAL_SEEDS.focusSessions);
  }

  async getSessions(): Promise<FocusSession[]> { return this.getAll(); }
  async saveSessions(sessions: FocusSession[]): Promise<void> { return this.saveAll(sessions); }

  private getActiveStateDocRef() {
    const uid = AuthLifecycle.getUid();
    if (!uid) return null;
    if (!app) return null;
    return fs.doc(fs.getFirestore(app), `users/${uid}/active_state/focus`);
  }

  async getActiveState(): Promise<ActiveFocusState | null> {
    const uid = AuthLifecycle.getUid();
    if (!uid) return null;
    const guard = AuthLifecycle.createGuard();
    const docRef = this.getActiveStateDocRef();
    if (!docRef) return null;
    
    const snapshot = await fs.getDoc(docRef);
    if (guard.isStale()) throw new Error('Auth changed during getActiveState');
    
    return snapshot.exists() ? (snapshot.data() as ActiveFocusState) : null;
  }

  async saveActiveState(state: ActiveFocusState): Promise<void> {
    const uid = AuthLifecycle.getUid();
    if (!uid) return;
    const guard = AuthLifecycle.createGuard();
    const docRef = this.getActiveStateDocRef();
    if (!docRef) return;
    
    if (guard.isStale()) throw new Error('Auth changed before saveActiveState');
    await fs.setDoc(docRef, state);
  }

  async removeActiveState(): Promise<void> {
    const uid = AuthLifecycle.getUid();
    if (!uid) return;
    const guard = AuthLifecycle.createGuard();
    const docRef = this.getActiveStateDocRef();
    if (!docRef) return;
    
    const snapshot = await fs.getDoc(docRef);
    if (!snapshot.exists()) return;

    if (guard.isStale()) throw new Error('Auth changed before removeActiveState');
    await fs.deleteDoc(docRef);
  }
}

export class FirebaseMoneyRepository extends FirebaseAsyncRepository<Transaction> implements IMoneyRepository {
  constructor() {
    super('money', INITIAL_SEEDS.transactions);
  }
}

export class FirebaseChatRepository extends FirebaseAsyncRepository<Conversation> implements IChatRepository {
  constructor() {
    super('conversations', INITIAL_SEEDS.conversations);
  }

  async getConversations(): Promise<Conversation[]> { return this.getAll(); }
  async saveConversations(conversations: Conversation[]): Promise<void> { return this.saveAll(conversations); }

  private getActiveChatDocRef() {
    const uid = AuthLifecycle.getUid();
    if (!uid) return null;
    if (!app) return null;
    return fs.doc(fs.getFirestore(app), `users/${uid}/active_state/chat`);
  }

  async getActiveChatId(): Promise<string | null> {
    const uid = AuthLifecycle.getUid();
    if (!uid) return null;
    const guard = AuthLifecycle.createGuard();
    const docRef = this.getActiveChatDocRef();
    if (!docRef) return null;

    const snapshot = await fs.getDoc(docRef);
    if (guard.isStale()) throw new Error('Auth changed during getActiveChatId');

    return snapshot.exists() ? (snapshot.data() as { activeChatId: string }).activeChatId : null;
  }

  async saveActiveChatId(id: string): Promise<void> {
    const uid = AuthLifecycle.getUid();
    if (!uid) return;
    const guard = AuthLifecycle.createGuard();
    const docRef = this.getActiveChatDocRef();
    if (!docRef) return;

    if (guard.isStale()) throw new Error('Auth changed before saveActiveChatId');
    await fs.setDoc(docRef, { activeChatId: id });
  }
}

export class FirebaseKnowledgeRepository extends FirebaseAsyncRepository<KnowledgeItem> implements IKnowledgeRepository {
  constructor() {
    super('knowledge', INITIAL_SEEDS.knowledge);
  }
}
