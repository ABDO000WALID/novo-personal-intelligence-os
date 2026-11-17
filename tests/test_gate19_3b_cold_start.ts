/**
 * Novo Gate 19.3B - Post-Reload Cold-Start Hydration Regression Test Suite
 *
 * Verifies:
 * 1. Completed migration marker: app loading remains active until cutover and all store initialization promises have settled.
 * 2. No completed marker: provider remains local and migration is not automatically invoked.
 * 3. Real hydration failure: loading eventually resolves safely and error remains visible rather than claiming success.
 * 4. Auth identity changes from A to B during a held marker lookup: stale A callback cannot replace B's user or release B's loading state.
 * 5. Sign-out during a held lookup: stale callback cannot restore signed-in user.
 * 6. No destructive localStorage behavior.
 * 7. Confirm all seven stores and both active singleton states are initialized through existing cutover path.
 */

import './test_firebase_mock_app';
import { handleAuthStateChange } from './src/core/auth/initAuth';
import { useAuthStore } from './src/core/auth/authStore';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { setMockFirestore } from './src/core/data/repositories/firebase/firestoreProvider';
import { useWorkspaceContinuityStore } from './src/core/data/continuity/workspaceContinuityService';
import { MigrationService } from './src/core/data/migration/MigrationService';
import { CutoverCoordinator } from './src/core/data/cutover/CutoverCoordinator';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { useNoteStore } from './src/core/state/noteStore';
import { useFocusStore } from './src/core/state/focusStore';
import { useMoneyStore } from './src/core/state/moneyStore';
import { useChatStore } from './src/core/state/chatStore';
import { useKnowledgeStore } from './src/core/state/knowledgeStore';
import { storageService } from './src/core/storage/storageService';

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ PASS: ${message}`);
}

// In-memory Firestore mock
const mockDb: Record<string, any> = {};
let getDocHook: ((path: string) => Promise<void> | void) | null = null;
let getDocsHook: ((path: string) => Promise<void> | void) | null = null;
let simulateHydrationError: boolean = false;

const mockFirestore: any = {
  getFirestore: () => ({}),
  doc: (_db: any, path: string) => path,
  collection: (_db: any, path: string) => path,
  getDoc: async (docRef: string) => {
    if (getDocHook) await getDocHook(docRef);
    const parts = docRef.split('/');
    const col = parts.slice(0, parts.length - 1).join('/');
    const id = parts[parts.length - 1];
    const exists = mockDb[col] && mockDb[col][id] !== undefined;
    return {
      exists: () => exists,
      data: () => (exists ? JSON.parse(JSON.stringify(mockDb[col][id])) : undefined),
    };
  },
  getDocs: async (colRef: string) => {
    if (getDocsHook) await getDocsHook(colRef);
    if (simulateHydrationError && String(colRef).includes('tasks')) {
      throw new Error('Simulated network failure during Firestore task hydration');
    }
    const docs = mockDb[colRef] || {};
    return {
      docs: Object.keys(docs).map(id => ({
        id,
        data: () => JSON.parse(JSON.stringify(docs[id])),
      })),
    };
  },
  setDoc: async (docRef: string, data: any) => {
    const parts = docRef.split('/');
    const col = parts.slice(0, parts.length - 1).join('/');
    const id = parts[parts.length - 1];
    if (!mockDb[col]) mockDb[col] = {};
    mockDb[col][id] = JSON.parse(JSON.stringify(data));
  },
  writeBatch: () => ({ set: () => {}, delete: () => {}, commit: async () => {} }),
  deleteDoc: async () => {},
};

setMockFirestore(mockFirestore);

function resetEnvironment() {
  handleAuthStateChange(null);
  RepositoryFactory.setDataSource('local');
  Object.keys(mockDb).forEach(k => delete mockDb[k]);
  getDocHook = null;
  getDocsHook = null;
  simulateHydrationError = false;
  useWorkspaceContinuityStore.getState().resetState();
}

async function runColdStartTests() {
  console.log('====================================================');
  console.log('NOVO GATE 19.3B — COLD-START HYDRATION REGRESSION TESTS');
  console.log('====================================================');

  // Test 1: Completed migration marker: app loading remains active until cutover and all stores settle
  console.log('\nTest 1: App loading remains active during COMPLETED cutover and store hydration');
  resetEnvironment();

  const testUid1 = 'cold_start_user_1';
  mockDb[`users/${testUid1}/metadata`] = {
    migration: {
      status: 'COMPLETED',
      version: 1,
      itemCounts: {
        tasks: 1,
        goals: 1,
        notes: 1,
        knowledge: 1,
        money: 1,
        focusSessions: 1,
        conversations: 1,
        activeFocus: 1,
        activeChat: 1,
        total: 9,
      },
    },
  };

  // Seed sample cloud data for all 7 domains and 2 singletons
  mockDb[`users/${testUid1}/tasks`] = { 't1': { id: 't1', title: 'Cloud Task 1', completed: false, date: '2026-10-12', priority: 'high', createdAt: '' } };
  mockDb[`users/${testUid1}/goals`] = { 'g1': { id: 'g1', title: 'Cloud Goal 1', progress: 50, createdAt: '', updatedAt: '' } };
  mockDb[`users/${testUid1}/notes`] = { 'n1': { id: 'n1', title: 'Cloud Note 1', content: 'Notes', createdAt: '', updatedAt: '' } };
  mockDb[`users/${testUid1}/knowledge`] = { 'k1': { id: 'k1', title: 'Cloud Knowledge 1', content: '', category: 'General', tags: [], createdAt: '', updatedAt: '' } };
  mockDb[`users/${testUid1}/money`] = { 'm1': { id: 'm1', amount: 100, type: 'income', category: 'General', date: '2026-10-12', description: 'Salary' } };
  mockDb[`users/${testUid1}/focus_sessions`] = { 'f1': { id: 'f1', mode: 'pomodoro', durationMinutes: 25, completedAt: '2026-10-12T00:00:00Z', notes: '' } };
  mockDb[`users/${testUid1}/conversations`] = { 'c1': { id: 'c1', title: 'Cloud Chat 1', messages: [], createdAt: '', updatedAt: '' } };
  mockDb[`users/${testUid1}/active_state`] = {
    focus: { mode: 'stopwatch', status: 'running', startedAt: new Date().toISOString(), durationSeconds: 0, totalPausedMs: 0 },
    chat: { activeChatId: 'c1' },
  };

  let markerLookupStarted = false;
  let resolveMarkerLookup: any;
  const markerLookupPromise = new Promise(r => { resolveMarkerLookup = r; });

  getDocHook = async (path: string) => {
    if (path.includes('metadata/migration')) {
      markerLookupStarted = true;
      await markerLookupPromise;
    }
  };

  const authChangePromise = handleAuthStateChange({ uid: testUid1 } as any);

  // Verify that while marker lookup is in flight, app loading gate is ACTIVE
  assert(useAuthStore.getState().loading === true, 'Loading gate is ACTIVE during marker lookup');
  assert(RepositoryFactory.getDataSource() === 'local', 'RepositoryFactory is local before cutover');

  // Now release marker lookup
  resolveMarkerLookup();
  await authChangePromise;

  // After completion:
  assert(useAuthStore.getState().loading === false, 'Loading gate is RELEASED after cutover completes');
  assert(RepositoryFactory.getDataSource() === 'firebase', 'RepositoryFactory is switched to firebase');
  assert(useTaskStore.getState().status === 'ready', 'TaskStore is ready');
  assert(useGoalStore.getState().status === 'ready', 'GoalStore is ready');
  assert(useNoteStore.getState().status === 'ready', 'NoteStore is ready');
  assert(useFocusStore.getState().status === 'ready', 'FocusStore is ready');
  assert(useMoneyStore.getState().status === 'ready', 'MoneyStore is ready');
  assert(useChatStore.getState().status === 'ready', 'ChatStore is ready');
  assert(useKnowledgeStore.getState().status === 'ready', 'KnowledgeStore is ready');
  assert(useFocusStore.getState().activeState !== null, 'Active focus singleton restored');
  assert(useChatStore.getState().activeConversationId === 'c1', 'Active chat singleton restored');

  // Verify workspace continuity status check resolves healthy cloud_synced
  const continuityStatus = await useWorkspaceContinuityStore.getState().checkStatus({ uid: testUid1 } as any);
  assert(continuityStatus === 'cloud_synced', 'Workspace continuity status is cloud_synced');
  assert(useWorkspaceContinuityStore.getState().lastError === null, 'lastError is null');

  // Test 2: No completed marker: provider remains local and migration is not automatically invoked
  console.log('\nTest 2: No completed marker retains local mode and does not auto-migrate');
  resetEnvironment();

  const testUid2 = 'cold_start_user_2';
  // No marker in mockDb
  let migrationServiceInvoked = false;
  const origMigrate = MigrationService.migrateCurrentUserToFirestore;
  MigrationService.migrateCurrentUserToFirestore = async () => {
    migrationServiceInvoked = true;
    return origMigrate.apply(MigrationService, [] as any);
  };

  try {
    await handleAuthStateChange({ uid: testUid2 } as any);

    assert(useAuthStore.getState().loading === false, 'Loading gate released for user with no marker');
    assert(RepositoryFactory.getDataSource() === 'local', 'Provider remains local when no COMPLETED marker');
    assert(migrationServiceInvoked === false, 'MigrationService was NOT automatically invoked');
    const continuityStatus2 = await useWorkspaceContinuityStore.getState().checkStatus({ uid: testUid2 } as any);
    assert(continuityStatus2 === 'local', 'Continuity state is local');
  } finally {
    MigrationService.migrateCurrentUserToFirestore = origMigrate;
  }

  // Test 3: Real hydration failure: loading eventually resolves safely and error remains visible
  console.log('\nTest 3: Real hydration failure surfaces safely and releases loading gate');
  resetEnvironment();

  const testUid3 = 'cold_start_user_3';
  mockDb[`users/${testUid3}/metadata`] = {
    migration: { status: 'COMPLETED', version: 1 },
  };
  simulateHydrationError = true;

  await handleAuthStateChange({ uid: testUid3 } as any);

  assert(useAuthStore.getState().loading === false, 'Loading gate released even when cutover fails');
  assert(RepositoryFactory.getDataSource() === 'firebase', 'Remains in Firebase mode on hydration failure (does not hide error)');
  assert(useTaskStore.getState().status === 'error', 'Failed store reports status error');

  const continuityStatus3 = await useWorkspaceContinuityStore.getState().checkStatus({ uid: testUid3 } as any);
  assert(continuityStatus3 === 'failed', 'Continuity state is failed on hydration failure');
  assert(useWorkspaceContinuityStore.getState().lastError !== null, 'lastError recorded');

  // Test 4: Auth identity changes from A to B during held marker lookup
  console.log('\nTest 4: User A -> User B identity change during held lookup fences stale A callback');
  resetEnvironment();

  const userA = 'user_race_A';
  const userB = 'user_race_B';
  mockDb[`users/${userA}/metadata`] = { migration: { status: 'COMPLETED' } };
  mockDb[`users/${userB}/metadata`] = { migration: { status: 'COMPLETED' } };
  mockDb[`users/${userB}/tasks`] = { 'tb': { id: 'tb', title: 'User B Task' } };

  let resolveAMarker: any;
  const pAMarker = new Promise(r => { resolveAMarker = r; });

  getDocHook = async (path: string) => {
    if (path.includes(userA)) {
      await pAMarker;
    }
  };

  const promiseA = handleAuthStateChange({ uid: userA } as any);
  // While A is waiting, B logs in
  const promiseB = handleAuthStateChange({ uid: userB } as any);

  // Release A's marker lookup
  resolveAMarker();
  await Promise.all([promiseA, promiseB]);

  assert(AuthLifecycle.getUid() === userB, 'Current UID is User B');
  assert(useAuthStore.getState().user?.uid === userB, 'useAuthStore user is User B');
  assert(useAuthStore.getState().loading === false, 'Loading gate is released for User B');
  assert(RepositoryFactory.getDataSource() === 'firebase', 'RepositoryFactory is bound to User B');

  // Test 5: Sign-out during held marker lookup
  console.log('\nTest 5: Sign-out during held lookup fences stale callback from restoring user');
  resetEnvironment();

  const userLogoutTest = 'user_logout_race';
  mockDb[`users/${userLogoutTest}/metadata`] = { migration: { status: 'COMPLETED' } };

  let resolveLogoutMarker: any;
  const pLogoutMarker = new Promise(r => { resolveLogoutMarker = r; });

  getDocHook = async (path: string) => {
    if (path.includes(userLogoutTest)) {
      await pLogoutMarker;
    }
  };

  const promiseLogin = handleAuthStateChange({ uid: userLogoutTest } as any);
  const promiseLogout = handleAuthStateChange(null);

  resolveLogoutMarker();
  await Promise.all([promiseLogin, promiseLogout]);

  assert(AuthLifecycle.getUid() === null, 'AuthLifecycle UID is null');
  assert(useAuthStore.getState().user === null, 'useAuthStore user is null (signed out)');
  assert(useAuthStore.getState().loading === false, 'Loading gate is released');
  assert(RepositoryFactory.getDataSource() === 'local', 'RepositoryFactory reverted to local on sign out');

  // Test 6: LocalStorage preservation across all operations
  console.log('\nTest 6: LocalStorage remains intact across reload and cutover');
  resetEnvironment();

  const testUid6 = 'cold_start_user_6';
  // Seed local storage with distinct user-6 data
  storageService.setItem(`novo:${testUid6}:novo_v1_tasks`, [{ id: 'local-task-6', title: 'Preserved Local Task' }]);
  storageService.setItem(`novo:${testUid6}:novo_focus_active`, { mode: 'pomodoro', status: 'running', startedAt: '2026-10-12T00:00:00Z', durationSeconds: 1500, totalPausedMs: 0 });

  mockDb[`users/${testUid6}/metadata`] = { migration: { status: 'COMPLETED' } };
  mockDb[`users/${testUid6}/tasks`] = { 'cloud-t6': { id: 'cloud-t6', title: 'Cloud Task 6' } };

  await handleAuthStateChange({ uid: testUid6 } as any);

  // Verify local storage was not wiped
  const preservedTasks = storageService.getItem<any[]>(`novo:${testUid6}:novo_v1_tasks`);
  assert(preservedTasks !== null && preservedTasks.length === 1 && preservedTasks[0].id === 'local-task-6', 'Local tasks preserved intact in localStorage');
  const preservedFocus = storageService.getItem<any>(`novo:${testUid6}:novo_focus_active`);
  assert(preservedFocus !== null && preservedFocus.mode === 'pomodoro', 'Local active focus preserved in localStorage');

  // Test 7: Same-UID auth event race while marker lookup is held
  console.log('\nTest 7: Same-UID auth event race does not leak loading gate or cause duplicate cutover');
  resetEnvironment();

  const sameUserUid = 'same_user_race_test';
  mockDb[`users/${sameUserUid}/metadata`] = {
    migration: { status: 'COMPLETED', version: 1 },
  };
  mockDb[`users/${sameUserUid}/tasks`] = { 't1': { id: 't1', title: 'Task 1', completed: false, date: '2026-10-13', priority: 'medium', createdAt: '' } };
  mockDb[`users/${sameUserUid}/goals`] = { 'g1': { id: 'g1', title: 'Goal 1', progress: 0, createdAt: '', updatedAt: '' } };
  mockDb[`users/${sameUserUid}/notes`] = { 'n1': { id: 'n1', title: 'Note 1', content: '', createdAt: '', updatedAt: '' } };
  mockDb[`users/${sameUserUid}/knowledge`] = { 'k1': { id: 'k1', title: 'Knowledge 1', content: '', category: 'General', tags: [], createdAt: '', updatedAt: '' } };
  mockDb[`users/${sameUserUid}/money`] = { 'm1': { id: 'm1', amount: 50, type: 'income', category: 'General', date: '2026-10-13', description: '' } };
  mockDb[`users/${sameUserUid}/focus_sessions`] = { 'f1': { id: 'f1', mode: 'pomodoro', durationMinutes: 25, completedAt: '2026-10-13T00:00:00Z', notes: '' } };
  mockDb[`users/${sameUserUid}/conversations`] = { 'c1': { id: 'c1', title: 'Chat 1', messages: [], createdAt: '', updatedAt: '' } };
  mockDb[`users/${sameUserUid}/active_state`] = {
    focus: { mode: 'stopwatch', status: 'running', startedAt: new Date().toISOString(), durationSeconds: 0, totalPausedMs: 0 },
    chat: { activeChatId: 'c1' },
  };

  let cutoverCallCount = 0;
  const origCutover = CutoverCoordinator.cutoverCurrentUserToFirebase;
  CutoverCoordinator.cutoverCurrentUserToFirebase = async () => {
    cutoverCallCount++;
    return origCutover.apply(CutoverCoordinator, [] as any);
  };

  let resolveSameLookup: any;
  const pSameLookup = new Promise(r => { resolveSameLookup = r; });

  getDocHook = async (path: string) => {
    if (path.includes(sameUserUid) && path.includes('metadata/migration')) {
      await pSameLookup;
    }
  };

  try {
    // 1. First event starts cold start cutover
    const initialUserObj = { uid: sameUserUid, email: 'initial@test.com', displayName: 'Initial User' };
    const pEvent1 = handleAuthStateChange(initialUserObj as any);

    // Verify loading gate is active during in-flight lookup
    assert(useAuthStore.getState().loading === true, 'Loading gate is active during first event lookup');

    // 2. Second event arrives for the SAME UID while lookup is held (e.g. token refresh with newer user object)
    const refreshedUserObj = { uid: sameUserUid, email: 'refreshed@test.com', displayName: 'Refreshed User' };
    const pEvent2 = handleAuthStateChange(refreshedUserObj as any);

    // 3. Release first lookup and await both operations
    resolveSameLookup();
    await Promise.all([pEvent1, pEvent2]);

    // 4. Assertions
    assert(useAuthStore.getState().loading === false, 'Loading gate eventually becomes false (no leak)');
    assert(cutoverCallCount === 1, 'Intended Firebase cutover occurred exactly once');
    assert(RepositoryFactory.getDataSource() === 'firebase', 'Provider switched to firebase');
    assert(useTaskStore.getState().status === 'ready', 'TaskStore hydrated to ready');
    assert(useGoalStore.getState().status === 'ready', 'GoalStore hydrated to ready');
    assert(useNoteStore.getState().status === 'ready', 'NoteStore hydrated to ready');
    assert(useFocusStore.getState().status === 'ready', 'FocusStore hydrated to ready');
    assert(useMoneyStore.getState().status === 'ready', 'MoneyStore hydrated to ready');
    assert(useChatStore.getState().status === 'ready', 'ChatStore hydrated to ready');
    assert(useKnowledgeStore.getState().status === 'ready', 'KnowledgeStore hydrated to ready');
    assert(AuthLifecycle.getUid() === sameUserUid, 'Current UID matches test user');

    const status7 = await useWorkspaceContinuityStore.getState().checkStatus({ uid: sameUserUid } as any);
    assert(status7 === 'cloud_synced', 'Workspace continuity status reaches cloud_synced');

    const currentUser = useAuthStore.getState().user;
    assert(currentUser?.email === 'refreshed@test.com', 'Most recently supplied user object is not replaced by stale object');
    assert(currentUser?.displayName === 'Refreshed User', 'User displayName matches refreshed event');
  } finally {
    CutoverCoordinator.cutoverCurrentUserToFirebase = origCutover;
  }

  console.log('\n====================================================');
  console.log('✅ ALL COLD-START REGRESSION TESTS PASSED (7/7)');
  console.log('====================================================');
  process.exit(0);
}

runColdStartTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
