import './test_env.ts';
import { useTaskStore } from './src/core/state/taskStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { buildNOVOContext } from './src/core/intelligence/contextEngine';
import { buildAIGroundedContext } from './src/core/intelligence/contextBuilder';
import { Task } from './src/types/data';

import { AuthLifecycle } from "./src/core/auth/authLifecycle";
AuthLifecycle.reset("test_user");
console.log("=== RUNNING PHASE 9.2A REGRESSION GATE ===\n");

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

// Reset store state
const resetStore = () => {
  useTaskStore.setState({ tasks: [], status: 'idle' });
  (RepositoryFactory.getTaskRepository() as any)._saveAllSync([]);
};

async function runAll() {

// ZUST-01
resetStore();
await runTest(
  'ZUST-01',
  'Initialize store from existing repository data.',
  'Store correctly loads existing tasks.',
  async () => {
    (RepositoryFactory.getTaskRepository() as any)._saveAllSync([{
      id: 'legacy-1', title: 'Legacy Task', completed: false, priority: 'medium', date: '2026-09-07', createdAt: '2026-09-07T00:00:00Z'
    }]);
    
    await useTaskStore.getState().initialize();
    return useTaskStore.getState().tasks.length === 1 && useTaskStore.getState().tasks[0].id === 'legacy-1';
  }
);

// ZUST-02
resetStore();
await useTaskStore.getState().initialize();
await runTest(
  'ZUST-02',
  'Create task -> Zustand state updates -> Repository persists.',
  'Task is added to Zustand and Repository identically.',
  async () => {
    await useTaskStore.getState().createTask('New Zustand Task', 'high');
    const storeTasks = useTaskStore.getState().tasks;
    const repoTasks = await RepositoryFactory.getTaskRepository().getAll();
    
    return storeTasks.length === 1 && repoTasks.length === 1 && storeTasks[0].title === 'New Zustand Task';
  }
);

// ZUST-03
await runTest(
  'ZUST-03',
  'Update task -> UI state and repository remain consistent.',
  'Task is updated in both sources.',
  async () => {
    const taskId = useTaskStore.getState().tasks[0].id;
    await useTaskStore.getState().updateTask(taskId, { title: 'Updated Title' });
    
    const storeTasks = useTaskStore.getState().tasks;
    const repoTasks = await RepositoryFactory.getTaskRepository().getAll();
    
    return storeTasks[0].title === 'Updated Title' && repoTasks[0].title === 'Updated Title';
  }
);

// ZUST-04
await runTest(
  'ZUST-04',
  'Toggle completion -> persists after refresh simulation.',
  'Task toggles safely.',
  async () => {
    const taskId = useTaskStore.getState().tasks[0].id;
    await useTaskStore.getState().toggleTask(taskId);
    
    return useTaskStore.getState().tasks[0].completed === true 
         && (await RepositoryFactory.getTaskRepository().getAll())[0].completed === true;
  }
);

// ZUST-05
await runTest(
  'ZUST-05',
  'Delete task -> removed from state and repository.',
  'Task is permanently removed.',
  async () => {
    const taskId = useTaskStore.getState().tasks[0].id;
    await useTaskStore.getState().deleteTask(taskId);
    
    return useTaskStore.getState().tasks.length === 0 
         && (await RepositoryFactory.getTaskRepository().getAll()).length === 0;
  }
);

// ZUST-06
resetStore();
await runTest(
  'ZUST-06',
  'Multiple consumers mount -> initialization occurs once.',
  'Initialization guard prevents double reads.',
  async () => {
    useTaskStore.setState({ status: 'loading' });
    const oldUpdate = useTaskStore.getState().lastUpdated;
    await useTaskStore.getState().initialize();
    
    return useTaskStore.getState().lastUpdated === oldUpdate;
  }
);

// ZUST-07
resetStore();
await runTest(
  'ZUST-07',
  'High-priority task appears correctly in AI context.',
  'Context uses single source of truth.',
  async () => {
    await useTaskStore.getState().initialize();
    await useTaskStore.getState().createTask('Urgent Zustand Bug', 'high');
    
    const context = buildNOVOContext({
      tasks: useTaskStore.getState().tasks, // Need to pass from store directly as buildNOVOContext takes data
      goals: [], notes: [], sessions: [], transactions: [], conversations: [], knowledgeItems: []
    });
    const prompt = buildAIGroundedContext(context);
    
    return prompt.includes('Urgent Zustand Bug');
  }
);

}

runAll().catch(e => {
  console.error(e);
});
