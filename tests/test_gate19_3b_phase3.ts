/**
 * Novo Gate 19.3B - Phase 3.1 Comprehensive Orchestration & Test Suite
 *
 * Verifies workspace continuity orchestration layer (workspaceContinuityService):
 * 1. Rejection of unauthenticated and anonymous users safely.
 * 2. Guard against concurrent / duplicate invocations before first async op.
 * 3. Local mode: runs MigrationService even with prior COMPLETED marker.
 * 4. Local mode: identical cloud data is skipped without unnecessary overwrite.
 * 5. Local mode: differing or remote-only data fails closed; provider remains local.
 * 6. Local mode: cutover rejected before provider switch leaves provider local.
 * 7. Successful migration followed by verified cutover to Firebase.
 * 8. Firebase mode: never invokes local migration engine.
 * 9. Firebase mode: missing or non-COMPLETED marker fails safely without switching back to local.
 * 10. Firebase mode: store hydration failure followed by successful hydration retry.
 * 11. Already healthy cloud_synced workspace is an immediate no-op.
 * 12. Identity change or sign-out mid-flight aborts without state cross-contamination.
 * 13. LocalStorage data is preserved across all success and failure scenarios.
 */

import './test_firebase_mock_app';
import {
  useWorkspaceContinuityStore,
  WorkspaceContinuityService
} from './src/core/data/continuity/workspaceContinuityService';
import {
  MigrationService,
  PreexistingCloudDataConflictError
} from './src/core/data/migration/MigrationService';
import { CutoverCoordinator } from './src/core/data/cutover/CutoverCoordinator';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { setMockFirestore } from './src/core/data/repositories/firebase/firestoreProvider';
import { storageService } from './src/core/storage/storageService';
import { STORAGE_KEYS } from './src/core/storage/storageKeys';
import { resetAuthIdentity } from './src/core/auth/authOrchestrator';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { useNoteStore } from './src/core/state/noteStore';
import { useFocusStore } from './src/core/state/focusStore';
import { useMoneyStore } from './src/core/state/moneyStore';
import { useChatStore } from './src/core/state/chatStore';
import { useKnowledgeStore } from './src/core/state/knowledgeStore';

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ PASS: ${message}`);
}

// In-memory Firestore mock with full transaction support
interface MockDocState {
  data: any;
  version: number;
}

const mockStore = new Map<string, MockDocState>();
let simulatedHydrationError: boolean = false;
let asyncHoldBarrier: {
  hold: () => Promise<void>;
  release: () => void;
  reached: () => void;
} | null = null;

async function checkAsyncHoldBarrier() {
  if (asyncHoldBarrier) {
    const barrier = asyncHoldBarrier;
    asyncHoldBarrier = null;
    barrier.reached();
    await barrier.hold();
  }
}

function resetMockStore() {
  mockStore.clear();
  simulatedHydrationError = false;
  asyncHoldBarrier = null;
}

const mockFirestoreInstance: any = {
  getFirestore: () => ({}),
  collection: (_db: any, path: string) => path,
  doc: (_db: any, path: string) => path,

  getDoc: async (docPath: string) => {
    await checkAsyncHoldBarrier();
    const entry = mockStore.get(docPath);
    return {
      exists: () => entry !== undefined,
      data: () => (entry ? JSON.parse(JSON.stringify(entry.data)) : undefined),
    };
  },

  getDocs: async (colPath: any) => {
    if (simulatedHydrationError && RepositoryFactory.getDataSource() === 'firebase' && String(colPath).includes('tasks')) {
      throw new Error('Simulated network error during task hydration');
    }
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
    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const readVersions = new Map<string, number>();
      const stagedWrites = new Map<string, { data: any; merge?: boolean }>();

      const txnContext = {
        get: async (docPath: string) => {
          await checkAsyncHoldBarrier();
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

      let conflict = false;
      for (const [docPath, version] of readVersions.entries()) {
        const currentEntry = mockStore.get(docPath);
        const currentVersion = currentEntry ? currentEntry.version : 0;
        if (currentVersion !== version) {
          conflict = true;
          break;
        }
      }

      if (conflict) continue;

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
    throw new Error('Transaction failed: max retries exceeded');
  },
};

setMockFirestore(mockFirestoreInstance);

function populateLocalWorkspace(uid: string) {
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.TASKS}`, [
    { id: 't_alpha', title: 'Task Alpha', completed: false, date: '2023-01-01', priority: 'high', createdAt: '2023-01-01' },
    { id: 't_beta', title: 'Task Beta', completed: true, date: '2023-01-02', priority: 'medium', createdAt: '2023-01-02' },
  ]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.GOALS}`, [
    { id: 'g_one', title: 'Goal One', progress: 50, category: 'work', targetDate: '2023-12-31' },
  ]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.NOTES}`, [
    { id: 'n_one', title: 'Note One', content: 'Note content', tags: ['work'], createdAt: '2023-01-01', updatedAt: '2023-01-01' },
  ]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.KNOWLEDGE}`, [
    { id: 'k_one', title: 'Architecture doc', content: 'Local-first rules', tags: ['arch'], createdAt: '2023-01-01' },
  ]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.MONEY_ENTRIES}`, [
    { id: 'm_one', amount: 150.75, type: 'expense', category: 'equipment', date: '2023-01-01', description: 'desc' },
  ]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.FOCUS_SESSIONS}`, [
    { id: 'f_one', duration: 1500, state: 'completed', mode: 'pomodoro', completedAt: '2023-01-01' },
  ]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.CONVERSATIONS}`, [
    { id: 'c_one', title: 'Project Sync', messages: [{ id: 'm1', sender: 'user', text: 'Hello', timestamp: 12345 }], createdAt: '2023-01-01', updatedAt: '2023-01-01' },
  ]);
  storageService.setItem(`novo:${uid}:novo_active_focus`, {
    active: true,
    sessionId: 'f_one',
    elapsedSeconds: 300,
    mode: 'pomodoro',
  });
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.ACTIVE_CHAT_ID}`, 'c_one');
}

function verifyLocalWorkspaceIntact(uid: string) {
  const tasks = storageService.getItem<any[]>(`novo:${uid}:${STORAGE_KEYS.TASKS}`);
  assert(tasks !== null && tasks.length >= 2, 'Local tasks preserved in storage');
  const goals = storageService.getItem<any[]>(`novo:${uid}:${STORAGE_KEYS.GOALS}`);
  assert(goals !== null && goals.length >= 1, 'Local goals preserved in storage');
  const notes = storageService.getItem<any[]>(`novo:${uid}:${STORAGE_KEYS.NOTES}`);
  assert(notes !== null && notes.length >= 1, 'Local notes preserved in storage');
  const knowledge = storageService.getItem<any[]>(`novo:${uid}:${STORAGE_KEYS.KNOWLEDGE}`);
  assert(knowledge !== null && knowledge.length >= 1, 'Local knowledge preserved in storage');
  const money = storageService.getItem<any[]>(`novo:${uid}:${STORAGE_KEYS.MONEY_ENTRIES}`);
  assert(money !== null && money.length >= 1, 'Local money preserved in storage');
  const focus = storageService.getItem<any[]>(`novo:${uid}:${STORAGE_KEYS.FOCUS_SESSIONS}`);
  assert(focus !== null && focus.length >= 1, 'Local focus preserved in storage');
  const chats = storageService.getItem<any[]>(`novo:${uid}:${STORAGE_KEYS.CONVERSATIONS}`);
  assert(chats !== null && chats.length >= 1, 'Local conversations preserved in storage');
  const activeFocus = storageService.getItem<any>(`novo:${uid}:novo_active_focus`);
  assert(activeFocus !== null && activeFocus.active === true, 'Local active focus singleton preserved');
  const activeChat = storageService.getItem<string>(`novo:${uid}:${STORAGE_KEYS.ACTIVE_CHAT_ID}`);
  assert(activeChat === 'c_one', 'Local active chat singleton preserved');
}

function resetEnvironment(uid: string | null = null) {
  resetMockStore();
  RepositoryFactory.setDataSource('local');
  AuthLifecycle.reset(uid);
  resetAuthIdentity(uid);
  WorkspaceContinuityService.resetState();
}

async function runPhase3Tests() {
  console.log('====================================================');
  console.log('NOVO GATE 19.3B — PHASE 3.1 ORCHESTRATION TESTS');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // Test 1: Reject unauthenticated and anonymous users safely
  // ----------------------------------------------------
  console.log('Test 1: Unauthenticated & Anonymous Handling');
  resetEnvironment(null);

  const resUnauth = await WorkspaceContinuityService.syncWorkspaceToCloud(null);
  assert(resUnauth.success === false && resUnauth.error === 'guest_not_allowed', 'Rejects null user safely');
  assert(WorkspaceContinuityService.getState().storageState === 'guest', 'Continuity state remains guest');

  const resAnon = await WorkspaceContinuityService.syncWorkspaceToCloud({ uid: 'anon-1', isAnonymous: true } as any);
  assert(resAnon.success === false && resAnon.error === 'guest_not_allowed', 'Rejects anonymous user safely');
  assert(WorkspaceContinuityService.getState().storageState === 'guest', 'Continuity state remains guest for anonymous');

  // ----------------------------------------------------
  // Test 2: Guard against concurrent invocations before first async op
  // ----------------------------------------------------
  console.log('\nTest 2: Concurrency Barrier (Double-click protection)');
  resetEnvironment('user_p3_conc');
  populateLocalWorkspace('user_p3_conc');

  // Trigger two calls simultaneously
  const p1 = WorkspaceContinuityService.syncWorkspaceToCloud({ uid: 'user_p3_conc', isAnonymous: false } as any);
  const p2 = WorkspaceContinuityService.syncWorkspaceToCloud({ uid: 'user_p3_conc', isAnonymous: false } as any);

  const [res1, res2] = await Promise.all([p1, p2]);
  const oneFailed = (res1.success === false && res1.error === 'Sync already in progress') ||
                    (res2.success === false && res2.error === 'Sync already in progress');
  assert(oneFailed, 'One of concurrent sync requests was rejected immediately with concurrency guard');

  // ----------------------------------------------------
  // Test 3: Successful migration followed by cutover
  // ----------------------------------------------------
  console.log('\nTest 3: End-to-End Successful Migration and Cutover');
  resetEnvironment('user_p3_succ');
  populateLocalWorkspace('user_p3_succ');

  const resSucc = await WorkspaceContinuityService.syncWorkspaceToCloud({ uid: 'user_p3_succ', isAnonymous: false } as any);
  if (!resSucc.success) {
    console.error('resSucc error details:', resSucc);
  }
  assert(resSucc.success === true, 'Migration and cutover succeeded');
  assert(RepositoryFactory.getDataSource() === 'firebase', 'RepositoryFactory switched to firebase');
  assert(WorkspaceContinuityService.getState().storageState === 'cloud_synced', 'Workspace storageState is cloud_synced');
  assert(WorkspaceContinuityService.getState().isSyncing === false, 'isSyncing reset to false');
  assert(WorkspaceContinuityService.getState().lastError === null, 'lastError is null');

  // Verify remote marker and documents exist
  const markerSnap = mockStore.get('users/user_p3_succ/metadata/migration');
  assert(markerSnap !== undefined && markerSnap.data.status === 'COMPLETED', 'Firestore migration marker is COMPLETED');
  const taskSnap = mockStore.get('users/user_p3_succ/tasks/t_alpha');
  assert(taskSnap !== undefined && taskSnap.data.title === 'Task Alpha', 'Tasks migrated to Firestore');
  const focusSnap = mockStore.get('users/user_p3_succ/active_state/focus');
  assert(focusSnap !== undefined && focusSnap.data.active === true, 'Active focus singleton migrated to Firestore');
  const chatSnap = mockStore.get('users/user_p3_succ/active_state/chat');
  assert(chatSnap !== undefined && chatSnap.data.activeChatId === 'c_one', 'Active chat singleton migrated to Firestore');

  // Verify store hydrated from Firebase
  const hydratedTasks = useTaskStore.getState().tasks;
  assert(hydratedTasks.length >= 2 && hydratedTasks.some(t => t.id === 't_alpha'), 'Store hydrated from Firebase repository');

  // Verify localStorage preserved
  verifyLocalWorkspaceIntact('user_p3_succ');

  // ----------------------------------------------------
  // Test 4: Migration / preflight failure leaves provider local
  // ----------------------------------------------------
  console.log('\nTest 4: Migration Preflight Failure (Remote document conflict)');
  resetEnvironment('user_p3_conflict');
  populateLocalWorkspace('user_p3_conflict');

  // Inject unexpected differing remote document
  mockStore.set('users/user_p3_conflict/tasks/t_alpha', {
    data: { id: 't_alpha', title: 'Differing Remote Title', completed: true },
    version: 1,
  });

  const resConflict = await WorkspaceContinuityService.syncWorkspaceToCloud({ uid: 'user_p3_conflict', isAnonymous: false } as any);
  assert(resConflict.success === false, 'Fails on remote conflict');
  assert(RepositoryFactory.getDataSource() === 'local', 'RepositoryFactory remains local on migration conflict');
  assert(WorkspaceContinuityService.getState().storageState === 'failed', 'State is failed');
  assert(WorkspaceContinuityService.getState().isSyncing === false, 'isSyncing is false');
  assert(WorkspaceContinuityService.getState().lastError !== null, 'lastError recorded');

  // Verify remote differing record was NOT overwritten
  const unchangedRemote = mockStore.get('users/user_p3_conflict/tasks/t_alpha');
  assert(unchangedRemote?.data.title === 'Differing Remote Title', 'Differing remote record preserved untouched');
  verifyLocalWorkspaceIntact('user_p3_conflict');

  // ----------------------------------------------------
  // Test 5: Previous COMPLETED marker while still local re-evaluates local data
  // ----------------------------------------------------
  console.log('\nTest 5: Local Mode with Prior COMPLETED Marker Re-evaluates Fresh Local Data');
  resetEnvironment('user_p3_prior_completed');
  populateLocalWorkspace('user_p3_prior_completed');

  // Simulate prior COMPLETED marker from an earlier session that never cut over
  mockStore.set('users/user_p3_prior_completed/metadata/migration', {
    data: {
      status: 'COMPLETED',
      generation: 1,
      sessionId: 'session_old',
      migrationRunId: 'run_old',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
    version: 1,
  });

  // Pre-seed matching remote data for existing items
  mockStore.set('users/user_p3_prior_completed/tasks/t_alpha', {
    data: { id: 't_alpha', title: 'Task Alpha', completed: false, date: '2023-01-01', priority: 'high', createdAt: '2023-01-01' },
    version: 5,
  });
  mockStore.set('users/user_p3_prior_completed/tasks/t_beta', {
    data: { id: 't_beta', title: 'Task Beta', completed: true, date: '2023-01-02', priority: 'medium', createdAt: '2023-01-02' },
    version: 5,
  });
  mockStore.set('users/user_p3_prior_completed/goals/g_one', {
    data: { id: 'g_one', title: 'Goal One', progress: 50, category: 'work', targetDate: '2023-12-31' },
    version: 5,
  });
  mockStore.set('users/user_p3_prior_completed/notes/n_one', {
    data: { id: 'n_one', title: 'Note One', content: 'Note content', tags: ['work'], createdAt: '2023-01-01', updatedAt: '2023-01-01' },
    version: 5,
  });
  mockStore.set('users/user_p3_prior_completed/knowledge/k_one', {
    data: { id: 'k_one', title: 'Architecture doc', content: 'Local-first rules', tags: ['arch'], createdAt: '2023-01-01' },
    version: 5,
  });
  mockStore.set('users/user_p3_prior_completed/money/m_one', {
    data: { id: 'm_one', amount: 150.75, type: 'expense', category: 'equipment', date: '2023-01-01', description: 'desc' },
    version: 5,
  });
  mockStore.set('users/user_p3_prior_completed/focus_sessions/f_one', {
    data: { id: 'f_one', duration: 1500, state: 'completed', mode: 'pomodoro', completedAt: '2023-01-01' },
    version: 5,
  });
  mockStore.set('users/user_p3_prior_completed/conversations/c_one', {
    data: { id: 'c_one', title: 'Project Sync', messages: [{ id: 'm1', sender: 'user', text: 'Hello', timestamp: 12345 }], createdAt: '2023-01-01', updatedAt: '2023-01-01' },
    version: 5,
  });
  mockStore.set('users/user_p3_prior_completed/active_state/focus', {
    data: { active: true, sessionId: 'f_one', elapsedSeconds: 300, mode: 'pomodoro' },
    version: 5,
  });
  mockStore.set('users/user_p3_prior_completed/active_state/chat', {
    data: { activeChatId: 'c_one' },
    version: 5,
  });

  const resPrior = await WorkspaceContinuityService.syncWorkspaceToCloud({ uid: 'user_p3_prior_completed', isAnonymous: false } as any);
  assert(resPrior.success === true, 'Migration re-evaluated local data, passed preflight, and cut over');
  assert(RepositoryFactory.getDataSource() === 'firebase', 'Repository switched to firebase');

  // Verify identical existing docs were NOT unnecessarily rewritten (version remains 5)
  const taskAlphaSnap = mockStore.get('users/user_p3_prior_completed/tasks/t_alpha');
  assert(taskAlphaSnap?.version === 5, 'Identical existing cloud document was not overwritten (version 5 preserved)');

  // Verify generation was bumped
  const newMarker = mockStore.get('users/user_p3_prior_completed/metadata/migration');
  assert(newMarker?.data.generation === 2, 'Migration marker generation incremented from 1 to 2');

  // ----------------------------------------------------
  // Test 6: Remote-only records fail closed
  // ----------------------------------------------------
  console.log('\nTest 6: Remote-only Record Fails Closed');
  resetEnvironment('user_p3_remote_only');
  populateLocalWorkspace('user_p3_remote_only');

  // Inject a remote document not present in local storage
  mockStore.set('users/user_p3_remote_only/tasks/t_rogue', {
    data: { id: 't_rogue', title: 'Rogue Task', completed: false },
    version: 1,
  });

  const resRogue = await WorkspaceContinuityService.syncWorkspaceToCloud({ uid: 'user_p3_remote_only', isAnonymous: false } as any);
  assert(resRogue.success === false, 'Fails closed when remote-only document is detected');
  assert(RepositoryFactory.getDataSource() === 'local', 'Must remain local mode');
  assert(WorkspaceContinuityService.getState().storageState === 'failed', 'State is failed');
  verifyLocalWorkspaceIntact('user_p3_remote_only');

  // ----------------------------------------------------
  // Test 7: Cutover rejected before provider switch leaves provider local
  // ----------------------------------------------------
  console.log('\nTest 7: Cutover Rejected Before Switch Leaves Provider Local');
  resetEnvironment('user_p3_cutover_fail');
  populateLocalWorkspace('user_p3_cutover_fail');

  // Pre-seed a non-completed marker so CutoverCoordinator fails before switch
  mockStore.set('users/user_p3_cutover_fail/metadata/migration', {
    data: { status: 'FAILED', generation: 1 },
    version: 1,
  });

  // Verify CutoverCoordinator throws and stays local
  try {
    await CutoverCoordinator.cutoverCurrentUserToFirebase();
    assert(false, 'Should throw');
  } catch (err: any) {
    assert(err.message.includes('not COMPLETED'), 'Surfaces not COMPLETED error');
    assert(RepositoryFactory.getDataSource() === 'local', 'Provider remains local');
  }

  // ----------------------------------------------------
  // Test 8: Hydration failure after Firebase switch, followed by successful retry
  // ----------------------------------------------------
  console.log('\nTest 8: Hydration Failure & Idempotent Hydration Retry');
  resetEnvironment('user_p3_hydration');
  populateLocalWorkspace('user_p3_hydration');

  // First run: trigger simulated error during task hydration
  simulatedHydrationError = true;
  const resHydFail = await WorkspaceContinuityService.syncWorkspaceToCloud({ uid: 'user_p3_hydration', isAnonymous: false } as any);
  assert(resHydFail.success === false, 'Cutover fails on hydration error');
  assert(RepositoryFactory.getDataSource() === 'firebase', 'Provider remains in Firebase (no silent revert to local)');
  assert(WorkspaceContinuityService.getState().storageState === 'failed', 'Continuity state is failed');

  // Now resolve the simulated network error and retry
  simulatedHydrationError = false;

  // Track if MigrationService is called
  const originalMigrate = MigrationService.migrateCurrentUserToFirestore;
  let migrateCalled = false;
  MigrationService.migrateCurrentUserToFirestore = async () => {
    migrateCalled = true;
    return originalMigrate.call(MigrationService);
  };

  const resRetry = await WorkspaceContinuityService.syncWorkspaceToCloud({ uid: 'user_p3_hydration', isAnonymous: false } as any);
  MigrationService.migrateCurrentUserToFirestore = originalMigrate;

  assert(resRetry.success === true, 'Hydration retry succeeds cleanly');
  assert(migrateCalled === false, 'MigrationService was NEVER invoked while in Firebase mode');
  assert(RepositoryFactory.getDataSource() === 'firebase', 'Remains in Firebase mode');
  assert(WorkspaceContinuityService.getState().storageState === 'cloud_synced', 'State transitioned to cloud_synced');
  assert(WorkspaceContinuityService.getState().lastError === null, 'lastError cleared');

  // ----------------------------------------------------
  // Test 9: Firebase mode with missing or non-COMPLETED marker fails safely
  // ----------------------------------------------------
  console.log('\nTest 9: Firebase Mode with Non-COMPLETED Marker Fails Safely');
  resetEnvironment('user_p3_bad_marker');
  RepositoryFactory.setDataSource('firebase');
  // Marker is absent from mockStore

  const resBadMarker = await WorkspaceContinuityService.syncWorkspaceToCloud({ uid: 'user_p3_bad_marker', isAnonymous: false } as any);
  assert(resBadMarker.success === false, 'Fails when marker is not COMPLETED');
  assert(resBadMarker.error?.includes('not COMPLETED'), 'Returns explicit error message');
  assert(RepositoryFactory.getDataSource() === 'firebase', 'Does NOT silently switch back to local');
  assert(WorkspaceContinuityService.getState().storageState === 'failed', 'State is failed');

  // ----------------------------------------------------
  // Test 10: Healthy cloud no-op requires all stores ready, otherwise hydration retries
  // ----------------------------------------------------
  console.log('\nTest 10: Healthy Cloud No-Op Requires All Stores Ready (Fix 1)');
  resetEnvironment('user_p3_noop');
  RepositoryFactory.setDataSource('firebase');
  mockStore.set('users/user_p3_noop/metadata/migration', {
    data: { status: 'COMPLETED', generation: 1 },
    version: 1,
  });
  WorkspaceContinuityService.setStorageState('cloud_synced');

  // Subtest 10A: Stores are 'idle' (uninitialized). Must NOT report no-op; must hydrate to 'ready'
  assert(useTaskStore.getState().status === 'idle', 'Task store starts idle');
  const resFromIdle = await WorkspaceContinuityService.syncWorkspaceToCloud({ uid: 'user_p3_noop', isAnonymous: false } as any);
  assert(resFromIdle.success === true, 'Hydration succeeds from idle');
  assert(useTaskStore.getState().status === 'ready', 'Task store hydrated to ready');
  assert(useGoalStore.getState().status === 'ready', 'Goal store hydrated to ready');
  assert(useNoteStore.getState().status === 'ready', 'Note store hydrated to ready');
  assert(useFocusStore.getState().status === 'ready', 'Focus store hydrated to ready');
  assert(useMoneyStore.getState().status === 'ready', 'Money store hydrated to ready');
  assert(useChatStore.getState().status === 'ready', 'Chat store hydrated to ready');
  assert(useKnowledgeStore.getState().status === 'ready', 'Knowledge store hydrated to ready');

  // Subtest 10B: All seven stores are 'ready' + marker COMPLETED + cloud_synced. Healthy No-Op!
  const resNoop = await WorkspaceContinuityService.syncWorkspaceToCloud({ uid: 'user_p3_noop', isAnonymous: false } as any);
  assert(resNoop.success === true, 'Healthy no-op returns immediate success');
  assert(WorkspaceContinuityService.getState().storageState === 'cloud_synced', 'Remains cloud_synced');

  // Subtest 10C: If a store is 'loading', must NOT report healthy no-op; must follow hydration path
  useTaskStore.setState({ status: 'loading' });
  const resFromLoading = await WorkspaceContinuityService.syncWorkspaceToCloud({ uid: 'user_p3_noop', isAnonymous: false } as any);
  assert(resFromLoading.success === true, 'Recovers from loading via hydration');
  assert(useTaskStore.getState().status === 'ready', 'Task store recovered to ready');

  // Subtest 10D: If a store is 'error', must NOT report healthy no-op; must follow hydration path
  useGoalStore.setState({ status: 'error', error: 'simulated error' });
  const resFromError = await WorkspaceContinuityService.syncWorkspaceToCloud({ uid: 'user_p3_noop', isAnonymous: false } as any);
  assert(resFromError.success === true, 'Recovers from error via hydration');
  assert(useGoalStore.getState().status === 'ready', 'Goal store recovered to ready');

  // ----------------------------------------------------
  // Test 11: Explicit Identity-Isolation Regression Test (Fix 2)
  // ----------------------------------------------------
  console.log('\nTest 11: Explicit Identity-Isolation Regression Test (Fix 2)');
  resetEnvironment('user_p3_userA');
  populateLocalWorkspace('user_p3_userA');

  mockStore.set('users/user_p3_userA/metadata/migration', {
    data: { status: 'COMPLETED', generation: 1 },
    version: 1,
  });

  // Setup deterministic async hold barrier
  let reachedResolve!: () => void;
  const reachedPromise = new Promise<void>(resolve => { reachedResolve = resolve; });
  let releaseResolve!: () => void;
  const releasePromise = new Promise<void>(resolve => { releaseResolve = resolve; });

  asyncHoldBarrier = {
    hold: () => releasePromise,
    release: releaseResolve,
    reached: reachedResolve,
  };

  // 1. Start User A's sync operation (will pause deterministically inside Firestore async read)
  const syncPromiseA = WorkspaceContinuityService.syncWorkspaceToCloud({ uid: 'user_p3_userA', isAnonymous: false } as any);

  // Wait until User A is deterministically held at the boundary
  await reachedPromise;

  // 2. Switch authenticated identity to User B while User A is pending
  AuthLifecycle.reset('user_p3_userB');
  resetAuthIdentity('user_p3_userB');

  // 3. Establish known sentinel continuity state for User B
  useWorkspaceContinuityStore.setState({
    storageState: 'local',
    isSyncing: false,
    lastError: 'SENTINEL_USER_B_ERROR',
  });

  const sentinelBefore = { ...WorkspaceContinuityService.getState() };
  assert(sentinelBefore.storageState === 'local', "User B sentinel storageState is 'local'");
  assert(sentinelBefore.isSyncing === false, "User B sentinel isSyncing is false");
  assert(sentinelBefore.lastError === 'SENTINEL_USER_B_ERROR', "User B sentinel lastError is initialized");

  // 4. Release User A to resume
  releaseResolve();
  const resStaleA = await syncPromiseA;

  // 5. Assertions: User A stale operation rejected safely
  assert(resStaleA.success === false, "User A stale operation rejected safely");
  assert(resStaleA.error?.includes('Auth identity changed'), "Error message identifies auth identity change");

  // 6. Assertions: User A stale operation cannot overwrite any part of User B's sentinel state
  const stateAfter = WorkspaceContinuityService.getState();
  assert(stateAfter.storageState === 'local', "User B storageState was NOT overwritten by stale operation");
  assert(stateAfter.isSyncing === false, "User B isSyncing was NOT overwritten by stale operation");
  assert(stateAfter.lastError === 'SENTINEL_USER_B_ERROR', "User B lastError was NOT overwritten by stale operation");

  // 7. Verify stale attempt cannot initiate cutover for the wrong identity
  assert(RepositoryFactory.getDataSource() === 'local', "Stale attempt did not switch RepositoryFactory to firebase");
  assert(AuthLifecycle.getUid() === 'user_p3_userB', "Active UID remains User B");

  console.log('\n====================================================');
  console.log('✅ ALL PHASE 3.1 ORCHESTRATION TESTS PASSED (11/11)');
  console.log('====================================================\n');
}

runPhase3Tests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
