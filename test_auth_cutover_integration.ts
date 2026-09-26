import './test_firebase_mock_app';
import { handleAuthStateChange, lastUid } from './src/core/auth/initAuth';
import { MigrationService } from './src/core/data/migration/MigrationService';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { useTaskStore } from './src/core/state/taskStore';
import { setMockFirestore } from './src/core/data/repositories/firebase/firestoreProvider';
import { resetAuthIdentity } from './src/core/auth/authOrchestrator';

const mockDb: Record<string, any> = {};
let getDocHook: ((path: string) => Promise<void> | void) | null = null;
let getDocsHook: ((path: string) => Promise<void> | void) | null = null;

const mockFirestore: any = {
  getFirestore: () => ({}),
  doc: (db: any, path: string) => path,
  collection: (db: any, path: string) => path,
  getDoc: async (docRef: string) => {
    if (getDocHook) await getDocHook(docRef);
    const parts = docRef.split('/');
    const col = parts.slice(0, parts.length - 1).join('/');
    const id = parts[parts.length - 1];
    const exists = mockDb[col] && mockDb[col][id] !== undefined;
    return {
      exists: () => exists,
      data: () => exists ? mockDb[col][id] : undefined
    };
  },
  getDocs: async (colRef: string) => {
    if (getDocsHook) await getDocsHook(colRef);
    const docs = mockDb[colRef] || {};
    return {
      docs: Object.keys(docs).map(id => ({
        id,
        data: () => docs[id]
      }))
    };
  },
  setDoc: async () => {},
  writeBatch: () => ({ set: () => {}, delete: () => {}, commit: async () => {} }),
  deleteDoc: async () => {}
};
setMockFirestore(mockFirestore);

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`❌ Assertion failed: ${message}`);
    process.exit(1);
  }
}

// Reset everything to force initAuth to recognize changes
function resetEnvironment() {
  handleAuthStateChange(null);
  RepositoryFactory.setDataSource('local');
  Object.keys(mockDb).forEach(k => delete mockDb[k]);
  getDocHook = null;
  getDocsHook = null;
}

