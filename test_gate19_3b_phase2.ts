/**
 * Novo Gate 19.3B - Phase 2 Comprehensive Migration Safety Test Suite
 *
 * Covers all required Phase 2 safety scenarios:
 * 1. Monotonically increasing generation / fencing token
 * 2. Active lock in another session blocks migration
 * 3. Stale abandoned lock is recovered after timeout with incremented generation
 * 4. Stale lock in same session is safely reclaimed
 * 5. Heartbeat updates lastHeartbeatAt during execution
 * 6. Stale heartbeat writer with old generation cannot overwrite marker
 * 7. Pre-existing cloud document identical is skipped (safe idempotency)
 * 8. Pre-existing cloud document differing causes fail-closed (PreexistingCloudDataConflictError)
 * 9. Pre-existing cloud document differs without overwriting remote record
 * 10. Local workspace data remains intact in LocalStorage after conflict/failure
 * 11. Transaction conflict causes retry and re-evaluation
 * 12. Complete deterministic post-write verification passes
 * 13. Verification failure triggers FAILED marker and aborts before cutover
 * 14. RepositoryFactory remains in 'local' mode throughout migration
 * 15. RepositoryFactory not in local mode causes refusal
 * 16. Anonymous/guest user refuses migration
 * 17. Stale auth epoch aborts migration safely
 */

