import './test_firebase_mock_app';
import { MigrationService } from './src/core/data/migration/MigrationService';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { storageService } from './src/core/storage/storageService';
import { STORAGE_KEYS } from './src/core/storage/storageKeys';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { setMockFirestore } from './src/core/data/repositories/firebase/firestoreProvider';
import { useTaskStore } from './src/core/state/taskStore';

const mockDb: Record<string, any> = {};
let batchWrites: Array<{ type: 'set' | 'delete', path: string, data?: any, merge?: boolean }> = [];
let shouldFailBatch = false;
let batchFailHook: (() => void) | null = null;
let firestoreCallCount = 0;
let batchSetHook: (() => void) | null = null;
let commitCalls = 0;
let onSnapshotCalls = 0;
let failDomainCommit: string | null = null;

const mockFirestore: any = {
  getFirestore: () => ({}),
  collection: (db: any, path: string) => path,
  doc: (db: any, path: string) => path,
  getDoc: async (docRef: string) => {
    firestoreCallCount++;
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
    firestoreCallCount++;
    const docs = mockDb[colRef] || {};
    return {
      docs: Object.keys(docs).map(id => ({
        id,
        data: () => docs[id]
      }))
    };
  },
  setDoc: async (docRef: string, data: any, options: any) => {
    firestoreCallCount++;
    const parts = docRef.split('/');
    const col = parts.slice(0, parts.length - 1).join('/');
    const id = parts[parts.length - 1];
    if (!mockDb[col]) mockDb[col] = {};
    mockDb[col][id] = options?.merge ? { ...mockDb[col][id], ...data } : data;
  },
  deleteDoc: async (docRef: string) => {
    firestoreCallCount++;
    const parts = docRef.split('/');
    const col = parts.slice(0, parts.length - 1).join('/');
    const id = parts[parts.length - 1];
    if (mockDb[col]) delete mockDb[col][id];
  },
  writeBatch: () => {
    const operations: any[] = [];
    return {
      set: (docRef: string, data: any, options: any) => {
        if (batchSetHook) batchSetHook();
        operations.push({ type: 'set', path: docRef, data, merge: options?.merge });
      },
      delete: (docRef: string) => operations.push({ type: 'delete', path: docRef }),
      commit: async () => {
        commitCalls++;
        firestoreCallCount++;
        if (batchFailHook) await batchFailHook();
        if (shouldFailBatch) throw new Error("Simulated batch failure");
        
        // If a specific domain is set to fail, check paths
        if (failDomainCommit) {
            if (operations.some(op => op.path.includes(`/${failDomainCommit}/`))) {
                throw new Error(`Simulated domain batch failure: ${failDomainCommit}`);
            }
        }
        
        batchWrites.push(...operations);
        for (const op of operations) {
           const parts = op.path.split('/');
           const col = parts.slice(0, parts.length - 1).join('/');
           const id = parts[parts.length - 1];
           if (!mockDb[col]) mockDb[col] = {};
           if (op.type === 'set') mockDb[col][id] = op.merge ? { ...mockDb[col][id], ...op.data } : op.data;
           if (op.type === 'delete') delete mockDb[col][id];
        }
      }
    }
  },
  onSnapshot: () => {
    onSnapshotCalls++;
    return () => {};
  }
};

setMockFirestore(mockFirestore);

// Realistic Web Locks Mock
class MockLockManager {
  private locks = new Map<string, Promise<void>>();
  
  async request(name: string, cb: () => Promise<void>) {
    let previousLock = this.locks.get(name) || Promise.resolve();
    let release: () => void;
    const nextLock = new Promise<void>(resolve => release = resolve);
    this.locks.set(name, previousLock.then(() => nextLock));
    
    await previousLock;
    try {
      await cb();
    } finally {
      release!();
      if (this.locks.get(name) === nextLock) {
        this.locks.delete(name);
      }
    }
  }
}
Object.defineProperty(global, 'navigator', {
  value: { locks: new MockLockManager() },
  writable: true,
  configurable: true
});

function resetMocks() {
  for (const key in mockDb) delete mockDb[key];
  batchWrites = [];
  shouldFailBatch = false;
  batchFailHook = null;
  firestoreCallCount = 0;
  batchSetHook = null;
  commitCalls = 0;
  onSnapshotCalls = 0;
  failDomainCommit = null;
}

