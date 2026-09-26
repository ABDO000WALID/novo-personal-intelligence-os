import './test_env.ts';
import { useTaskStore } from './src/core/state/taskStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';

console.log("=== RUNNING PHASE 9.2E-2B REGRESSION GATE (TASKS ASYNC) ===\n");

async function runTest(id: string, action: string, expected: string, execute: () => Promise<boolean> | boolean) {
  let passed = false;
  try {
    passed = await execute();
  } catch (e) {
    console.error(e);
    passed = false;
  }
  console.log(`TEST ID: ${id}`);
  console.log(`ACTION: ${action}`);
  console.log(`EXPECTED RESULT: ${expected}`);
  console.log(`ACTUAL RESULT: ${passed ? 'Data matches expected state' : 'Data mismatch or error'}`);
  console.log(`PASS/FAIL: ${passed ? 'PASS' : 'FAIL'}\n`);
}

const resetStore = () => {
  (RepositoryFactory.getTaskRepository() as any)._saveAllSync([]);
  useTaskStore.setState({ tasks: [], status: 'idle', error: null });
};

async function runAll() {

// TASK-ASYNC-01
resetStore();
await runTest(
  'TASK-ASYNC-01',
  'Initialize store from existing repository data asynchronously.',
  'Store correctly loads existing tasks on module load/init using getAll().',
  async () => {
    (RepositoryFactory.getTaskRepository() as any)._saveAllSync([{
      id: 'legacy-task-1', title: 'Legacy Task', completed: false, priority: 'medium', date: '2026-09-07', createdAt: '2026-09-07T00:00:00Z'
    }]);
    
    await useTaskStore.getState().initialize();
    return useTaskStore.getState().tasks.length === 1 && useTaskStore.getState().tasks[0].id === 'legacy-task-1' && useTaskStore.getState().status === 'ready';
  }
);

// TASK-ASYNC-02
resetStore();
await runTest(
  'TASK-ASYNC-02',
  'initialize is idempotent and does not duplicate loads.',
  'Loading state prevents duplicate fetches.',
  async () => {
    useTaskStore.setState({ status: 'loading' });
    await useTaskStore.getState().initialize();
    return useTaskStore.getState().tasks.length === 0; // aborted early
  }
);

// TASK-ASYNC-03
resetStore();
await useTaskStore.getState().initialize();
await runTest(
  'TASK-ASYNC-03',
  'Create task -> Zustand state updates -> Repository persists (async).',
  'Task is added to Zustand and Repository identically.',
  async () => {
    await useTaskStore.getState().createTask('New Async Task', 'high');
    const storeTasks = useTaskStore.getState().tasks;
    const repoTasks = await RepositoryFactory.getTaskRepository().getAll();
    
    return storeTasks.length === 1 && repoTasks.length === 1 && storeTasks[0].title === 'New Async Task';
  }
);

// TASK-ASYNC-04
await runTest(
  'TASK-ASYNC-04',
  'Update task -> Zustand state updates -> Repository persists (async).',
  'Task is updated in both sources.',
  async () => {
    const taskId = useTaskStore.getState().tasks[0].id;
    await useTaskStore.getState().updateTask(taskId, { title: 'Updated Title' });
    
    const storeTasks = useTaskStore.getState().tasks;
    const repoTasks = await RepositoryFactory.getTaskRepository().getAll();
    
    return storeTasks[0].title === 'Updated Title' && repoTasks[0].title === 'Updated Title';
  }
);

// TASK-ASYNC-05
await runTest(
  'TASK-ASYNC-05',
  'Toggle task -> Zustand state updates -> Repository persists (async).',
  'Task toggles safely.',
  async () => {
    const taskId = useTaskStore.getState().tasks[0].id;
    await useTaskStore.getState().toggleTask(taskId);
    
    return useTaskStore.getState().tasks[0].completed === true 
         && (await RepositoryFactory.getTaskRepository().getAll())[0].completed === true;
  }
);

// TASK-ASYNC-06
await runTest(
  'TASK-ASYNC-06',
  'Delete task -> removed from state and repository.',
  'Task is permanently removed.',
  async () => {
    const taskId = useTaskStore.getState().tasks[0].id;
    await useTaskStore.getState().deleteTask(taskId);
    
    return useTaskStore.getState().tasks.length === 0 
         && (await RepositoryFactory.getTaskRepository().getAll()).length === 0;
  }
);

// TASK-ASYNC-07
await runTest(
  'TASK-ASYNC-07',
  'Create failure rolls back only the created Task.',
  'State is unmutated if persistence fails.',
  async () => {
    resetStore();
    await useTaskStore.getState().initialize();
    const originalTasks = [...useTaskStore.getState().tasks];
    
    const originalGetRepo = RepositoryFactory.getTaskRepository;
    RepositoryFactory.getTaskRepository = () => ({
      getAll: async () => [],
      getAllSync: () => [],
      saveAll: async () => {},
      saveAllSync: () => {},
      getById: async () => null,
      create: async () => { throw new Error('Quota Exceeded'); },
      update: async () => {},
      delete: async () => {},
    } as any);
    
    let caught = false;
    try {
      await useTaskStore.getState().createTask('Should Fail');
    } catch (e) {
      caught = true;
    }
    
    RepositoryFactory.getTaskRepository = originalGetRepo;
    return caught && useTaskStore.getState().tasks.length === originalTasks.length && useTaskStore.getState().error === 'Quota Exceeded';
  }
);

// TASK-ASYNC-08
await runTest(
  'TASK-ASYNC-08',
  'Update failure rolls back the affected Task.',
  'Targeted rollback works.',
  async () => {
    resetStore();
    await useTaskStore.getState().initialize();
    const t = await useTaskStore.getState().createTask('Initial Task');
    const originalCompleted = t.completed;

    const originalGetRepo = RepositoryFactory.getTaskRepository;
    RepositoryFactory.getTaskRepository = () => ({
      getAll: async () => [t],
      getAllSync: () => [t],
      saveAll: async () => {},
      saveAllSync: () => {},
      getById: async () => t,
      create: async () => {},
      update: async () => { throw new Error('Update Failed'); },
      delete: async () => {},
    } as any);

    let caught = false;
    try {
      await useTaskStore.getState().toggleTask(t.id);
    } catch (e) {
      caught = true;
    }

    RepositoryFactory.getTaskRepository = originalGetRepo;
    const finalTask = useTaskStore.getState().tasks.find(x => x.id === t.id);
    return caught && finalTask?.completed === originalCompleted && useTaskStore.getState().error === 'Update Failed';
  }
);

// TASK-ASYNC-09
await runTest(
  'TASK-ASYNC-09',
  'Delete failure restores the affected Task.',
  'Targeted rollback puts it back.',
  async () => {
    resetStore();
    await useTaskStore.getState().initialize();
    const t = await useTaskStore.getState().createTask('Delete Me');

    const originalGetRepo = RepositoryFactory.getTaskRepository;
    RepositoryFactory.getTaskRepository = () => ({
      getAll: async () => [t],
      getAllSync: () => [t],
      saveAll: async () => {},
      saveAllSync: () => {},
      getById: async () => t,
      create: async () => {},
      update: async () => {},
      delete: async () => { throw new Error('Delete Failed'); },
    } as any);

    let caught = false;
    try {
      await useTaskStore.getState().deleteTask(t.id);
    } catch (e) {
      caught = true;
    }

    RepositoryFactory.getTaskRepository = originalGetRepo;
    return caught && useTaskStore.getState().tasks.some(x => x.id === t.id) && useTaskStore.getState().error === 'Delete Failed';
  }
);

// TASK-ASYNC-10
await runTest(
  'TASK-ASYNC-10',
  'Operation A fails after B succeeds, verify A rollback does NOT erase B state.',
  'Targeted rollback works under concurrency.',
  async () => {
    resetStore();
    await useTaskStore.getState().initialize();
    const t1 = await useTaskStore.getState().createTask('Task A');
    const t2 = await useTaskStore.getState().createTask('Task B');

    const originalGetRepo = RepositoryFactory.getTaskRepository;
    
    RepositoryFactory.getTaskRepository = () => ({
      getAll: async () => useTaskStore.getState().tasks,
      getAllSync: () => useTaskStore.getState().tasks,
      saveAll: async () => {},
      saveAllSync: () => {},
      getById: async () => null,
      create: async () => {},
      update: async (id: string) => { 
        if (id === t1.id) throw new Error('Update Failed for A');
      },
      delete: async () => {},
    } as any);

    let aCaught = false;
    
    const promiseA = useTaskStore.getState().toggleTask(t1.id).catch(() => { aCaught = true; });
    const promiseB = useTaskStore.getState().toggleTask(t2.id);

    await Promise.all([promiseA, promiseB]);

    RepositoryFactory.getTaskRepository = originalGetRepo;
    const finalA = useTaskStore.getState().tasks.find(x => x.id === t1.id);
    const finalB = useTaskStore.getState().tasks.find(x => x.id === t2.id);

    return aCaught && finalA?.completed === false && finalB?.completed === true;
  }
);

// TASK-ASYNC-11
await runTest(
  'TASK-ASYNC-11',
  'Same-task concurrent update A fails, B succeeds. B state survives.',
  'Targeted rollback uses identity check and aborts if newer version exists.',
  async () => {
    resetStore();
    await useTaskStore.getState().initialize();
    const t1 = await useTaskStore.getState().createTask('Task A');

    const originalGetRepo = RepositoryFactory.getTaskRepository;
    
    let aStarted = false;
    RepositoryFactory.getTaskRepository = () => ({
      getAll: async () => useTaskStore.getState().tasks,
      getAllSync: () => useTaskStore.getState().tasks,
      saveAll: async () => {},
      saveAllSync: () => {},
      getById: async () => null,
      create: async () => {},
      update: async (id: string, updates: any) => { 
        if (!aStarted && updates.title === 'Title A') {
            aStarted = true;
            // Delay and fail A
            await new Promise(r => setTimeout(r, 50));
            throw new Error('Update Failed for A');
        }
        // B succeeds immediately
      },
      delete: async () => {},
    } as any);

    let aCaught = false;
    
    const promiseA = useTaskStore.getState().updateTask(t1.id, { title: 'Title A' }).catch(() => { aCaught = true; });
    
    // Slight delay to ensure A gets the lock in state, then B overrides the state
    await new Promise(r => setTimeout(r, 10));
    const promiseB = useTaskStore.getState().updateTask(t1.id, { title: 'Title B' });

    await Promise.all([promiseA, promiseB]);

    RepositoryFactory.getTaskRepository = originalGetRepo;
    const finalA = useTaskStore.getState().tasks.find(x => x.id === t1.id);

    // B should survive because A's rollback sees the task reference has changed.
    return aCaught && finalA?.title === 'Title B';
  }
);

// TASK-ASYNC-12
await runTest(
  'TASK-ASYNC-12',
  'Update A fails while delete B succeeds. A rollback does not resurrect task.',
  'Targeted rollback puts it back.',
  async () => {
    resetStore();
    await useTaskStore.getState().initialize();
    const t = await useTaskStore.getState().createTask('Update Me Then Delete Me');

    const originalGetRepo = RepositoryFactory.getTaskRepository;
    
    let aStarted = false;
    RepositoryFactory.getTaskRepository = () => ({
      getAll: async () => useTaskStore.getState().tasks,
      getAllSync: () => useTaskStore.getState().tasks,
      saveAll: async () => {},
      saveAllSync: () => {},
      getById: async () => null,
      create: async () => {},
      update: async (id: string, updates: any) => { 
        if (!aStarted) {
            aStarted = true;
            await new Promise(r => setTimeout(r, 50));
            throw new Error('Update Failed for A');
        }
      },
      delete: async () => {},
    } as any);

    let aCaught = false;
    const promiseA = useTaskStore.getState().updateTask(t.id, { title: 'Pending Update' }).catch(() => { aCaught = true; });
    
    await new Promise(r => setTimeout(r, 10));
    const promiseB = useTaskStore.getState().deleteTask(t.id);

    await Promise.all([promiseA, promiseB]);

    RepositoryFactory.getTaskRepository = originalGetRepo;
    return aCaught && useTaskStore.getState().tasks.find(x => x.id === t.id) === undefined;
  }
);

// TASK-ASYNC-13
await runTest(
  'TASK-ASYNC-13',
  'Optimistic timing: state is updated before repository Promise resolves.',
  'Zustand updates immediately.',
  async () => {
    resetStore();
    await useTaskStore.getState().initialize();
    
    const originalGetRepo = RepositoryFactory.getTaskRepository;
    let resolveRepoPromise: () => void;
    
    RepositoryFactory.getTaskRepository = () => ({
      getAll: async () => useTaskStore.getState().tasks,
      getAllSync: () => useTaskStore.getState().tasks,
      saveAll: async () => {},
      saveAllSync: () => {},
      getById: async () => null,
      create: async () => { 
        return new Promise<void>((resolve) => {
          resolveRepoPromise = resolve;
        });
      },
      update: async () => {},
      delete: async () => {},
    } as any);

    // 1. Start create operation
    const createPromise = useTaskStore.getState().createTask('Optimistic Task');
    
    // 2. Zustand state should already have the task before the promise resolves
    const hasTaskBeforeResolve = useTaskStore.getState().tasks.some(t => t.title === 'Optimistic Task');
    
    // 3. Resolve repository promise
    resolveRepoPromise!();
    await createPromise;
    
    // 4. Final state check
    const hasTaskAfterResolve = useTaskStore.getState().tasks.some(t => t.title === 'Optimistic Task');

    RepositoryFactory.getTaskRepository = originalGetRepo;
    return hasTaskBeforeResolve && hasTaskAfterResolve;
  }
);

  console.log("=== TESTS COMPLETE ===");
}

runAll();