async function runTests() {
  console.log('--- STARTING AUTH CUTOVER INTEGRATION TESTS ---');

  // AUTH-CUT-01: No authenticated user
  console.log('Test: AUTH-CUT-01 No authenticated user');
  resetEnvironment();
  await handleAuthStateChange(null);
  assert(RepositoryFactory.getDataSource() === 'local', 'Must be local for null user');

  // AUTH-CUT-02: Auth user with no marker
  console.log('Test: AUTH-CUT-02 Auth user no marker');
  resetEnvironment();
  await handleAuthStateChange({ uid: 'user-02' } as any);
  assert(RepositoryFactory.getDataSource() === 'local', 'Must remain local if no marker');

  // AUTH-CUT-03: IN_PROGRESS marker
  console.log('Test: AUTH-CUT-03 IN_PROGRESS marker');
  resetEnvironment();
  mockDb['users/user-03/metadata'] = { migration: { status: 'IN_PROGRESS' } };
  await handleAuthStateChange({ uid: 'user-03' } as any);
  assert(RepositoryFactory.getDataSource() === 'local', 'Must remain local if IN_PROGRESS');

  // AUTH-CUT-04: FAILED marker
  console.log('Test: AUTH-CUT-04 FAILED marker');
  resetEnvironment();
  mockDb['users/user-04/metadata'] = { migration: { status: 'FAILED' } };
  await handleAuthStateChange({ uid: 'user-04' } as any);
  assert(RepositoryFactory.getDataSource() === 'local', 'Must remain local if FAILED');

  // AUTH-CUT-05: COMPLETED marker -> triggers CutoverCoordinator
  console.log('Test: AUTH-CUT-05 COMPLETED marker');
  resetEnvironment();
  mockDb['users/user-05/metadata'] = { migration: { status: 'COMPLETED' } };
  await handleAuthStateChange({ uid: 'user-05' } as any);
  assert(RepositoryFactory.getDataSource() === 'firebase', 'Must switch to firebase if COMPLETED');

  // AUTH-CUT-06: A -> B while A marker lookup pending
  console.log('Test: AUTH-CUT-06 A -> B before marker lookup finishes');
  resetEnvironment();
  mockDb['users/user-06A/metadata'] = { migration: { status: 'COMPLETED' } };
  mockDb['users/user-06B/metadata'] = { migration: { status: 'IN_PROGRESS' } };
  
  let resolveAMarker: any;
  const promiseAMarker = new Promise(r => { resolveAMarker = r; });
  
  getDocHook = async (path) => {
    if (path.includes('user-06A')) {
      await promiseAMarker;
    }
  };
  
  const promiseA = handleAuthStateChange({ uid: 'user-06A' } as any);
  // While A is waiting for marker, B logs in
  const promiseB = handleAuthStateChange({ uid: 'user-06B' } as any);
  
  resolveAMarker();
  await Promise.all([promiseA, promiseB]);
  
  assert(RepositoryFactory.getDataSource() === 'local', 'B (IN_PROGRESS) must be the final authoritative state');

  // AUTH-CUT-07: A -> B while A Firebase hydration is pending
  console.log('Test: AUTH-CUT-07 A -> B during Firebase hydration');
  resetEnvironment();
  mockDb['users/user-07A/metadata'] = { migration: { status: 'COMPLETED' } };
  mockDb['users/user-07B/metadata'] = { migration: { status: 'FAILED' } };
  
  let resolveAHydration: any;
  const promiseAHydration = new Promise(r => { resolveAHydration = r; });
  
  getDocsHook = async (path) => {
    if (path.includes('user-07A')) {
      await promiseAHydration;
    }
  };
  
  const pA = handleAuthStateChange({ uid: 'user-07A' } as any);
  const pB = handleAuthStateChange({ uid: 'user-07B' } as any);
  
  resolveAHydration();
  
  // Note: pA will throw an error internally in cutover coordinator, which is caught safely by initAuth
  await Promise.all([pA, pB]);
  assert(RepositoryFactory.getDataSource() === 'local', 'B must remain local and authoritative');

  // AUTH-CUT-08: A -> B -> A
  console.log('Test: AUTH-CUT-08 A -> B -> A race');
  resetEnvironment();
  mockDb['users/user-08A/metadata'] = { migration: { status: 'COMPLETED' } };
  
  let resolveAMarker1: any;
  const pAMarker1 = new Promise(r => { resolveAMarker1 = r; });
  
  let hookCallCount = 0;
  getDocHook = async (path) => {
    if (path.includes('user-08A') && hookCallCount === 0) {
      hookCallCount++;
      await pAMarker1;
    }
  };
  
  const pA1 = handleAuthStateChange({ uid: 'user-08A' } as any);
  const pB1 = handleAuthStateChange({ uid: 'user-08B' } as any);
  const pA2 = handleAuthStateChange({ uid: 'user-08A' } as any); // Newest A flow
  
  resolveAMarker1();
  await Promise.all([pA1, pB1, pA2]);
  
  // The second A flow should complete normally since it's COMPLETED
  assert(RepositoryFactory.getDataSource() === 'firebase', 'Newest A flow should succeed and switch to firebase');

  // AUTH-CUT-09: A Firebase pending -> sign out
  console.log('Test: AUTH-CUT-09 A Firebase pending -> sign out');
  resetEnvironment();
  mockDb['users/user-09/metadata'] = { migration: { status: 'COMPLETED' } };
  
  let resolveA2Hydration: any;
  const pA2Hydration = new Promise(r => { resolveA2Hydration = r; });
  
  getDocsHook = async (path) => {
    if (path.includes('user-09')) {
      await pA2Hydration;
    }
  };
  
  const promiseA2 = handleAuthStateChange({ uid: 'user-09' } as any);
  const promiseLogout = handleAuthStateChange(null);
  
  resolveA2Hydration();
  await Promise.all([promiseA2, promiseLogout]);
  
  assert(RepositoryFactory.getDataSource() === 'local', 'Must return to local after sign out');

  // AUTH-CUT-10: A COMPLETED -> sign out -> B NO MARKER
  console.log('Test: AUTH-CUT-10 A COMPLETED -> sign out -> B NO MARKER');
  resetEnvironment();
  mockDb['users/user-10A/metadata'] = { migration: { status: 'COMPLETED' } };
  await handleAuthStateChange({ uid: 'user-10A' } as any);
  assert(RepositoryFactory.getDataSource() === 'firebase', 'A should be firebase');
  
  await handleAuthStateChange(null);
  assert(RepositoryFactory.getDataSource() === 'local', 'Should be local after logout');
  
  await handleAuthStateChange({ uid: 'user-10B' } as any);
  assert(RepositoryFactory.getDataSource() === 'local', 'B with no marker should be local');

  // AUTH-CUT-11: A COMPLETED -> sign out -> B FAILED
  console.log('Test: AUTH-CUT-11 A COMPLETED -> sign out -> B FAILED');
  resetEnvironment();
  mockDb['users/user-11A/metadata'] = { migration: { status: 'COMPLETED' } };
  mockDb['users/user-11B/metadata'] = { migration: { status: 'FAILED' } };
  
  await handleAuthStateChange({ uid: 'user-11A' } as any);
  assert(RepositoryFactory.getDataSource() === 'firebase', 'A should be firebase');
  
  await handleAuthStateChange(null);
  await handleAuthStateChange({ uid: 'user-11B' } as any);
  assert(RepositoryFactory.getDataSource() === 'local', 'B with FAILED marker should be local');

  // AUTH-CUT-12: A COMPLETED -> sign out -> B COMPLETED
  console.log('Test: AUTH-CUT-12 A COMPLETED -> sign out -> B COMPLETED');
  resetEnvironment();
  mockDb['users/user-12A/metadata'] = { migration: { status: 'COMPLETED' } };
  mockDb['users/user-12B/metadata'] = { migration: { status: 'COMPLETED' } };
  
  await handleAuthStateChange({ uid: 'user-12A' } as any);
  assert(RepositoryFactory.getDataSource() === 'firebase', 'A should be firebase');
  
  await handleAuthStateChange(null);
  assert(RepositoryFactory.getDataSource() === 'local', 'Should revert to local on sign out');
  
  await handleAuthStateChange({ uid: 'user-12B' } as any);
  assert(RepositoryFactory.getDataSource() === 'firebase', 'B should enter firebase');

  // AUTH-CUT-13: MigrationService remains provider-agnostic
  console.log('Test: AUTH-CUT-13 MigrationService remains provider-agnostic');
  resetEnvironment();
  const repoModeBefore = RepositoryFactory.getDataSource();
  mockDb['users/user-13/metadata'] = { migration: { status: 'NOT_STARTED' } };
  AuthLifecycle.reset('user-13');
  try {
    await MigrationService.migrateCurrentUserToFirestore(); // this will complete the migration
  } catch(e) {}
  const repoModeAfter = RepositoryFactory.getDataSource();
  assert(repoModeBefore === repoModeAfter && repoModeAfter === 'local', 'MigrationService should not change provider directly');
  
  // AUTH-CUT-14: Stale marker result
  console.log('Test: AUTH-CUT-14 Stale marker result');
  resetEnvironment();
  mockDb['users/user-14A/metadata'] = { migration: { status: 'COMPLETED' } };
  mockDb['users/user-14B/metadata'] = { migration: { status: 'IN_PROGRESS' } };
  
  let resolve14A: any;
  const p14A = new Promise(r => { resolve14A = r; });
  
  getDocHook = async (path) => {
    if (path.includes('user-14A')) {
      await p14A;
    }
  };
  
  const promise14A = handleAuthStateChange({ uid: 'user-14A' } as any);
  const promise14B = handleAuthStateChange({ uid: 'user-14B' } as any);
  
  resolve14A(); // Resolve A's marker now
  await Promise.all([promise14A, promise14B]);
  
  // B is current, B is IN_PROGRESS -> local
  assert(RepositoryFactory.getDataSource() === 'local', 'Stale A marker resolution must not trigger cutover');
  
  // AUTH-CUT-15: Final lifecycle invariant
  console.log('Test: AUTH-CUT-15 Final lifecycle invariant');
  resetEnvironment();
  
  // Create some mock data that ONLY belongs to user-15's firestore path
  mockDb['users/user-15/tasks'] = {
    'task-fb-15': { id: 'task-fb-15', title: 'Firebase user-15 task', date: '2023', priority: 'low', completed: false, createdAt: '2023' }
  };
  mockDb['users/user-15/metadata'] = { migration: { status: 'COMPLETED' } };
  
  // Initialize some local data to ensure it gets wiped
  useTaskStore.setState({ tasks: [{ id: 'local-junk', title: 'Junk', date: '2023', priority: 'high', completed: false, createdAt: '2023' }] as any });
  
  // Track actual paths accessed during initialization
  const accessedCollectionPaths: string[] = [];
  getDocsHook = (path) => {
    accessedCollectionPaths.push(path);
  };
  
  // Execute the cutover lifecycle
  await handleAuthStateChange({ uid: 'user-15' } as any);
  
  const finalUid = AuthLifecycle.getUid();
  const finalProvider = RepositoryFactory.getDataSource();
  
  // 1. Current Auth UID:
  assert(finalUid === 'user-15', 'UID invariant');
  
  // 2. Actual Firebase repository identity/path:
  // By requesting a repository via the factory and seeing where it actually read data from,
  // we prove the factory bound the Firebase repository correctly to user-15.
  assert(finalProvider === 'firebase', 'Provider invariant');
  assert(accessedCollectionPaths.includes('users/user-15/tasks'), `Firebase repository did not access scoped path: users/user-15/tasks. Paths accessed: ${accessedCollectionPaths.join(', ')}`);
  
  // 3. Actual store hydration source:
  // Verify the active store actually contains the data returned exclusively from the user-15 path.
  const hydratedTasks = useTaskStore.getState().tasks;
  assert(hydratedTasks.length === 1 && hydratedTasks[0].id === 'task-fb-15', 'Store hydration did not correctly sync with user-15 repository data');
  
  // 4. Exact relationship proving all three refer to user-15:
  // The AuthLifecycle(user-15) bound the Firebase Repository -> the Firebase Repository read users/user-15/tasks -> the Store hydrated 'task-fb-15'.
  
  console.log('✅ ALL AUTH CUTOVER INTEGRATION TESTS PASSED');
}

runTests().catch(err => {
  console.error('Test script failed:', err);
  process.exit(1);
});
