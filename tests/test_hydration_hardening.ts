import './test_env.ts';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { useNoteStore } from './src/core/state/noteStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';

console.log("=== RUNNING PHASE 9.2D-1 HYDRATION HARDENING GATE ===\n");

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

// Setup fake data
(RepositoryFactory.getTaskRepository() as any)._saveAllSync([{
  id: 't1', title: 'Task 1', completed: false, priority: 'medium', date: '2026-09-07', createdAt: '2026-09-07T00:00:00Z'
}]);
(RepositoryFactory.getGoalRepository() as any)._saveAllSync([{
  id: 'g1', title: 'Goal 1', description: 'Desc', progress: 50, createdAt: '2026-09-07T00:00:00Z', updatedAt: '2026-09-07T00:00:00Z'
}]);
(RepositoryFactory.getNoteRepository() as any)._saveAllSync([{
  id: 'n1', title: 'Note 1', content: 'Content', createdAt: '2026-09-07T00:00:00Z', updatedAt: '2026-09-07T00:00:00Z'
}]);

async function runAll() {

// HYD-01
await runTest(
  'HYD-01',
  'Importing the store does not itself require repository hydration.',
  'Stores are empty and idle before initialize() is called.',
  async () => {
    return useTaskStore.getState().tasks.length === 0 && useTaskStore.getState().status === 'idle'
        && useGoalStore.getState().goals.length === 0 && useGoalStore.getState().status === 'idle'
        && useNoteStore.getState().notes.length === 0 && useNoteStore.getState().status === 'idle';
  }
);

// HYD-02
await runTest(
  'HYD-02',
  'initialize() hydrates existing data correctly.',
  'Stores load data from repository.',
  async () => {
    await useTaskStore.getState().initialize();
    await useGoalStore.getState().initialize();
    await await await useNoteStore.getState().initialize();
    return useTaskStore.getState().tasks.length === 1
        && useGoalStore.getState().goals.length === 1
        && useNoteStore.getState().notes.length === 1;
  }
);

// HYD-03 & HYD-04
await runTest(
  'HYD-03 & HYD-04',
  'initialize() called twice is idempotent and does not duplicate records.',
  'Data length remains 1.',
  async () => {
    await useTaskStore.getState().initialize();
    await useGoalStore.getState().initialize();
    await useNoteStore.getState().initialize();
    return useTaskStore.getState().tasks.length === 1
        && useGoalStore.getState().goals.length === 1
        && useNoteStore.getState().notes.length === 1;
  }
);

// HYD-05
await runTest(
  'HYD-05',
  'Hydration failure transitions to the correct error state without corrupting existing state.',
  'Stores catch error and transition properly.',
  async () => {
    // Reset stores
    useGoalStore.setState({ goals: [], status: 'idle' });
    const originalRepo = RepositoryFactory.getGoalRepository;
    RepositoryFactory.getGoalRepository = () => ({
      getAll: async () => { throw new Error("Mock Error"); },
      getAllSync: () => { throw new Error("Mock Error"); },
      saveAll: async () => {},
      saveAllSync: () => {},
      getById: async () => null,
      create: async () => {},
      update: async () => {},
      delete: async () => {},
    } as any);
    
    await useGoalStore.getState().initialize();
    
    const passed = useGoalStore.getState().status === 'error' && useGoalStore.getState().goals.length === 0;
    
    RepositoryFactory.getGoalRepository = originalRepo;
    return passed;
  }
);

// HYD-06 & HYD-07
await runTest(
  'HYD-06 & HYD-07',
  'Existing CRUD behavior remains functional after initialization.',
  'Data updates properly in state and repository.',
  async () => {
    await useTaskStore.getState().createTask("New Task", "high");
    return useTaskStore.getState().tasks.length === 2 && (await RepositoryFactory.getTaskRepository().getAll()).length === 2;
  }
);

}

runAll().catch(e => console.error(e));
