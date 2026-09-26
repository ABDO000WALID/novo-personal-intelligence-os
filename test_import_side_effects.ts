import './test_env.ts';

let taskReadCount = 0;
let goalReadCount = 0;
let noteReadCount = 0;

// Mock the repository factory before importing stores
import { RepositoryFactory } from './src/core/data/RepositoryFactory';

const origTaskRepo = RepositoryFactory.getTaskRepository;
RepositoryFactory.getTaskRepository = () => ({
  ...origTaskRepo(),
  getAllSync: () => { taskReadCount++; return (origTaskRepo() as any)._getAllSync(); }
});

const origGoalRepo = RepositoryFactory.getGoalRepository;
RepositoryFactory.getGoalRepository = () => ({
  ...origGoalRepo(),
  getAllSync: () => { goalReadCount++; return (origGoalRepo() as any)._getAllSync(); }
});

const origNoteRepo = RepositoryFactory.getNoteRepository;
RepositoryFactory.getNoteRepository = () => ({
  ...origNoteRepo(),
  getAllSync: () => { noteReadCount++; return (origNoteRepo() as any)._getAllSync(); }
});

async function run() {
  await import('./src/core/state/taskStore.js');
  await import('./src/core/state/goalStore.js');
  await import('./src/core/state/noteStore.js');
  
  console.log(`Task reads on import: ${taskReadCount}`);
  console.log(`Goal reads on import: ${goalReadCount}`);
  console.log(`Note reads on import: ${noteReadCount}`);

  if (taskReadCount === 0 && goalReadCount === 0 && noteReadCount === 0) {
    console.log("PASS: No repository reads during module import.");
    process.exit(0);
  } else {
    console.log("FAIL: Repository reads occurred during module import.");
    process.exit(1);
  }
}

run().catch(console.error);
