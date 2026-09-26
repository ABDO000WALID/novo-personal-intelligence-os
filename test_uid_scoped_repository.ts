import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { LocalTaskRepository } from './src/core/data/repositories/local';
import { Task } from './src/types/data';
import { storageService } from './src/core/storage/storageService';

// Mock window for testing events if not present
if (typeof window === 'undefined') {
  const listeners: Record<string, Function[]> = {};
  (global as any).window = {
    addEventListener: (event: string, cb: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    },
    removeEventListener: (event: string, cb: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(l => l !== cb);
      }
    },
    dispatchEvent: (event: any) => {
      const cbs = listeners[event.type] || [];
      cbs.forEach(cb => cb(event));
      return true;
    }
  };
  (global as any).CustomEvent = class CustomEvent {
    type: string;
    detail: any;
    constructor(type: string, options: any) {
      this.type = type;
      this.detail = options?.detail;
    }
  };
  (global as any).StorageEvent = class StorageEvent {
    type: string;
    key: string;
    constructor(type: string, options: any) {
      this.type = type;
      this.key = options?.key;
    }
  };
}

async function runUIDTests() {
  console.log("=== RUNNING UID-SCOPED REPOSITORY TESTS ===");

  const repo = new LocalTaskRepository();
  
  // Setup User A
  AuthLifecycle.reset('user_a');
  
  // Create a task for User A
  const taskA: Task = {
    id: 'task-a',
    title: 'User A Task',
    completed: false,
    date: '2025-01-01',
    priority: 'medium',
    createdAt: new Date().toISOString()
  };
  await repo.create(taskA);

  // Read back for User A
  const tasksA = await repo.getAll();
  if (tasksA.length !== 1 || tasksA[0].id !== 'task-a') {
    throw new Error('UID-02 Failed: User A did not receive User A data.');
  }
  console.log("✅ [PASS] UID-02: User A receives only User A data.");

  // UID-01: Switch to User B
  AuthLifecycle.reset('user_b');
  const tasksB = await repo.getAll();
  if (tasksB.length !== 0) {
    throw new Error('UID-01 Failed: User B saw User A data.');
  }
  console.log("✅ [PASS] UID-01: User B receives empty state (cannot see A's data).");
  console.log("✅ [PASS] UID-03: User B cannot see A's persisted records.");

  // UID-04: Switch to null (unauthenticated)
  AuthLifecycle.reset(null);
  const tasksNull = await repo.getAll();
  if (tasksNull.length !== 0) {
    throw new Error('UID-04 Failed: Unauthenticated state read User B or A data.');
  }
  
  // Test write when null
  try {
    const taskNull: Task = { id: 'task-null', title: 'Null Task', completed: false, date: '2025-01-01', priority: 'medium', createdAt: new Date().toISOString() };
    await repo.create(taskNull);
  } catch(e) { }
  const checkNullAgain = await repo.getAll();
  if (checkNullAgain.length !== 0) {
    throw new Error('UID-04 Failed: Null user managed to write data.');
  }
  console.log("✅ [PASS] UID-04: Unauthenticated state cannot read/write namespace.");

  // UID-05: Switch back to User A
  AuthLifecycle.reset('user_a');
  const tasksA_again = await repo.getAll();
  if (tasksA_again.length !== 1 || tasksA_again[0].id !== 'task-a') {
    throw new Error('UID-05 Failed: User A did not receive User A data after returning from null.');
  }
  console.log("✅ [PASS] UID-05: User A receives only A's namespace.");
  console.log("✅ [PASS] UID-06: A -> B -> A isolated and recoverable.");

  // UID-07: Namespace determinism
  const rawData = storageService.getItem<Task[]>('novo:user_a:novo_v1_tasks', []);
  if (rawData.length !== 1 || rawData[0].id !== 'task-a') {
    throw new Error('UID-07 Failed: Underlying storage key does not match deterministic format.');
  }
  console.log("✅ [PASS] UID-07: Repository namespace/key determinism is correct.");

  // UID-08: Storage event isolation
  AuthLifecycle.reset('user_a');
  let subscriptionTriggered = false;
  const unsubscribe = repo.subscribe((items) => {
    subscriptionTriggered = true;
  });

  // User A is active. Simulate an event for User B's namespace.
  const eventB = new CustomEvent('novo-storage-update', {
    detail: { key: 'novo:user_b:novo_v1_tasks', value: [] }
  });
  window.dispatchEvent(eventB);

  if (subscriptionTriggered) {
    throw new Error('UID-08 Failed: User A subscription reacted to User B event.');
  }

  // Simulate an event for User A's namespace.
  const eventA = new CustomEvent('novo-storage-update', {
    detail: { key: 'novo:user_a:novo_v1_tasks', value: [] }
  });
  window.dispatchEvent(eventA);

  if (!subscriptionTriggered) {
    throw new Error('UID-08 Failed: User A subscription did not react to User A event.');
  }
  
  unsubscribe();
  console.log("✅ [PASS] UID-08: Storage events are isolated per namespace.");

  // UID-09: Legacy global key isolation
  storageService.setItem('novo_v1_tasks', [{ id: 'legacy', title: 'Legacy', completed: false, priority: 'low', date: '2025', createdAt: '' }]);
  const tasksA_legacy_check = await repo.getAll();
  if (tasksA_legacy_check.some(t => t.id === 'legacy')) {
    throw new Error('UID-09 Failed: User A hydrated legacy global data.');
  }
  console.log("✅ [PASS] UID-09: Legacy global key isolation maintained.");

  // UID-10: Async identity race
  AuthLifecycle.reset('user_b');
  const taskB: Task = { id: 'task-b', title: 'User B Task', completed: false, date: '2025-01-01', priority: 'medium', createdAt: new Date().toISOString() };
  
  // Start operation under User B
  // The method yields internally, allowing us to change identity before it commits
  const writePromise = repo.create(taskB);
  
  // Instantly switch to User C BEFORE the promise resolves
  AuthLifecycle.reset('user_c');
  
  let threw = false;
  try {
    await writePromise;
  } catch (err: any) {
    threw = true;
    if (!err.message.includes('aborted')) {
      throw new Error('UID-10 Failed: Expected abort error, got: ' + err.message);
    }
  }
  
  if (!threw) {
    throw new Error('UID-10 Failed: Operation did not abort! It allowed a silent identity switch.');
  }

  // Verify User C namespace is empty
  const tasksC = await repo.getAll();
  if (tasksC.length !== 0) throw new Error('UID-10 Failed: User C namespace was polluted.');
  
  // Verify User B namespace is empty
  AuthLifecycle.reset('user_b');
  const tasksB2 = await repo.getAll();
  if (tasksB2.length !== 0) throw new Error('UID-10 Failed: User B namespace was mutated despite abort.');
  
  console.log("✅ [PASS] UID-10: Async identity race is safely mitigated by repository guards.");
  
  // Cleanup
  storageService.removeItem('novo:user_a:novo_v1_tasks');
  storageService.removeItem('novo:user_b:novo_v1_tasks');
  storageService.removeItem('novo:user_c:novo_v1_tasks');
  storageService.removeItem('novo_v1_tasks');
  
  console.log("=== ALL UID TESTS PASSED ===");
}

runUIDTests().catch(err => {
  console.error("Test failed", err);
  process.exit(1);
});
