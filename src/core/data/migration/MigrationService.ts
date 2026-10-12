/**
 * Novo Gate 19.3B - Core Migration Engine
 *
 * Implements safe, conditional, idempotent migration of local workspace
 * data to user-scoped Firestore documents under strict fencing ownership tokens.
 */

import { AuthLifecycle } from '../../auth/authLifecycle';
import { fs } from '../repositories/firebase/firestoreProvider';
import { app } from '../../auth/firebase';
import { RepositoryFactory } from '../RepositoryFactory';
import {
  LocalTaskRepository,
  LocalGoalRepository,
  LocalNoteRepository,
  LocalFocusRepository,
  LocalMoneyRepository,
  LocalChatRepository,
  LocalKnowledgeRepository
} from '../repositories/local';

import type {
  MigrationStatus,
  MigrationMarker,
  MigrationOwnership,
  MigrationErrorCode
} from './types';
import { MIGRATION_PATHS } from './types';
import { areCanonicallyEqual, diffCanonical } from './canonical';
import {
  planMigrationBatches,
  getBatchItemDocPath,
  BatchItemInput,
  BatchChunk
} from './batchPlanner';

export type { MigrationStatus, MigrationMarker };

/**
 * Options to configure migration behavior or injected testing overrides.
 */
export interface MigrationOptions {
  sessionId?: string;
  heartbeatIntervalMs?: number;
  lockTimeoutMs?: number;
  batchChunkOptions?: {
    maxOpsPerBatch?: number;
    maxBytesPerBatch?: number;
    maxSingleItemBytes?: number;
  };
}

/**
 * Error class thrown when a pre-existing cloud document conflicts with local data.
 */
export class PreexistingCloudDataConflictError extends Error {
  readonly path: string;
  readonly reason: string;
  constructor(path: string, reason: string) {
    super(`Migration conflict at "${path}": Cloud document already exists with conflicting data (${reason}).`);
    this.name = 'PreexistingCloudDataConflictError';
    this.path = path;
    this.reason = reason;
  }
}

/**
 * Error class thrown when migration ownership or fencing token is lost.
 */
export class MigrationFencingError extends Error {
  readonly expectedGeneration?: number;
  readonly actualGeneration?: number;
  constructor(message: string, expectedGeneration?: number, actualGeneration?: number) {
    super(message);
    this.name = 'MigrationFencingError';
    this.expectedGeneration = expectedGeneration;
    this.actualGeneration = actualGeneration;
  }
}

export class MigrationService {
  private static MAX_DOC_SIZE = 900_000; // 900KB max doc size
  private static DEFAULT_LOCK_TIMEOUT_MS = 60_000; // 60s stale lock expiry
  private static DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000; // 15s heartbeat