const setupLocalData = (uid: string) => {
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.TASKS}`, [{ id: 't1', title: 'Task 1' }]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.GOALS}`, [{ id: 'g1', title: 'Goal 1' }]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.NOTES}`, [{ id: 'n1', content: 'Note 1' }]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.KNOWLEDGE}`, [{ id: 'k1', content: 'Knowledge 1' }]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.MONEY_ENTRIES}`, [{ id: 'm1', amount: 10.50 }]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.FOCUS_SESSIONS}`, [{ id: 'f1', duration: 25 }]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.CONVERSATIONS}`, [{ id: 'c1', title: 'Chat 1' }]);
  storageService.setItem(`novo:${uid}:novo_active_focus`, { active: true });
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.ACTIVE_CHAT_ID}`, 'c1');
  storageService.setItem(`novo_v1_tasks`, [{ id: 'legacy_t1', title: 'Legacy Task' }]);
};

async function runTests() {
  console.log("=== RUNNING MIGRATION TESTS ===");

  // MIG-01
  resetMocks();
  AuthLifecycle.reset(null);
  let mig01Pass = false;
  try { await MigrationService.migrateCurrentUserToFirestore(); } catch (e) { mig01Pass = true; }
  if (!mig01Pass || firestoreCallCount !== 0) throw new Error("MIG-01 Failed: Did not refuse safely");
  console.log("✅ [PASS] MIG-01: No authenticated user refuses safely, no writes.");

  // MIG-02 & MIG-03 & MIG-04
  resetMocks();
  AuthLifecycle.reset('uid-123');
  setupLocalData('uid-123');
  await MigrationService.migrateCurrentUserToFirestore();
  if (!mockDb['users/uid-123/tasks']['t1']) throw new Error("MIG-03 Failed: Tasks");
  if (!mockDb['users/uid-123/goals']['g1']) throw new Error("MIG-03 Failed: Goals");
  if (!mockDb['users/uid-123/notes']['n1']) throw new Error("MIG-03 Failed: Notes");
  if (!mockDb['users/uid-123/knowledge']['k1']) throw new Error("MIG-03 Failed: Knowledge");
  if (!mockDb['users/uid-123/money']['m1']) throw new Error("MIG-03 Failed: Money");
  if (!mockDb['users/uid-123/focus_sessions']['f1']) throw new Error("MIG-03 Failed: Focus");
  if (!mockDb['users/uid-123/conversations']['c1']) throw new Error("MIG-03 Failed: Chat");
  if (!mockDb['users/uid-123/active_state']['focus']?.active) throw new Error("MIG-18 Failed: Active Focus");
  if (mockDb['users/uid-123/active_state']['chat']?.activeChatId !== 'c1') throw new Error("MIG-19 Failed: Active Chat");
  console.log("✅ [PASS] MIG-02 & MIG-03 & MIG-04: UID captured, all domains migrated to scoped paths with deterministic IDs.");
  console.log("✅ [PASS] MIG-17 & MIG-18 & MIG-19: Focus/Chat historical and active states properly migrated.");

  // MIG-16
  if (mockDb['users/uid-123/money']['m1'].amount !== 10.50) throw new Error("MIG-16 Failed: Float not preserved.");
  console.log("✅ [PASS] MIG-16: Money values preserve floating-point representation.");

  // MIG-20
  if (mockDb['users/uid-123/tasks']['legacy_t1'] || mockDb['users/null/tasks']) throw new Error("MIG-20 Failed: Legacy data migrated.");
  console.log("✅ [PASS] MIG-20: Legacy unscoped LocalStorage data is untouched.");

  // MIG-05, MIG-06, MIG-07
  mockDb['users/uid-123/tasks']['remote_t1'] = { id: 'remote_t1', title: 'Remote' };
  mockDb['users/uid-123/metadata'] = { migration: { status: 'COMPLETED' } };
  await MigrationService.migrateCurrentUserToFirestore();
  const taskIds = Object.keys(mockDb['users/uid-123/tasks']);
  if (taskIds.length !== 2) throw new Error(`MIG-05/07 Failed: Expected 2 tasks, got ${taskIds.length}`);
  if (mockDb['users/uid-123/metadata']['migration'].status !== 'COMPLETED') throw new Error("MIG-06 Failed: Marker changed incorrectly.");
  console.log("✅ [PASS] MIG-05: Repeated migration is idempotent (no duplicates).");
  console.log("✅ [PASS] MIG-06 & MIG-07: Remote COMPLETED merges with existing remote documents.");

  // MIG-14 (Partial failure & recovery) + MIG-08 + MIG-09
  resetMocks();
  AuthLifecycle.reset('uid-fail');
  setupLocalData('uid-fail');
  failDomainCommit = 'goals'; // Goals will fail
  let mig08Pass = false;
  try { await MigrationService.migrateCurrentUserToFirestore(); } catch(e) { mig08Pass = true; }
  if (!mig08Pass) throw new Error("MIG-08 Failed: Did not throw");
  if (mockDb['users/uid-fail/metadata']['migration'].status !== 'FAILED') throw new Error("MIG-08 Failed: Marker not FAILED");
  if (!mockDb['users/uid-fail/tasks']['t1']) throw new Error("MIG-14 Failed: Tasks did not commit before Goals failed");
  if (mockDb['users/uid-fail/goals']) throw new Error("MIG-14 Failed: Goals committed despite failure");
  
  // Resume!
  failDomainCommit = null;
  await MigrationService.migrateCurrentUserToFirestore();
  if (mockDb['users/uid-fail/metadata']['migration'].status !== 'COMPLETED') throw new Error("MIG-14 Failed: Did not resume successfully");
  if (Object.keys(mockDb['users/uid-fail/tasks']).length !== 1) throw new Error("MIG-14 Failed: Tasks duplicated on retry");
  if (!mockDb['users/uid-fail/goals']['g1']) throw new Error("MIG-14 Failed: Goals did not migrate on retry");
  console.log("✅ [PASS] MIG-08, MIG-09, MIG-14: Partial failure & recovery works flawlessly. No duplicates.");

  // MIG-10 (Pre-commit Auth Abort)
  resetMocks();
  AuthLifecycle.reset('uid-precommit');
  setupLocalData('uid-precommit');
  batchSetHook = () => { // Fires during fs.doc / fs.setDoc inside batch, BEFORE batch.commit() begins
    AuthLifecycle.reset('uid-different-1');
  };
  let mig10Pass = false;
  try { await MigrationService.migrateCurrentUserToFirestore(); } catch(e: any) {
    if (e.message.includes('aborted')) mig10Pass = true;
  }
  if (!mig10Pass) throw new Error("MIG-10 Failed: Did not abort on stale auth before commit.");
  if (commitCalls > 0) throw new Error("MIG-10 Failed: batch.commit() was called despite stale auth!");
  if (mockDb['users/uid-different-1']) throw new Error("MIG-10 Failed: Writes leaked into new UID.");
  if (mockDb['users/uid-precommit/metadata']?.migration?.status === 'COMPLETED') throw new Error("MIG-10 Failed: Reached COMPLETED.");
  console.log("✅ [PASS] MIG-10: Auth changes BEFORE batch.commit() prevent commit from executing.");

  // MIG-11 (In-flight commit abort) & MIG-12
  resetMocks();
  AuthLifecycle.reset('uid-inflight');
  setupLocalData('uid-inflight');
  let batchCalls = 0;
  batchFailHook = async () => {
    batchCalls++;
    if (batchCalls === 2) { // Change auth while commit is executing
      AuthLifecycle.reset('uid-different-2');
    }
  };
  let mig11Pass = false;
  try { await MigrationService.migrateCurrentUserToFirestore(); } catch(e: any) {
    if (e.message.includes('aborted')) mig11Pass = true;
  }
  if (!mig11Pass) throw new Error("MIG-11 Failed: Did not abort on stale auth mid-migration.");
  if (mockDb['users/uid-different-2']) throw new Error("MIG-12 Failed: Writes leaked into new UID.");
  if (mockDb['users/uid-inflight/metadata']?.migration?.status === 'COMPLETED') throw new Error("MIG-11 Failed: Reached COMPLETED despite stale auth.");
  console.log("✅ [PASS] MIG-11 & MIG-12: Auth changes AFTER batch.commit() starts abort migration, no COMPLETED, no cross-pollution.");

  // MIG-13 (Web Locks Concurrency)
  resetMocks();
  AuthLifecycle.reset('uid-concurrent');
  setupLocalData('uid-concurrent');
  let activeMigrations = 0;
  let overlapDetected = false;
  batchFailHook = async () => {
    activeMigrations++;
    if (activeMigrations > 1) overlapDetected = true;
    await new Promise(r => setTimeout(r, 10)); // Artificial delay inside lock
    activeMigrations--;
  };
  const p1 = MigrationService.migrateCurrentUserToFirestore();
  const p2 = MigrationService.migrateCurrentUserToFirestore();
  await Promise.all([p1, p2]);
  if (overlapDetected) throw new Error("MIG-13 Failed: Critical sections overlapped!");
  console.log("✅ [PASS] MIG-13: Same-browser concurrent migration queues correctly using Web Locks (no overlap).");

  // MIG-15 (Chat size UTF-8 limit)
  resetMocks();
  AuthLifecycle.reset('uid-large');
  storageService.setItem(`novo:uid-large:${STORAGE_KEYS.CONVERSATIONS}`, [
    { id: 'c_ascii', title: new Array(850_000).fill('a').join('') } // Below 900KB
  ]);
  await MigrationService.migrateCurrentUserToFirestore(); // Should pass
  if (!mockDb['users/uid-large/conversations']['c_ascii']) throw new Error("MIG-15 Failed: Safe ASCII chat was rejected.");
  
  // Now Unicode that exceeds limit in bytes but not in JS string length (1 char = 3 bytes)
  storageService.setItem(`novo:uid-large:${STORAGE_KEYS.CONVERSATIONS}`, [
    { id: 'c_unicode', title: new Array(350_000).fill('😊').join('') } // JS length 700k (surrogate pairs), UTF-8 bytes > 1.4MB
  ]);
  let mig15Pass = false;
  try { await MigrationService.migrateCurrentUserToFirestore(); } catch(e: any) {
    if (e.message.includes('size limit')) mig15Pass = true;
  }
  if (!mig15Pass) throw new Error("MIG-15 Failed: Oversized UTF-8 Chat silently passed size check!");
  console.log("✅ [PASS] MIG-15: Chat document byte-size limit strictly enforced using TextEncoder.");

  // MIG-21, MIG-22, MIG-23, MIG-24
  RepositoryFactory.setDataSource('firebase');
  RepositoryFactory.setDataSource('local');
  resetMocks();
  AuthLifecycle.reset('uid-cutover');
  setupLocalData('uid-cutover');
  
  // Setup Zustand real state
  useTaskStore.setState({ tasks: [{ id: 'z1', title: 'Zustand Task', completed: false, createdAt: '', date: '', priority: 'medium' }] });
  const stateBefore = useTaskStore.getState().tasks;
  
  await MigrationService.migrateCurrentUserToFirestore();
  
  // Verify MIG-21
  if (RepositoryFactory.getDataSource() !== 'local') throw new Error("MIG-21 Failed: Provider changed!");
  console.log("✅ [PASS] MIG-21: Successful migration does NOT change RepositoryFactory mode (NO CUTOVER).");
  
  // Verify MIG-22
  const stateAfter = useTaskStore.getState().tasks;
  if (stateBefore !== stateAfter || stateAfter.length === 0 || stateAfter[0].id !== 'z1') {
      throw new Error("MIG-22 Failed: Zustand store mutated.");
  }
  console.log("✅ [PASS] MIG-22: Zustand store state behaviorally identical pre and post migration.");
  
  // Verify MIG-23
  if (onSnapshotCalls !== 0) throw new Error("MIG-23 Failed: onSnapshot was called.");
  console.log("✅ [PASS] MIG-23: Successful migration does NOT trigger Firebase realtime listeners.");
  
  // MIG-24 (Completion marker write failure does not mask original error if FAILED marker fails)
  resetMocks();
  AuthLifecycle.reset('uid-marker-fail');
  setupLocalData('uid-marker-fail');
  shouldFailBatch = true; // Primary error
  let secondaryMarkerFailed = false;
  const originalSetDoc = mockFirestore.setDoc;
  mockFirestore.setDoc = async (docRef: string, data: any, options: any) => {
    if (data.status === 'FAILED') {
      secondaryMarkerFailed = true;
      throw new Error("Simulated secondary marker write failure");
    }
    return originalSetDoc(docRef, data, options);
  };
  try {
    await MigrationService.migrateCurrentUserToFirestore();
    throw new Error("Should not reach here");
  } catch(e: any) {
    if (!e.message.includes('Simulated batch failure')) {
      throw new Error("MIG-24 Failed: Primary error was masked by secondary marker failure.");
    }
  }
  if (!secondaryMarkerFailed) throw new Error("MIG-24 Failed: Secondary failure not triggered.");
  console.log("✅ [PASS] MIG-24: Failure while writing FAILED marker does NOT mask original primary error.");
  mockFirestore.setDoc = originalSetDoc;

  console.log("=== ALL MIGRATION TESTS PASSED ===");
}

runTests().catch(e => {
  console.error("Test failed", e);
  process.exit(1);
});
