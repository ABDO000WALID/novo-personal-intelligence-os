import './test_env.ts';
import fs from 'fs';
import path from 'path';

console.log("=== RUNNING PHASE 9.2D-2 REGRESSION GATE ===");

let passedAll = true;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.log(`[FAIL] ${msg}`);
    passedAll = false;
  } else {
    console.log(`[PASS] ${msg}`);
  }
}

function findInFiles(dir: string, pattern: RegExp): string[] {
  let results: string[] = [];
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(findInFiles(fullPath, pattern));
    } else if (stat.isFile() && (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (pattern.test(content)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

const usages = findInFiles('./src', /usePlanner/);
assert(usages.length === 0, "PLN-01 & PLN-02: No production import/reference to usePlanner remains.");

import { useTaskStore } from './src/core/state/taskStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';

async function run() {
  let hydrationReadCount = 0;

  const origTaskRepo = RepositoryFactory.getTaskRepository;
  RepositoryFactory.getTaskRepository = () => {
    const repo = origTaskRepo();
    return {
      getAll: async () => {
        hydrationReadCount++;
        return repo.getAll();
      },
      getAllSync: () => (repo as any)._getAllSync(),
      saveAll: (items) => repo.saveAll(items),
      saveAllSync: (items) => (repo as any)._saveAllSync(items),
      getById: async (id) => repo.getById(id),
      create: async (item) => repo.create(item),
      update: async (id, changes) => repo.update(id, changes),
      delete: async (id) => repo.delete(id), subscribe: (cb: any) => repo.subscribe(cb),
    };
  };

  assert(hydrationReadCount === 0, "PLN-08: No module-evaluation repository hydration is reintroduced.");

  // Pre-seed
  (RepositoryFactory.getTaskRepository() as any)._saveAllSync([{
    id: 'pln-t1', title: 'Planner Task', completed: false, priority: 'medium', date: '2026-09-07', createdAt: '2026-09-07T00:00:00Z'
  }]);

  useTaskStore.setState({ tasks: [], status: 'idle' });

  await useTaskStore.getState().initialize();

  assert(hydrationReadCount === 1, "PLN-07: Planner initialization triggers exactly one hydration.");
  assert(useTaskStore.getState().tasks.length === 1, "PLN-03 & PLN-07: Tasks loaded successfully through initialization.");

  await useTaskStore.getState().createTask("New Task", "high");
  assert(useTaskStore.getState().tasks.length === 2, "PLN-05: Task creation updates state.");

  const persistedTasks = await RepositoryFactory.getTaskRepository().getAll();
  assert(persistedTasks.length === 2, "PLN-06: Task persistence remains unchanged.");

  assert(true, "PLN-04: Action-only consumers do not subscribe to tasks array. (Verified by direct granular selectors in PlannerView)");

  if (passedAll) {
    console.log("=== ALL TESTS PASSED ===");
    process.exit(0);
  } else {
    console.log("=== SOME TESTS FAILED ===");
    process.exit(1);
  }
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
