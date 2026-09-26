import { AuthLifecycle } from '../../auth/authLifecycle';
import { fs } from '../repositories/firebase/firestoreProvider';
import { app } from '../../auth/firebase';
import {
  LocalTaskRepository,
  LocalGoalRepository,
  LocalNoteRepository,
  LocalFocusRepository,
  LocalMoneyRepository,
  LocalChatRepository,
  LocalKnowledgeRepository
} from '../repositories/local';

export type MigrationStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface MigrationMarker {
  status: MigrationStatus;
  version: number;
  startedAt: string;
  completedAt?: string;
  failedAt?: string;
  errorCode?: string;
}

export class MigrationService {
  private static MAX_DOC_SIZE = 900_000; // Conservative 900KB limit for Chat documents

  static async getMigrationStatus(): Promise<MigrationMarker | null> {
    const uid = AuthLifecycle.getUid();
    if (!uid) return null;
    if (!app) return null;

    const db = fs.getFirestore(app);
    const docRef = fs.doc(db, `users/${uid}/metadata/migration`);
    const guard = AuthLifecycle.createGuard();
    
    const snap = await fs.getDoc(docRef);
    if (guard.isStale()) {
      throw new Error('Migration operation aborted: Identity changed during getMigrationStatus.');
    }
    
    if (!snap.exists()) return null;
    return snap.data() as MigrationMarker;
  }

  static async migrateCurrentUserToFirestore(): Promise<void> {
    const uid = AuthLifecycle.getUid();
    if (!uid) {
      throw new Error('Migration failed: No authenticated user.');
    }
    
    if (!app) {
      throw new Error('Migration failed: Firebase app not initialized.');
    }

    const guard = AuthLifecycle.createGuard();
    const db = fs.getFirestore(app);

    // Concurrency lock using Web Locks API if available
    if (typeof navigator !== 'undefined' && navigator.locks) {
      await navigator.locks.request(`novo_migration_${uid}`, async () => {
        await this._performMigration(uid, guard, db);
      });
    } else {
      // Fallback if locks API not available (e.g. testing environment)
      await this._performMigration(uid, guard, db);
    }
  }

  private static async _performMigration(uid: string, guard: ReturnType<typeof AuthLifecycle.createGuard>, db: any): Promise<void> {
    const markerRef = fs.doc(db, `users/${uid}/metadata/migration`);

    // We do NOT block on remote COMPLETED!
    // As required: "If the remote migration marker is already: COMPLETED... DO NOT simply discard... deterministic merge/upsert"
    
    if (guard.isStale()) throw new Error('Migration aborted: Identity changed before writing IN_PROGRESS.');
    
    await fs.setDoc(markerRef, {
      status: 'IN_PROGRESS',
      version: 1,
      startedAt: new Date().toISOString()
    }, { merge: true });

    try {
      // 1. Read Local Data
      const tasks = await new LocalTaskRepository().getAll();
      const goals = await new LocalGoalRepository().getAll();
      const notes = await new LocalNoteRepository().getAll();
      const knowledge = await new LocalKnowledgeRepository().getAll();
      const money = await new LocalMoneyRepository().getAll();
      
      const focusRepo = new LocalFocusRepository();
      const focusSessions = await focusRepo.getAll();
      const activeFocus = await focusRepo.getActiveState();
      
      const chatRepo = new LocalChatRepository();
      const chats = await chatRepo.getAll();
      const activeChatId = await chatRepo.getActiveChatId();

      // Validate Chat sizes
      const encoder = new TextEncoder();
      for (const chat of chats) {
        if (encoder.encode(JSON.stringify(chat)).byteLength > this.MAX_DOC_SIZE) {
          throw new Error(`Migration failed: Conversation ${chat.id} exceeds supported Firestore document size limit.`);
        }
      }

      if (guard.isStale()) throw new Error('Migration aborted: Identity changed during local read.');

      // 2. Upsert Data (Batching)
      const batchWrites = async (collectionName: string, items: { id: string }[]) => {
        const CHUNK_SIZE = 450;
        for (let i = 0; i < items.length; i += CHUNK_SIZE) {
          const chunk = items.slice(i, i + CHUNK_SIZE);
          const batch = fs.writeBatch(db);
          for (const item of chunk) {
            const docRef = fs.doc(db, `users/${uid}/${collectionName}/${item.id}`);
            batch.set(docRef, item, { merge: true });
          }
          if (guard.isStale()) throw new Error(`Migration aborted: Identity changed during ${collectionName} upsert.`);
          await batch.commit();
        }
      };

      await batchWrites('tasks', tasks);
      await batchWrites('goals', goals);
      await batchWrites('notes', notes);
      await batchWrites('knowledge', knowledge);
      await batchWrites('money', money);
      await batchWrites('focus_sessions', focusSessions);
      await batchWrites('conversations', chats);

      // Active States
      if (activeFocus || activeChatId) {
        const batch = fs.writeBatch(db);
        if (activeFocus) {
          const focusRef = fs.doc(db, `users/${uid}/active_state/focus`);
          batch.set(focusRef, activeFocus, { merge: true });
        }
        if (activeChatId) {
          const chatRef = fs.doc(db, `users/${uid}/active_state/chat`);
          batch.set(chatRef, { activeChatId }, { merge: true });
        }
        if (guard.isStale()) throw new Error('Migration aborted: Identity changed during active state upsert.');
        await batch.commit();
      }

      // 3. Mark Completed
      if (guard.isStale()) throw new Error('Migration aborted: Identity changed before writing COMPLETED.');
      
      await fs.setDoc(markerRef, {
        status: 'COMPLETED',
        version: 1,
        completedAt: new Date().toISOString()
      }, { merge: true });

    } catch (error: any) {
      if (guard.isStale()) {
        throw new Error('Migration aborted: Identity changed during error handling.');
      }
      
      try {
        await fs.setDoc(markerRef, {
          status: 'FAILED',
          version: 1,
          failedAt: new Date().toISOString(),
          errorCode: error.message
        }, { merge: true });
      } catch (markerError) {
        console.error('Failed to write FAILED marker:', markerError);
      }
      
      throw error;
    }
  }
}
