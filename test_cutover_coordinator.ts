import './test_firebase_mock_app';
import { CutoverCoordinator } from './src/core/data/cutover/CutoverCoordinator';
import { MigrationService } from './src/core/data/migration/MigrationService';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { setMockFirestore } from './src/core/data/repositories/firebase/firestoreProvider';
import { resetAuthIdentity } from './src/core/auth/authOrchestrator';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { useNoteStore } from './src/core/state/noteStore';
import { useFocusStore } from './src/core/state/focusStore';
import { useMoneyStore } from './src/core/state/moneyStore';
import { useChatStore } from './src/core/state/chatStore';
import { useKnowledgeStore } from './src/core/state/knowledgeStore';

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

async function runTests() {
  console.log('--- STARTING CUTOVER COORDINATOR TESTS ---');

  // Helper to reset test state
  const resetTestState = (uid: string | null = null) => {
    RepositoryFactory.setDataSource('local');
    resetAuthIdentity(uid);
    Object.keys(mockDb).forEach(k => delete mockDb[k]);
    getDocHook = null;
    getDocsHook = null;
  };

  // CUT4A-01: No authenticated user -> no switch
  console.log('Test: CUT4A-01 No auth -> no switch');
  resetTestState(null);
  try {
    await CutoverCoordinator.cutoverCurrentUserToFirebase();
    assert(false, 'Should throw no auth error');
  } catch (err: any) {
    assert(err.message.includes('No authenticated user'), 'Correct error message');
    assert(RepositoryFactory.getDataSource() === 'local', 'Must remain local');
  }

  // CUT4A-03: No migration marker -> no switch
  console.log('Test: CUT4A-03 No migration marker -> no switch');
  resetTestState('user-1');
  try {
    await CutoverCoordinator.cutoverCurrentUserToFirebase();
    assert(false, 'Should throw no marker error');
  } catch (err: any) {
    assert(err.message.includes('not COMPLETED'), 'Correct error message');
    assert(RepositoryFactory.getDataSource() === 'local', 'Must remain local');
  }

  // CUT4A-04 & CUT4A-05: IN_PROGRESS or FAILED -> no switch
  console.log('Test: CUT4A-04/05 IN_PROGRESS/FAILED -> no switch');
  resetTestState('user-1');
  mockDb['users/user-1/metadata'] = { migration: { status: 'IN_PROGRESS' } };
  try {
    await CutoverCoordinator.cutoverCurrentUserToFirebase();
    assert(false, 'Should throw not completed');
  } catch (err: any) {
    assert(err.message.includes('not COMPLETED'), 'Correct error message');
  }

  // CUT4A-06, 07, 08: COMPLETED marker -> switches provider, resets stores, hydrates
  console.log('Test: CUT4A-06/07/08 COMPLETED -> successful cutover');
  resetTestState('user-1');
  mockDb['users/user-1/metadata'] = { migration: { status: 'COMPLETED' } };
  mockDb['users/user-1/tasks'] = { 'task1': { id: 'task1', title: 'Firebase Task', date: '2023-01-01', priority: 'high', completed: false, createdAt: '2023-01-01' } };
  
  // Set some local junk to ensure it gets cleared
  useTaskStore.setState({ tasks: [{ id: 'local1', title: 'local', date: '2023', priority: 'medium', completed: false, createdAt: '2023' }] as any });

  await CutoverCoordinator.cutoverCurrentUserToFirebase();
  assert(RepositoryFactory.getDataSource() === 'firebase', 'Must switch to firebase');
  const tasks = useTaskStore.getState().tasks;
  assert(tasks.length === 1 && tasks[0].title === 'Firebase Task', 'Stores must hydrate from firebase and clear local');

  // CUT4A-09: Auth A -> B before provider switch
  console.log('Test: CUT4A-09 Auth race before switch');
  resetTestState('user-A');
  mockDb['users/user-A/metadata'] = { migration: { status: 'COMPLETED' } };
  getDocHook = async (path) => {
    if (path.includes('migration')) {
      resetAuthIdentity('user-B'); // Simulate login of user B
    }
  };
  try {
    await CutoverCoordinator.cutoverCurrentUserToFirebase();
    assert(false, 'Should throw stale auth');
  } catch (err: any) {
    assert(err.message.includes('Auth identity changed') || err.message.includes('Identity changed'), 'Should fail during verification');
    assert(RepositoryFactory.getDataSource() === 'local', 'Must not switch provider');
  }

  // CUT4A-10: Auth A -> B during hydration
  console.log('Test: CUT4A-10 Auth race during hydration');
  resetTestState('user-A');
  mockDb['users/user-A/metadata'] = { migration: { status: 'COMPLETED' } };
  getDocsHook = async (path) => {
    if (path.includes('tasks')) {
      resetAuthIdentity('user-B');
    }
  };
  try {
    await CutoverCoordinator.cutoverCurrentUserToFirebase();
    assert(false, 'Should throw stale auth');
  } catch (err: any) {
    assert(err.message.includes('Auth identity changed during hydration'), 'Should fail during hydration');
    // Ensure user-A's data doesn't accidentally load into user-B's stores
    const tasks = useTaskStore.getState().tasks;
    assert(tasks.length === 0, 'Should remain empty for user B');
  }

  // CUT4A-11: A -> B -> A
  console.log('Test: CUT4A-11 Auth A -> B -> A race');
  resetTestState('user-A');
  mockDb['users/user-A/metadata'] = { migration: { status: 'COMPLETED' } };
  getDocHook = async (path) => {
    if (path.includes('migration')) {
      resetAuthIdentity('user-B');
      resetAuthIdentity('user-A');
    }
  };
  try {
    await CutoverCoordinator.cutoverCurrentUserToFirebase();
    assert(false, 'Should throw stale auth');
  } catch (err: any) {
    assert(err.message.includes('Auth identity changed') || err.message.includes('Identity changed'), 'Even if returned to A, original epoch is stale');
  }

  // CUT4A-12: Provider switch succeeds but hydration fails -> remain Firebase
  console.log('Test: CUT4A-12 Hydration failure -> remain Firebase');
  resetTestState('user-1');
  mockDb['users/user-1/metadata'] = { migration: { status: 'COMPLETED' } };
  getDocsHook = async (path) => {
    if (path.includes('tasks')) {
      throw new Error('Simulated network error');
    }
  };
  try {
    await CutoverCoordinator.cutoverCurrentUserToFirebase();
    assert(false, 'Should throw partial failure');
  } catch (err: any) {
    assert(err.message.includes('partial failure'), 'Surfaces error');
    assert(RepositoryFactory.getDataSource() === 'firebase', 'Must NOT silently fallback to local');
  }

  console.log('✅ All Cutover Coordinator tests passed.');
}

runTests().catch(err => {
  console.error('Test script failed:', err);
  process.exit(1);
});