  // Ephemeral in-memory tab session ID
  private static _tabSessionId: string = (() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  })();

  static getTabSessionId(): string {
    return this._tabSessionId;
  }

  /**
   * Retrieves the current remote migration status marker, if any.
   */
  static async getMigrationStatus(): Promise<MigrationMarker | null> {
    const uid = AuthLifecycle.getUid();
    if (!uid) return null;
    if (!app) return null;

    const db = fs.getFirestore(app);
    const docRef = fs.doc(db, MIGRATION_PATHS.marker(uid));
    const guard = AuthLifecycle.createGuard();

    const snap = await fs.getDoc(docRef);
    if (guard.isStale()) {
      throw new Error('Migration operation aborted: Identity changed during getMigrationStatus.');
    }

    if (!snap.exists()) return null;
    return snap.data() as MigrationMarker;
  }

  /**
   * Public entrypoint: Migrates the current authenticated permanent user's
   * local workspace to Firestore using conditional transactions and deterministic verification.
   */
  static async migrateCurrentUserToFirestore(options?: MigrationOptions): Promise<void> {
    const uid = AuthLifecycle.getUid();
    if (!uid) {
      throw new Error('Migration failed: No authenticated user.');
    }

    if (!app) {
      throw new Error('Migration failed: Firebase app not initialized.');
    }

    // Repository mode check: Migration MUST run only in local mode before cutover
    if (RepositoryFactory.getDataSource() !== 'local') {
      throw new Error('Migration failed: RepositoryFactory must be in "local" mode to migrate local data.');
    }

    const guard = AuthLifecycle.createGuard();
    const db = fs.getFirestore(app);

    // Concurrency lock using Web Locks API if available
    if (typeof navigator !== 'undefined' && navigator.locks) {
      await navigator.locks.request(`novo_migration_${uid}`, async () => {
        await this._executeMigrationWorkflow(uid, guard, db, options);
      });
    } else {
      // Fallback if locks API not available (e.g. testing environment)
      await this._executeMigrationWorkflow(uid, guard, db, options);
    }
  }

  /**
   * Coordinates the full migration workflow:
   * 1. Lock acquisition with fencing generation
   * 2. Heartbeat setup
   * 3. Local data extraction
   * 4. Batch planning
   * 5. Conditional writes (runTransaction or fallback batch)
   * 6. Complete verification
   * 7. COMPLETED marker transition
   */
  private static async _executeMigrationWorkflow(
    uid: string,
    guard: ReturnType<typeof AuthLifecycle.createGuard>,
    db: any,
    options?: MigrationOptions
  ): Promise<void> {
    const sessionId = options?.sessionId || this.getTabSessionId();
    const migrationRunId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `run_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    let ownership: MigrationOwnership | null = null;
    let heartbeatTimer: any = null;

    try {
      // 1. Acquire migration lock & fencing token
      ownership = await this._acquireMigrationLock(uid, guard, db, sessionId, migrationRunId, options);

      // 2. Start heartbeat
      const heartbeatInterval = options?.heartbeatIntervalMs ?? this.DEFAULT_HEARTBEAT_INTERVAL_MS;
      if (heartbeatInterval > 0) {
        heartbeatTimer = setInterval(async () => {
          try {
            if (ownership && !guard.isStale()) {
              await this._heartbeat(uid, guard, db, ownership);
            }
          } catch (e) {
            console.warn('[MigrationService] Heartbeat failed:', e);
          }
        }, heartbeatInterval);
      }

      // 3. Read Local Data across all 7 domains + 2 active states
      const localData = await this._extractLocalData(guard);

      // Validate Chat sizes
      const encoder = new TextEncoder();
      for (const chat of localData.chats) {
        if (encoder.encode(JSON.stringify(chat)).byteLength > this.MAX_DOC_SIZE) {
          throw new Error(`Migration failed: Conversation ${chat.id} exceeds supported Firestore document size limit.`);
        }
      }

      if (guard.isStale()) {
        throw new Error('Migration aborted: Identity changed during local read.');
      }

      // 4. Preflight Remote Inventory & Conflict Detection:
      // Enumerate remote collections and check singletons to fail closed immediately
      // if any unexpected remote document exists that is absent from local workspace.
      await this._verifyRemoteInventoryPreflight(uid, guard, db, localData);

      // 5. Batch Planning: Flatten into BatchItemInput list
      const batchItems: BatchItemInput[] = [
        ...localData.tasks.map(t => ({ id: t.id, collection: 'tasks', data: t })),
        ...localData.goals.map(g => ({ id: g.id, collection: 'goals', data: g })),
        ...localData.notes.map(n => ({ id: n.id, collection: 'notes', data: n })),
        ...localData.knowledge.map(k => ({ id: k.id, collection: 'knowledge', data: k })),
        ...localData.money.map(m => ({ id: m.id, collection: 'money', data: m })),
        ...localData.focusSessions.map(f => ({ id: f.id, collection: 'focus_sessions', data: f })),
        ...localData.chats.map(c => ({ id: c.id, collection: 'conversations', data: c })),
      ];

      const batchPlannerOptions = {
        groupByCollection: true,
        ...options?.batchChunkOptions,
      };
      const chunks = planMigrationBatches(batchItems, batchPlannerOptions);

      // 6. Execute conditional chunk writes
      for (const chunk of chunks) {
        if (guard.isStale()) {
          throw new Error('Migration aborted: Identity changed before writing chunk.');
        }
        await this._writeChunkConditional(uid, guard, db, ownership, chunk);
      }

      // 7. Write active states (focus and chat)
      if (localData.activeFocus || localData.activeChatId) {
        if (guard.isStale()) {
          throw new Error('Migration aborted: Identity changed before writing active states.');
        }
        await this._writeActiveStatesConditional(
          uid,
          guard,
          db,
          ownership,
          localData.activeFocus,
          localData.activeChatId
        );
      }

      // 8. Full Deterministic Verification (including remote enumeration)
      if (guard.isStale()) {
        throw new Error('Migration aborted: Identity changed before verification.');
      }
      await this._verifyMigratedData(uid, guard, db, localData);

      // 9. Mark COMPLETED
      if (guard.isStale()) {
        throw new Error('Migration aborted: Identity changed before writing COMPLETED.');
      }

      const totalItems = batchItems.length + (localData.activeFocus ? 1 : 0) + (localData.activeChatId ? 1 : 0);
      await this._finalizeStatus(uid, guard, db, ownership, 'COMPLETED', {
        itemCounts: {
          tasks: localData.tasks.length,
          goals: localData.goals.length,
          notes: localData.notes.length,
          knowledge: localData.knowledge.length,
          money: localData.money.length,
          focusSessions: localData.focusSessions.length,
          conversations: localData.chats.length,
          activeFocus: localData.activeFocus ? 1 : 0,
          activeChat: localData.activeChatId ? 1 : 0,
          total: totalItems
        }
      });

    } catch (error: any) {
      if (heartbeatTimer) clearInterval(heartbeatTimer);

      if (guard.isStale()) {
        throw new Error('Migration aborted: Identity changed during error handling.');
      }

      if (ownership) {
        try {
          await this._finalizeStatus(uid, guard, db, ownership, 'FAILED', {
            errorCode: error?.name || 'MIGRATION_FAILED',
            errorMessage: error?.message || String(error)
          });
        } catch (markerError) {
          console.error('Failed to write FAILED marker:', markerError);
        }
      }

      throw error;
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    }
  }

  /**
   * Reads all 7 domains and 2 active states from local storage repositories.
   */
  private static async _extractLocalData(guard: ReturnType<typeof AuthLifecycle.createGuard>) {
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

    return {
      tasks,
      goals,
      notes,
      knowledge,
      money,
      focusSessions,
      chats,
      activeFocus,
      activeChatId,
    };
  }

  /**
   * Acquires or reclaims the migration lock atomically.
   */
  private static async _acquireMigrationLock(
    uid: string,
    guard: ReturnType<typeof AuthLifecycle.createGuard>,
    db: any,
    sessionId: string,
    migrationRunId: string,
    options?: MigrationOptions
  ): Promise<MigrationOwnership> {
    const markerRef = fs.doc(db, MIGRATION_PATHS.marker(uid));
    const lockTimeout = options?.lockTimeoutMs ?? this.DEFAULT_LOCK_TIMEOUT_MS;

    let acquiredOwnership: MigrationOwnership | null = null;

    if (typeof fs.runTransaction === 'function') {
      await fs.runTransaction(db, async (txn: any) => {
        if (guard.isStale()) {
          throw new Error('Migration aborted: Identity changed during lock acquisition.');
        }

        const snap = await txn.get(markerRef);
        const now = new Date();
        const nowIso = now.toISOString();

        if (snap.exists && snap.exists()) {
          const current = snap.data() as MigrationMarker;
          const currentGen = current.generation || 1;

          if (current.status === 'IN_PROGRESS') {
            const lastActive = current.lastHeartbeatAt || current.startedAt;
            const timeDiff = lastActive ? now.getTime() - new Date(lastActive).getTime() : Infinity;

            const isSameSession = current.sessionId === sessionId;
            const isStale = timeDiff > lockTimeout;

            if (!isSameSession && !isStale) {
              throw new MigrationFencingError(
                `Active migration is already in progress by session "${current.sessionId}".`,
                currentGen,
                currentGen
              );
            }

            // Lock is either abandoned/stale or reclaimed by the same session
            const nextGen = currentGen + 1;
            const newMarker: MigrationMarker = {
              status: 'IN_PROGRESS',
              version: 1,
              startedAt: nowIso,
              lastHeartbeatAt: nowIso,
              sessionId,
              migrationRunId,
              generation: nextGen,
            };

            txn.set(markerRef, newMarker, { merge: true });
            acquiredOwnership = { sessionId, migrationRunId, generation: nextGen };
            return;
          }

          // Existing marker is NOT_STARTED, COMPLETED, or FAILED: increment generation
          const nextGen = currentGen + 1;
          const newMarker: MigrationMarker = {
            status: 'IN_PROGRESS',
            version: 1,
            startedAt: nowIso,
            lastHeartbeatAt: nowIso,
            sessionId,
            migrationRunId,
            generation: nextGen,
          };

          txn.set(markerRef, newMarker, { merge: true });
          acquiredOwnership = { sessionId, migrationRunId, generation: nextGen };
        } else {
          // Fresh document
          const initialGen = 1;
          const newMarker: MigrationMarker = {
            status: 'IN_PROGRESS',
            version: 1,
            startedAt: nowIso,
            lastHeartbeatAt: nowIso,
            sessionId,
            migrationRunId,
            generation: initialGen,
          };

          txn.set(markerRef, newMarker, { merge: true });
          acquiredOwnership = { sessionId, migrationRunId, generation: initialGen };
        }
      });
    } else {
      // Non-transactional fallback (e.g. mock test firestore without runTransaction)
      const snap = await fs.getDoc(markerRef);
      if (guard.isStale()) {
        throw new Error('Migration aborted: Identity changed during lock acquisition.');
      }
      const nowIso = new Date().toISOString();
      const current = (snap.exists && snap.exists()) ? (snap.data() as MigrationMarker) : null;
      const nextGen = (current?.generation || 0) + 1;

      const newMarker: MigrationMarker = {
        status: 'IN_PROGRESS',
        version: 1,
        startedAt: nowIso,
        lastHeartbeatAt: nowIso,
        sessionId,
        migrationRunId,
        generation: nextGen,
      };

      await fs.setDoc(markerRef, newMarker, { merge: true });
      acquiredOwnership = { sessionId, migrationRunId, generation: nextGen };
    }

    if (!acquiredOwnership) {
      throw new Error('Failed to acquire migration lock.');
    }

    return acquiredOwnership;
  }

  /**
   * Heartbeat to keep ownership fresh and avoid lock timeouts.
   */
  private static async _heartbeat(
    uid: string,
    guard: ReturnType<typeof AuthLifecycle.createGuard>,
    db: any,
    ownership: MigrationOwnership
  ): Promise<void> {
    const markerRef = fs.doc(db, MIGRATION_PATHS.marker(uid));
    const nowIso = new Date().toISOString();

    if (typeof fs.runTransaction === 'function') {
      await fs.runTransaction(db, async (txn: any) => {
        if (guard.isStale()) return;
        const snap = await txn.get(markerRef);
        if (!snap.exists || !snap.exists()) return;
        const current = snap.data() as MigrationMarker;
        if (
          current.sessionId !== ownership.sessionId ||
          current.migrationRunId !== ownership.migrationRunId ||
          current.generation !== ownership.generation
        ) {
          return; // Fencing token lost, don't heartbeat
        }
        txn.set(markerRef, { lastHeartbeatAt: nowIso }, { merge: true });
      });
    } else {
      if (guard.isStale()) return;
      await fs.setDoc(markerRef, { lastHeartbeatAt: nowIso }, { merge: true });
    }
  }

  /**
   * Writes a chunk of items conditionally.
   * If runTransaction is available:
   *   1. Reads the marker and verifies owner/generation.
   *   2. Reads every target item doc.
   *   3. If missing: write.
   *   4. If identical: skip.
   *   5. If different: fail closed (throw PreexistingCloudDataConflictError).
   * If runTransaction is not available:
   *   Uses writeBatch with pre-checks.
   */
  private static async _writeChunkConditional(
    uid: string,
    guard: ReturnType<typeof AuthLifecycle.createGuard>,
    db: any,
    ownership: MigrationOwnership,
    chunk: BatchChunk
  ): Promise<void> {
    const markerRef = fs.doc(db, MIGRATION_PATHS.marker(uid));

    if (typeof fs.runTransaction === 'function') {
      await fs.runTransaction(db, async (txn: any) => {
        if (guard.isStale()) {
          throw new Error('Migration aborted: Identity changed during chunk transaction.');
        }

        // 1. Validate migration lock marker & ownership fencing
        const markerSnap = await txn.get(markerRef);
        if (!markerSnap.exists || !markerSnap.exists()) {
          throw new MigrationFencingError('Migration marker disappeared during transaction.');
        }
        const currentMarker = markerSnap.data() as MigrationMarker;
        if (
          currentMarker.generation !== ownership.generation ||
          currentMarker.sessionId !== ownership.sessionId ||
          currentMarker.migrationRunId !== ownership.migrationRunId
        ) {
          throw new MigrationFencingError(
            `Fencing token mismatch: expected gen ${ownership.generation}, got ${currentMarker.generation}`
          );
        }

        // 2. Read all target docs in this chunk
        const itemReads: { item: typeof chunk.items[0]; docRef: any; snap: any }[] = [];
        for (const item of chunk.items) {
          const docPath = getBatchItemDocPath(uid, item);
          const docRef = fs.doc(db, docPath);
          const snap = await txn.get(docRef);
          itemReads.push({ item, docRef, snap });
        }

        // 3. Evaluate each document
        for (const read of itemReads) {
          const { item, docRef, snap } = read;
          if (snap.exists && snap.exists()) {
            const cloudData = snap.data();
            const diff = diffCanonical(item.data, cloudData);
            if (diff.equal) {
              // Canonical match: already safely in cloud, skip write
              continue;
            } else {
              // Conflict! Fail closed
              const docPath = getBatchItemDocPath(uid, item);
              throw new PreexistingCloudDataConflictError(docPath, diff.reason || 'field values differ');
            }
          } else {
            // Missing: safe to write
            txn.set(docRef, item.data, { merge: true });
          }
        }
      });
    } else {
      // Non-transactional fallback (batch writes)
      // Check for conflicts first
      for (const item of chunk.items) {
        if (guard.isStale()) {
          throw new Error('Migration aborted: Identity changed before writing item.');
        }
        const docPath = getBatchItemDocPath(uid, item);
        const docRef = fs.doc(db, docPath);
        const snap = await fs.getDoc(docRef);
        if (snap.exists && snap.exists()) {
          const cloudData = snap.data();
          const diff = diffCanonical(item.data, cloudData);
          if (!diff.equal) {
            throw new PreexistingCloudDataConflictError(docPath, diff.reason || 'field values differ');
          }
        }
      }

      if (guard.isStale()) {
        throw new Error('Migration aborted: Identity changed before batch commit.');
      }

      const batch = fs.writeBatch(db);
      for (const item of chunk.items) {
        const docPath = getBatchItemDocPath(uid, item);
        const docRef = fs.doc(db, docPath);
        batch.set(docRef, item.data, { merge: true });
      }

      if (guard.isStale()) {
        throw new Error('Migration aborted: Identity changed during batch setup.');
      }

      await batch.commit();
    }
  }

  /**
   * Writes active focus and active chat states conditionally.
   */
  private static async _writeActiveStatesConditional(
    uid: string,
    guard: ReturnType<typeof AuthLifecycle.createGuard>,
    db: any,
    ownership: MigrationOwnership,
    activeFocus: any,
    activeChatId: string | null
  ): Promise<void> {
    const markerRef = fs.doc(db, MIGRATION_PATHS.marker(uid));
    const focusRef = fs.doc(db, MIGRATION_PATHS.activeFocus(uid));
    const chatRef = fs.doc(db, MIGRATION_PATHS.activeChat(uid));

    if (typeof fs.runTransaction === 'function') {
      await fs.runTransaction(db, async (txn: any) => {
        if (guard.isStale()) {
          throw new Error('Migration aborted: Identity changed during active state transaction.');
        }

        const markerSnap = await txn.get(markerRef);
        if (!markerSnap.exists || !markerSnap.exists()) {
          throw new MigrationFencingError('Migration marker disappeared.');
        }
        const currentMarker = markerSnap.data() as MigrationMarker;
        if (
          currentMarker.generation !== ownership.generation ||
          currentMarker.sessionId !== ownership.sessionId ||
          currentMarker.migrationRunId !== ownership.migrationRunId
        ) {
          throw new MigrationFencingError('Fencing token mismatch during active state write.');
        }

        const focusSnap = await txn.get(focusRef);
        if (activeFocus) {
          if (focusSnap.exists && focusSnap.exists()) {
            const cloudData = focusSnap.data();
            const diff = diffCanonical(activeFocus, cloudData);
            if (!diff.equal) {
              throw new PreexistingCloudDataConflictError(
                MIGRATION_PATHS.activeFocus(uid),
                diff.reason || 'active focus differs'
              );
            }
          } else {
            txn.set(focusRef, activeFocus, { merge: true });
          }
        } else {
          if (focusSnap.exists && focusSnap.exists()) {
            throw new PreexistingCloudDataConflictError(
              MIGRATION_PATHS.activeFocus(uid),
              'Remote active focus document exists in Firestore but is absent from local workspace'
            );
          }
        }

        const chatSnap = await txn.get(chatRef);
        if (activeChatId) {
          const localPayload = { activeChatId };
          if (chatSnap.exists && chatSnap.exists()) {
            const cloudData = chatSnap.data();
            const diff = diffCanonical(localPayload, cloudData);
            if (!diff.equal) {
              throw new PreexistingCloudDataConflictError(
                MIGRATION_PATHS.activeChat(uid),
                diff.reason || 'active chat differs'
              );
            }
          } else {
            txn.set(chatRef, localPayload, { merge: true });
          }
        } else {
          if (chatSnap.exists && chatSnap.exists()) {
            throw new PreexistingCloudDataConflictError(
              MIGRATION_PATHS.activeChat(uid),
              'Remote active chat document exists in Firestore but is absent from local workspace'
            );
          }
        }
      });
    } else {
      // Fallback batch
      const batch = fs.writeBatch(db);
      if (activeFocus) {
        batch.set(focusRef, activeFocus, { merge: true });
      }
      if (activeChatId) {
        batch.set(chatRef, { activeChatId }, { merge: true });
      }
      if (guard.isStale()) {
        throw new Error('Migration aborted: Identity changed during active state upsert.');
      }
      await batch.commit();
    }
  }

  /**
   * Preflight inspection: Enumerates remote Firestore collections and singletons
   * to verify that no remote documents exist that are absent from or conflicting with the local workspace.
   * Fails closed if any remote document has no corresponding local ID or differs.
   */
  private static async _verifyRemoteInventoryPreflight(
    uid: string,
    guard: ReturnType<typeof AuthLifecycle.createGuard>,
    db: any,
    localData: Awaited<ReturnType<typeof MigrationService._extractLocalData>>
  ): Promise<void> {
    const checkCollectionRemote = async (collectionName: string, localItems: { id: string }[]) => {
      if (guard.isStale()) {
        throw new Error(`Migration aborted: Identity changed during preflight ${collectionName} inventory.`);
      }
      const colPath = `users/${uid}/${collectionName}`;
      if (typeof fs.getDocs === 'function') {
        const colRef = fs.collection(db, colPath);
        const snap = await fs.getDocs(colRef);
        const localMap = new Map<string, any>(localItems.map(item => [item.id, item]));

        for (const docSnap of snap.docs) {
          if (guard.isStale()) {
            throw new Error(`Migration aborted: Identity changed during preflight ${collectionName} inspection.`);
          }
          const remoteId = docSnap.id;
          const localItem = localMap.get(remoteId);
          if (!localItem) {
            throw new PreexistingCloudDataConflictError(
              `${colPath}/${remoteId}`,
              'Remote document exists in Firestore but is absent from local workspace'
            );
          }
          const cloudData = docSnap.data();
          const diff = diffCanonical(localItem, cloudData);
          if (!diff.equal) {
            throw new PreexistingCloudDataConflictError(
              `${colPath}/${remoteId}`,
              diff.reason || 'Remote document content differs from local workspace'
            );
          }
        }
      }
    };

    await checkCollectionRemote('tasks', localData.tasks);
    await checkCollectionRemote('goals', localData.goals);
    await checkCollectionRemote('notes', localData.notes);
    await checkCollectionRemote('knowledge', localData.knowledge);
    await checkCollectionRemote('money', localData.money);
    await checkCollectionRemote('focus_sessions', localData.focusSessions);
    await checkCollectionRemote('conversations', localData.chats);

    // Singletons
    if (guard.isStale()) throw new Error('Migration aborted on singleton preflight check.');
    const focusRef = fs.doc(db, MIGRATION_PATHS.activeFocus(uid));
    const focusSnap = await fs.getDoc(focusRef);
    if (focusSnap.exists && focusSnap.exists()) {
      if (!localData.activeFocus) {
        throw new PreexistingCloudDataConflictError(
          MIGRATION_PATHS.activeFocus(uid),
          'Remote active focus document exists in Firestore but is absent from local workspace'
        );
      }
      const diff = diffCanonical(localData.activeFocus, focusSnap.data());
      if (!diff.equal) {
        throw new PreexistingCloudDataConflictError(
          MIGRATION_PATHS.activeFocus(uid),
          diff.reason || 'Remote active focus content differs from local workspace'
        );
      }
    }

    const chatRef = fs.doc(db, MIGRATION_PATHS.activeChat(uid));
    const chatSnap = await fs.getDoc(chatRef);
    if (chatSnap.exists && chatSnap.exists()) {
      if (!localData.activeChatId) {
        throw new PreexistingCloudDataConflictError(
          MIGRATION_PATHS.activeChat(uid),
          'Remote active chat document exists in Firestore but is absent from local workspace'
        );
      }
      const diff = diffCanonical({ activeChatId: localData.activeChatId }, chatSnap.data());
      if (!diff.equal) {
        throw new PreexistingCloudDataConflictError(
          MIGRATION_PATHS.activeChat(uid),
          diff.reason || 'Remote active chat content differs from local workspace'
        );
      }
    }
  }

  /**
   * Verifies all migrated local items against remote Firestore documents,
   * AND verifies remote collections do not contain any unexpected documents absent from local.
   */
  private static async _verifyMigratedData(
    uid: string,
    guard: ReturnType<typeof AuthLifecycle.createGuard>,
    db: any,
    localData: Awaited<ReturnType<typeof MigrationService._extractLocalData>>
  ): Promise<void> {
    const checkCollection = async (collectionName: string, items: { id: string }[]) => {
      const colPath = `users/${uid}/${collectionName}`;
      const localMap = new Map<string, any>(items.map(item => [item.id, item]));

      for (const item of items) {
        if (guard.isStale()) {
          throw new Error(`Migration verification aborted: Identity changed during ${collectionName} check.`);
        }
        const docRef = fs.doc(db, `${colPath}/${item.id}`);
        const snap = await fs.getDoc(docRef);
        if (!snap.exists || !snap.exists()) {
          throw new Error(`Verification failed: Document ${colPath}/${item.id} is missing in Firestore.`);
        }
        const cloudData = snap.data();
        const diff = diffCanonical(item, cloudData);
        if (!diff.equal) {
          throw new Error(
            `Verification failed: Document ${colPath}/${item.id} diverges at ${diff.path}: ${diff.reason}`
          );
        }
      }

      // Enumerate remote collection to ensure no unexpected remote-only documents exist
      if (typeof fs.getDocs === 'function') {
        const colRef = fs.collection(db, colPath);
        const remoteSnap = await fs.getDocs(colRef);
        for (const docSnap of remoteSnap.docs) {
          if (!localMap.has(docSnap.id)) {
            throw new PreexistingCloudDataConflictError(
              `${colPath}/${docSnap.id}`,
              'Remote document exists in Firestore but is absent from local workspace'
            );
          }
        }
        if (remoteSnap.docs.length !== items.length) {
          throw new Error(
            `Verification failed: Remote collection ${colPath} has ${remoteSnap.docs.length} documents, expected ${items.length}.`
          );
        }
      }
    };

    await checkCollection('tasks', localData.tasks);
    await checkCollection('goals', localData.goals);
    await checkCollection('notes', localData.notes);
    await checkCollection('knowledge', localData.knowledge);
    await checkCollection('money', localData.money);
    await checkCollection('focus_sessions', localData.focusSessions);
    await checkCollection('conversations', localData.chats);

    // Verify active states
    const focusRef = fs.doc(db, MIGRATION_PATHS.activeFocus(uid));
    const focusSnap = await fs.getDoc(focusRef);
    if (localData.activeFocus) {
      if (guard.isStale()) throw new Error('Migration verification aborted on active focus.');
      if (!focusSnap.exists || !focusSnap.exists()) {
        throw new Error('Verification failed: active_state/focus document missing.');
      }
      const diff = diffCanonical(localData.activeFocus, focusSnap.data());
      if (!diff.equal) {
        throw new Error(`Verification failed: active_state/focus diverges: ${diff.reason}`);
      }
    } else {
      if (focusSnap.exists && focusSnap.exists()) {
        throw new PreexistingCloudDataConflictError(
          MIGRATION_PATHS.activeFocus(uid),
          'Remote active focus document exists in Firestore but is absent from local workspace'
        );
      }
    }

    const chatRef = fs.doc(db, MIGRATION_PATHS.activeChat(uid));
    const chatSnap = await fs.getDoc(chatRef);
    if (localData.activeChatId) {
      if (guard.isStale()) throw new Error('Migration verification aborted on active chat.');
      if (!chatSnap.exists || !chatSnap.exists()) {
        throw new Error('Verification failed: active_state/chat document missing.');
      }
      const diff = diffCanonical({ activeChatId: localData.activeChatId }, chatSnap.data());
      if (!diff.equal) {
        throw new Error(`Verification failed: active_state/chat diverges: ${diff.reason}`);
      }
    } else {
      if (chatSnap.exists && chatSnap.exists()) {
        throw new PreexistingCloudDataConflictError(
          MIGRATION_PATHS.activeChat(uid),
          'Remote active chat document exists in Firestore but is absent from local workspace'
        );
      }
    }
  }

  /**
   * Updates migration status marker with owner and generation fencing checks.
   */
  private static async _finalizeStatus(
    uid: string,
    guard: ReturnType<typeof AuthLifecycle.createGuard>,
    db: any,
    ownership: MigrationOwnership,
    status: MigrationStatus,
    extra?: Partial<MigrationMarker>
  ): Promise<void> {
    const markerRef = fs.doc(db, MIGRATION_PATHS.marker(uid));
    const nowIso = new Date().toISOString();

    const payload: Partial<MigrationMarker> = {
      status,
      version: 1,
      sessionId: ownership.sessionId,
      migrationRunId: ownership.migrationRunId,
      generation: ownership.generation,
      lastHeartbeatAt: nowIso,
      ...(status === 'COMPLETED' ? { completedAt: nowIso } : {}),
      ...(status === 'FAILED' ? { failedAt: nowIso } : {}),
      ...extra,
    };

    if (typeof fs.runTransaction === 'function') {
      await fs.runTransaction(db, async (txn: any) => {
        if (guard.isStale()) return;
        const snap = await txn.get(markerRef);
        if (snap.exists && snap.exists()) {
          const current = snap.data() as MigrationMarker;
          if (
            current.sessionId !== ownership.sessionId ||
            current.migrationRunId !== ownership.migrationRunId ||
            current.generation !== ownership.generation
          ) {
            console.warn('[MigrationService] Cannot update marker: Fencing token mismatch.');
            return;
          }
        }
        txn.set(markerRef, payload, { merge: true });
      });
    } else {
      if (guard.isStale()) return;
      await fs.setDoc(markerRef, payload, { merge: true });
    }
  }
}