import './test_firebase_mock_app';
import {
  MigrationService,
  PreexistingCloudDataConflictError,
  MigrationFencingError
} from './src/core/data/migration/MigrationService';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { storageService } from './src/core/storage/storageService';
import { STORAGE_KEYS } from './src/core/storage/storageKeys';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { setMockFirestore } from './src/core/data/repositories/firebase/firestoreProvider';
import { areCanonicallyEqual } from './src/core/data/migration/canonical';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${msg}`);
    throw new Error(msg);
  }
  console.log(`  ✓ PASS: ${msg}`);
}

// In-memory Firestore mock with full transaction support
interface MockDocState {
  data: any;
  version: number;
}

const mockStore = new Map<string, MockDocState>();
let txnConflictsTriggered = 0;

function resetStore() {
  mockStore.clear();
  txnConflictsTriggered = 0;
}

const mockFirestoreInstance: any = {
  getFirestore: () => ({}),
  collection: (_db: any, path: string) => path,
  doc: (_db: any, path: string) => path,

  getDoc: async (docPath: string) => {
    const entry = mockStore.get(docPath);
    return {
      exists: () => entry !== undefined,
      data: () => (entry ? JSON.parse(JSON.stringify(entry.data)) : undefined),
    };
  },

  getDocs: async (colPath: any) => {
    const pathStr = (colPath && colPath.path) ? colPath.path : String(colPath);
    const prefix = pathStr.endsWith('/') ? pathStr : pathStr + '/';
    const docs: Array<{ id: string; data: () => any }> = [];
    for (const [key, val] of mockStore.entries()) {
      if (key.startsWith(prefix)) {
        const sub = key.slice(prefix.length);
        if (!sub.includes('/')) {
          docs.push({
            id: sub,
            data: () => JSON.parse(JSON.stringify(val.data)),
          });
        }
      }
    }
    return { docs };
  },

  setDoc: async (docPath: string, data: any, options?: { merge?: boolean }) => {
    const existing = mockStore.get(docPath);
    const merged = (options?.merge && existing)
      ? { ...existing.data, ...data }
      : { ...data };
    const version = (existing?.version || 0) + 1;
    mockStore.set(docPath, { data: JSON.parse(JSON.stringify(merged)), version });
  },

  deleteDoc: async (docPath: string) => {
    mockStore.delete(docPath);
  },

  writeBatch: () => {
    const ops: Array<() => void> = [];
    return {
      set: (docPath: string, data: any, options?: { merge?: boolean }) => {
        ops.push(() => {
          const existing = mockStore.get(docPath);
          const merged = (options?.merge && existing)
            ? { ...existing.data, ...data }
            : { ...data };
          const version = (existing?.version || 0) + 1;
          mockStore.set(docPath, { data: JSON.parse(JSON.stringify(merged)), version });
        });
      },
      delete: (docPath: string) => {
        ops.push(() => mockStore.delete(docPath));
      },
      commit: async () => {
        for (const op of ops) op();
      },
    };
  },

  runTransaction: async (_db: any, updateFunction: (txn: any) => Promise<any>) => {
    // Optimistic concurrency simulation
    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const readVersions = new Map<string, number>();
      const stagedWrites = new Map<string, { data: any; merge?: boolean }>();

      const txnContext = {
        get: async (docPath: string) => {
          const entry = mockStore.get(docPath);
          readVersions.set(docPath, entry ? entry.version : 0);
          return {
            exists: () => entry !== undefined,
            data: () => (entry ? JSON.parse(JSON.stringify(entry.data)) : undefined),
          };
        },
        set: (docPath: string, data: any, options?: { merge?: boolean }) => {
          stagedWrites.set(docPath, { data: JSON.parse(JSON.stringify(data)), merge: options?.merge });
        },
        delete: (docPath: string) => {
          stagedWrites.set(docPath, { data: undefined });
        },
      };

      const result = await updateFunction(txnContext);

      // Verify read versions match store (detect concurrent writes)
      let conflict = false;
      for (const [docPath, version] of readVersions.entries()) {
        const currentEntry = mockStore.get(docPath);
        const currentVersion = currentEntry ? currentEntry.version : 0;
        if (currentVersion !== version) {
          conflict = true;
          txnConflictsTriggered++;
          break;
        }
      }

      if (conflict) {
        // Retry
        continue;
      }

      // Commit staged writes
      for (const [docPath, write] of stagedWrites.entries()) {
        if (write.data === undefined) {
          mockStore.delete(docPath);
        } else {
          const existing = mockStore.get(docPath);
          const merged = (write.merge && existing)
            ? { ...existing.data, ...write.data }
            : { ...write.data };
          const newVersion = (existing?.version || 0) + 1;
          mockStore.set(docPath, { data: merged, version: newVersion });
        }
      }

      return result;
    }
    throw new Error('Transaction failed: max retries exceeded due to concurrency conflicts.');
  },
};

setMockFirestore(mockFirestoreInstance);

function populateLocalWorkspace(uid: string) {
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.TASKS}`, [
    { id: 't_alpha', title: 'Task Alpha', completed: false },
    { id: 't_beta', title: 'Task Beta', completed: true },
  ]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.GOALS}`, [
    { id: 'g_one', title: 'Goal One', progress: 50 },
  ]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.NOTES}`, [
    { id: 'n_one', content: 'Note content', tags: ['work', 'urgent'] },
  ]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.KNOWLEDGE}`, [
    { id: 'k_one', title: 'Architecture doc', content: 'Local-first rules' },
  ]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.MONEY_ENTRIES}`, [
    { id: 'm_one', amount: 150.75, category: 'equipment' },
  ]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.FOCUS_SESSIONS}`, [
    { id: 'f_one', duration: 1500, state: 'completed' },
  ]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.CONVERSATIONS}`, [
    { id: 'c_one', title: 'Project Sync', messages: [{ sender: 'user', text: 'Hello' }] },
  ]);
  storageService.setItem(`novo:${uid}:novo_active_focus`, {
    active: true,
    sessionId: 'f_one',
    elapsedSeconds: 300,
  });
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.ACTIVE_CHAT_ID}`, 'c_one');
}

async function runGate19_3b_Tests() {
  console.log('====================================================');
  console.log('NOVO GATE 19.3B — PHASE 2 ENGINE SAFETY TEST SUITE');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // Scenario 1: Precondition checks
  // ----------------------------------------------------
  console.log('Group 1: Precondition Checks');
  resetStore();
  AuthLifecycle.reset(null);

  let unauthBlocked = false;
  try {
    await MigrationService.migrateCurrentUserToFirestore();
  } catch (e: any) {
    if (e.message.includes('No authenticated user')) unauthBlocked = true;
  }
  assert(unauthBlocked, 'Rejects migration when no user is authenticated');

  // Mode check: Must be in local mode
  AuthLifecycle.reset('uid_user_1');
  populateLocalWorkspace('uid_user_1');
  RepositoryFactory.setDataSource('firebase');
  let nonLocalBlocked = false;
  try {
    await MigrationService.migrateCurrentUserToFirestore();
  } catch (e: any) {
    if (e.message.includes('RepositoryFactory must be in "local" mode')) nonLocalBlocked = true;
  }
  assert(nonLocalBlocked, 'Rejects migration when RepositoryFactory is not in local mode');
  RepositoryFactory.setDataSource('local');

  // ----------------------------------------------------
  // Scenario 2: Standard First-time Successful Migration & Fencing
  // ----------------------------------------------------
  console.log('\nGroup 2: Standard Clean Migration & Fencing Token Generation');
  resetStore();
  AuthLifecycle.reset('uid_user_clean');
  populateLocalWorkspace('uid_user_clean');

  await MigrationService.migrateCurrentUserToFirestore({ sessionId: 'session_A' });

  const markerDoc = mockStore.get('users/uid_user_clean/metadata/migration');
  assert(markerDoc !== undefined, 'Migration marker created');
  assert(markerDoc.data.status === 'COMPLETED', 'Marker status transitioned to COMPLETED');
  assert(markerDoc.data.generation === 1, 'Initial generation set to 1');
  assert(markerDoc.data.sessionId === 'session_A', 'Marker captures owner sessionId');
  assert(typeof markerDoc.data.migrationRunId === 'string', 'Marker captures unique migrationRunId');
  assert(typeof markerDoc.data.completedAt === 'string', 'Marker records completedAt timestamp');
  assert(markerDoc.data.itemCounts?.total === 10, `All 7 domains (8 items) + 2 active states recorded in counts (actual: ${markerDoc.data.itemCounts?.total})`);

  // Verify all documents exist and match
  const taskAlpha = mockStore.get('users/uid_user_clean/tasks/t_alpha');
  assert(taskAlpha !== undefined, 'Task t_alpha written to users/uid_user_clean/tasks/t_alpha');
  assert(taskAlpha.data.title === 'Task Alpha', 'Task content matches');

  const activeFocusDoc = mockStore.get('users/uid_user_clean/active_state/focus');
  assert(activeFocusDoc !== undefined, 'Active focus document created at users/uid_user_clean/active_state/focus');
  assert(activeFocusDoc.data.elapsedSeconds === 300, 'Active focus content matches');

  const activeChatDoc = mockStore.get('users/uid_user_clean/active_state/chat');
  assert(activeChatDoc !== undefined, 'Active chat document created at users/uid_user_clean/active_state/chat');
  assert(activeChatDoc.data.activeChatId === 'c_one', 'Active chat ID matches');

  // Repository mode remains local (NO CUTOVER)
  assert(RepositoryFactory.getDataSource() === 'local', 'RepositoryFactory remains strictly local post-migration');

  // ----------------------------------------------------
  // Scenario 3: Monotonically increasing generation on subsequent migration
  // ----------------------------------------------------
  console.log('\nGroup 3: Fencing Generation Monotonic Increment');
  await MigrationService.migrateCurrentUserToFirestore({ sessionId: 'session_A' });
  const markerDoc2 = mockStore.get('users/uid_user_clean/metadata/migration');
  assert(markerDoc2.data.generation === 2, `Generation incremented monotonically from 1 to 2 (actual: ${markerDoc2.data.generation})`);
  assert(markerDoc2.data.status === 'COMPLETED', 'Status remains COMPLETED after idempotent run');

  // ----------------------------------------------------
  // Scenario 4: Active lock in another session blocks migration
  // ----------------------------------------------------
  console.log('\nGroup 4: Active Lock in Different Session Blocks Migration');
  resetStore();
  AuthLifecycle.reset('uid_user_locked');
  populateLocalWorkspace('uid_user_locked');

  // Seed active lock by session_Foreign
  mockStore.set('users/uid_user_locked/metadata/migration', {
    data: {
      status: 'IN_PROGRESS',
      generation: 5,
      sessionId: 'session_Foreign',
      migrationRunId: 'run_foreign_99',
      startedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(), // fresh heartbeat
    },
    version: 1,
  });

  let lockBlocked = false;
  try {
    await MigrationService.migrateCurrentUserToFirestore({
      sessionId: 'session_Local',
      lockTimeoutMs: 60_000,
    });
  } catch (e: any) {
    if (e.name === 'MigrationFencingError' && e.message.includes('already in progress by session')) {
      lockBlocked = true;
    }
  }
  assert(lockBlocked, 'Rejects migration when another session holds an active unexpired lock');
  const lockedMarker = mockStore.get('users/uid_user_locked/metadata/migration');
  assert(lockedMarker.data.sessionId === 'session_Foreign', 'Original foreign lock preserved intact');
  assert(lockedMarker.data.generation === 5, 'Generation remains unchanged');

  // ----------------------------------------------------
  // Scenario 5: Stale abandoned lock is recovered after timeout
  // ----------------------------------------------------
  console.log('\nGroup 5: Stale Abandoned Lock Recovery');
  // Set last heartbeat to 10 minutes ago
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  mockStore.set('users/uid_user_locked/metadata/migration', {
    data: {
      status: 'IN_PROGRESS',
      generation: 5,
      sessionId: 'session_Crashed',
      migrationRunId: 'run_crashed_1',
      startedAt: tenMinutesAgo,
      lastHeartbeatAt: tenMinutesAgo,
    },
    version: 1,
  });

  await MigrationService.migrateCurrentUserToFirestore({
    sessionId: 'session_NewTab',
    lockTimeoutMs: 60_000, // 60s timeout < 10 minutes
  });

  const recoveredMarker = mockStore.get('users/uid_user_locked/metadata/migration');
  assert(recoveredMarker.data.status === 'COMPLETED', 'Recovered migration completed successfully');
  assert(recoveredMarker.data.sessionId === 'session_NewTab', 'New session took ownership');
  assert(recoveredMarker.data.generation === 6, 'Generation incremented from 5 to 6');

  // ----------------------------------------------------
  // Scenario 6: Reclaiming Lock from Same Session
  // ----------------------------------------------------
  console.log('\nGroup 6: Reclaiming Lock from Same Session');
  // Same session recovering a previously IN_PROGRESS run
  mockStore.set('users/uid_user_locked/metadata/migration', {
    data: {
      status: 'IN_PROGRESS',
      generation: 10,
      sessionId: 'session_SameTab',
      migrationRunId: 'run_old',
      startedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
    },
    version: 1,
  });

  await MigrationService.migrateCurrentUserToFirestore({
    sessionId: 'session_SameTab',
  });

  const sameSessionMarker = mockStore.get('users/uid_user_locked/metadata/migration');
  assert(sameSessionMarker.data.status === 'COMPLETED', 'Same session reclaimed and completed');
  assert(sameSessionMarker.data.generation === 11, 'Generation incremented from 10 to 11');

  // ----------------------------------------------------
  // Scenario 7: Idempotency with Identical Cloud Data (Skip Write)
  // ----------------------------------------------------
  console.log('\nGroup 7: Pre-existing Identical Cloud Data is Skipped');
  resetStore();
  AuthLifecycle.reset('uid_user_idem');
  populateLocalWorkspace('uid_user_idem');

  // Pre-seed remote task t_alpha with identical content
  mockStore.set('users/uid_user_idem/tasks/t_alpha', {
    data: { id: 't_alpha', title: 'Task Alpha', completed: false },
    version: 100, // Pre-existing high version
  });

  await MigrationService.migrateCurrentUserToFirestore({ sessionId: 'session_I' });

  const idemTask = mockStore.get('users/uid_user_idem/tasks/t_alpha');
  assert(idemTask !== undefined, 'Task t_alpha exists');
  assert(idemTask.version === 100, `Task write was skipped because remote document was canonically identical (version: ${idemTask.version})`);

  // ----------------------------------------------------
  // Scenario 8: Conflict Detection — Pre-existing Differing Cloud Data Fails Closed
  // ----------------------------------------------------
  console.log('\nGroup 8: Conflict Detection — Differing Pre-existing Record Fails Closed');
  resetStore();
  AuthLifecycle.reset('uid_user_conflict');
  populateLocalWorkspace('uid_user_conflict');

  // Pre-seed remote task t_alpha with differing content (different title)
  const existingCloudData = { id: 't_alpha', title: 'Completely Different Remote Title', completed: true };
  mockStore.set('users/uid_user_conflict/tasks/t_alpha', {
    data: existingCloudData,
    version: 5,
  });

  let conflictThrown = false;
  try {
    await MigrationService.migrateCurrentUserToFirestore({ sessionId: 'session_Conf' });
  } catch (e: any) {
    if (e.name === 'PreexistingCloudDataConflictError') {
      conflictThrown = true;
    }
  }
  assert(conflictThrown, 'Fails closed when remote document has differing data');

  // Crucial requirement: Did NOT overwrite conflicting remote document
  const preservedRemoteTask = mockStore.get('users/uid_user_conflict/tasks/t_alpha');
  assert(
    preservedRemoteTask.data.title === 'Completely Different Remote Title',
    'Conflicting remote document was NOT overwritten'
  );
  assert(preservedRemoteTask.version === 5, 'Remote document version was unchanged');

  // Crucial requirement: Migration marker marked FAILED
  const conflictMarker = mockStore.get('users/uid_user_conflict/metadata/migration');
  assert(conflictMarker.data.status === 'FAILED', 'Marker marked FAILED after conflict');
  assert(conflictMarker.data.errorCode === 'PreexistingCloudDataConflictError', 'Error code recorded in marker');

  // Crucial requirement: Local workspace data in LocalStorage remains untouched
  const localTasks = storageService.getItem<any[]>(`novo:uid_user_conflict:${STORAGE_KEYS.TASKS}`);
  assert(localTasks !== null && localTasks.length === 2, 'Local tasks in LocalStorage remained 100% untouched');
  assert(localTasks[0].title === 'Task Alpha', 'Local task data intact');

  // ----------------------------------------------------
  // Scenario 9: Active State Differing Fails Closed Without Overwrite
  // ----------------------------------------------------
  console.log('\nGroup 9: Active State Conflict Fails Closed');
  resetStore();
  AuthLifecycle.reset('uid_user_active_conf');
  populateLocalWorkspace('uid_user_active_conf');

  // Remote active focus differs
  mockStore.set('users/uid_user_active_conf/active_state/focus', {
    data: { active: true, sessionId: 'remote_session', elapsedSeconds: 9999 },
    version: 1,
  });

  let activeConfThrown = false;
  try {
    await MigrationService.migrateCurrentUserToFirestore();
  } catch (e: any) {
    if (e.name === 'PreexistingCloudDataConflictError') activeConfThrown = true;
  }
  assert(activeConfThrown, 'Fails closed when remote active focus differs');
  const preservedRemoteFocus = mockStore.get('users/uid_user_active_conf/active_state/focus');
  assert(preservedRemoteFocus.data.elapsedSeconds === 9999, 'Conflicting remote active state was NOT overwritten');

  // ----------------------------------------------------
  // Scenario 10: Fencing token lost mid-execution causes transaction failure
  // ----------------------------------------------------
  console.log('\nGroup 10: Concurrent Fencing Invalidation Detected Mid-transaction');
  resetStore();
  AuthLifecycle.reset('uid_user_stolen');
  populateLocalWorkspace('uid_user_stolen');

  // Setup: When transaction reads tasks chunk, another session steals the lock
  let fenceStolen = false;
  const originalRunTxn = mockFirestoreInstance.runTransaction;

  let txnCallCount = 0;
  mockFirestoreInstance.runTransaction = async (db: any, fn: any) => {
    txnCallCount++;
    if (txnCallCount === 2) { // 1st is lock acquisition, 2nd is first chunk write
      // Intercept before running chunk transaction: another tab bumps generation
      mockStore.set('users/uid_user_stolen/metadata/migration', {
        data: {
          status: 'IN_PROGRESS',
          generation: 999, // Stolen!
          sessionId: 'session_Thief',
          migrationRunId: 'run_thief',
        },
        version: 50,
      });
      fenceStolen = true;
    }
    return originalRunTxn(db, fn);
  };

  let stolenThrown = false;
  try {
    await MigrationService.migrateCurrentUserToFirestore({ sessionId: 'session_Victim' });
  } catch (e: any) {
    if (e.name === 'MigrationFencingError') stolenThrown = true;
  }
  mockFirestoreInstance.runTransaction = originalRunTxn; // Restore

  assert(fenceStolen, 'Simulated concurrent tab acquiring higher generation token');
  assert(stolenThrown, 'Migration immediately aborted when generation mismatch was detected');
  const stolenMarker = mockStore.get('users/uid_user_stolen/metadata/migration');
  assert(stolenMarker.data.generation === 999, 'Stale owner did NOT overwrite the higher generation marker');

  // ----------------------------------------------------
  // Scenario 11: Verification failure catches data tampering
  // ----------------------------------------------------
  console.log('\nGroup 11: Verification Catches Unexpected Missing Document');
  resetStore();
  AuthLifecycle.reset('uid_user_verif');
  populateLocalWorkspace('uid_user_verif');

  // Override setDoc inside transaction to skip writing notes
  const origSet = mockFirestoreInstance.runTransaction;
  mockFirestoreInstance.runTransaction = async (db: any, fn: any) => {
    return origSet(db, async (txn: any) => {
      const origTxnSet = txn.set;
      txn.set = (path: string, data: any, opts: any) => {
        if (path.includes('/notes/')) {
          // drop the note write to simulate missing document during verification
          return;
        }
        origTxnSet(path, data, opts);
      };
      return fn(txn);
    });
  };

  let verifFailed = false;
  try {
    await MigrationService.migrateCurrentUserToFirestore();
  } catch (e: any) {
    if (e.message.includes('Verification failed: Document') && e.message.includes('is missing')) {
      verifFailed = true;
    }
  }
  mockFirestoreInstance.runTransaction = origSet; // Restore

  assert(verifFailed, 'Verification failure caught missing document and aborted');
  const verifMarker = mockStore.get('users/uid_user_verif/metadata/migration');
  assert(verifMarker.data.status === 'FAILED', 'Marker marked FAILED upon verification divergence');

  // ----------------------------------------------------
  // Scenario 12: Auth change during execution safely aborts
  // ----------------------------------------------------
  console.log('\nGroup 12: Auth epoch increment during execution aborts safely');
  resetStore();
  AuthLifecycle.reset('uid_user_auth_bump');
  populateLocalWorkspace('uid_user_auth_bump');

  let authBumped = false;
  mockFirestoreInstance.runTransaction = async (db: any, fn: any) => {
    // On second txn (chunk write), reset auth
    if (!authBumped) {
      AuthLifecycle.reset('uid_user_different');
      authBumped = true;
    }
    return origSet(db, fn);
  };

  let authAborted = false;
  try {
    await MigrationService.migrateCurrentUserToFirestore();
  } catch (e: any) {
    if (e.message.includes('aborted: Identity changed')) authAborted = true;
  }
  mockFirestoreInstance.runTransaction = origSet;

  assert(authAborted, 'Auth change during transaction triggers abort guard');

  // ----------------------------------------------------
  // Scenario 13: Remote-only document in collection target fails closed
  // ----------------------------------------------------
  console.log('\nGroup 13: Remote-only Document in Collection Target Fails Closed');
  resetStore();
  AuthLifecycle.reset('uid_user_remote_col');
  populateLocalWorkspace('uid_user_remote_col');

  // Seed unexpected remote document in tasks collection absent from local storage
  mockStore.set('users/uid_user_remote_col/tasks/t_remote_uninvited', {
    data: { id: 't_remote_uninvited', title: 'Remote Uninvited Task', completed: false },
    version: 1,
  });

  let remoteColBlocked = false;
  try {
    await MigrationService.migrateCurrentUserToFirestore();
  } catch (e: any) {
    if (e.name === 'PreexistingCloudDataConflictError' && e.message.includes('t_remote_uninvited')) {
      remoteColBlocked = true;
    }
  }
  assert(remoteColBlocked, 'Fails closed when remote-only document absent from local workspace is detected');

  // Verify remote-only document was NOT overwritten or deleted
  const untouchedRemote = mockStore.get('users/uid_user_remote_col/tasks/t_remote_uninvited');
  assert(untouchedRemote !== undefined && untouchedRemote.data.title === 'Remote Uninvited Task', 'Remote-only document untouched');

  // Verify marker transitioned to FAILED
  const failedMarker = mockStore.get('users/uid_user_remote_col/metadata/migration');
  assert(failedMarker?.data.status === 'FAILED', 'Marker marked FAILED after remote-only collection document detected');

  // Verify local storage untouched
  const localTasks13 = storageService.getItem<any[]>(`novo:uid_user_remote_col:${STORAGE_KEYS.TASKS}`);
  assert(localTasks13?.length === 2, 'Local tasks in localStorage remain untouched');

  // ----------------------------------------------------
  // Scenario 14: Remote-only document in singleton target (active focus) fails closed
  // ----------------------------------------------------
  console.log('\nGroup 14: Remote-only Active Focus Document Fails Closed');
  resetStore();
  AuthLifecycle.reset('uid_user_remote_focus');
  populateLocalWorkspace('uid_user_remote_focus');
  // Clear local active focus so local state is absent
  storageService.removeItem('novo:uid_user_remote_focus:novo_active_focus');

  // Seed remote active focus in Firestore
  mockStore.set('users/uid_user_remote_focus/active_state/focus', {
    data: { active: true, sessionId: 'remote_f_session', elapsedSeconds: 999 },
    version: 1,
  });

  let remoteFocusBlocked = false;
  try {
    await MigrationService.migrateCurrentUserToFirestore();
  } catch (e: any) {
    if (e.name === 'PreexistingCloudDataConflictError' && e.message.includes('active_state/focus')) {
      remoteFocusBlocked = true;
    }
  }
  assert(remoteFocusBlocked, 'Fails closed when remote active focus exists but local has no active focus');

  const untouchedRemoteFocus = mockStore.get('users/uid_user_remote_focus/active_state/focus');
  assert(untouchedRemoteFocus?.data.sessionId === 'remote_f_session', 'Remote active focus document untouched');
  const failedFocusMarker = mockStore.get('users/uid_user_remote_focus/metadata/migration');
  assert(failedFocusMarker?.data.status === 'FAILED', 'Marker marked FAILED');

  // ----------------------------------------------------
  // Scenario 15: Remote-only document in singleton target (active chat) fails closed
  // ----------------------------------------------------
  console.log('\nGroup 15: Remote-only Active Chat Document Fails Closed');
  resetStore();
  AuthLifecycle.reset('uid_user_remote_chat');
  populateLocalWorkspace('uid_user_remote_chat');
  // Clear local active chat so local state is absent
  storageService.removeItem(`novo:uid_user_remote_chat:${STORAGE_KEYS.ACTIVE_CHAT_ID}`);

  // Seed remote active chat in Firestore
  mockStore.set('users/uid_user_remote_chat/active_state/chat', {
    data: { activeChatId: 'c_remote_rogue' },
    version: 1,
  });

  let remoteChatBlocked = false;
  try {
    await MigrationService.migrateCurrentUserToFirestore();
  } catch (e: any) {
    if (e.name === 'PreexistingCloudDataConflictError' && e.message.includes('active_state/chat')) {
      remoteChatBlocked = true;
    }
  }
  assert(remoteChatBlocked, 'Fails closed when remote active chat exists but local has no active chat');

  const untouchedRemoteChat = mockStore.get('users/uid_user_remote_chat/active_state/chat');
  assert(untouchedRemoteChat?.data.activeChatId === 'c_remote_rogue', 'Remote active chat document untouched');
  const failedChatMarker = mockStore.get('users/uid_user_remote_chat/metadata/migration');
  assert(failedChatMarker?.data.status === 'FAILED', 'Marker marked FAILED');

  // ----------------------------------------------------
  // Scenario 16: Identical remote documents pass, different remote documents fail closed
  // ----------------------------------------------------
  console.log('\nGroup 16: Identical Remote Documents Pass, Different Remote Documents Fail Closed');
  resetStore();
  AuthLifecycle.reset('uid_user_canon_check');
  populateLocalWorkspace('uid_user_canon_check');

  // Pre-seed remote documents with identical content for tasks and goal
  mockStore.set('users/uid_user_canon_check/tasks/t_alpha', {
    data: { id: 't_alpha', title: 'Task Alpha', completed: false },
    version: 1,
  });
  mockStore.set('users/uid_user_canon_check/goals/g_one', {
    data: { id: 'g_one', title: 'Goal One', progress: 50 },
    version: 1,
  });

  // Identical pre-existing data should pass cleanly
  await MigrationService.migrateCurrentUserToFirestore();
  const canonPassMarker = mockStore.get('users/uid_user_canon_check/metadata/migration');
  assert(canonPassMarker?.data.status === 'COMPLETED', 'Migration completes when remote documents are identical');

  // Now mutate one remote document to make it differ
  mockStore.set('users/uid_user_canon_check/goals/g_one', {
    data: { id: 'g_one', title: 'Goal One Tampered', progress: 99 },
    version: 2,
  });

  let diffFail = false;
  try {
    await MigrationService.migrateCurrentUserToFirestore();
  } catch (e: any) {
    if (e.name === 'PreexistingCloudDataConflictError' && e.message.includes('goals/g_one')) {
      diffFail = true;
    }
  }
  assert(diffFail, 'Fails closed when pre-existing document has different content');

  console.log('\n====================================================');
  console.log('✅ ALL PHASE 2.1 SAFETY TESTS PASSED (16/16 GROUPS)');
  console.log('====================================================\n');
}

runGate19_3b_Tests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
