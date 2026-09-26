import './test_env.ts';
import { useGoalStore } from './src/core/state/goalStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';

console.log("=== RUNNING PHASE 9.2E-2C REGRESSION GATE (GOALS ASYNC) ===\n");

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
  (RepositoryFactory.getGoalRepository() as any)._saveAllSync([]);
  useGoalStore.setState({ goals: [], status: 'idle', error: null });
};

async function runAll() {

// GOAL-ASYNC-01
resetStore();
await runTest(
  'GOAL-ASYNC-01',
  'Initialize store from existing repository data asynchronously.',
  'Store correctly loads existing goals on module load/init using getAll().',
  async () => {
    (RepositoryFactory.getGoalRepository() as any)._saveAllSync([{
      id: 'legacy-goal-1', title: 'Legacy Goal', description: '', progress: 50, createdAt: '2026-09-07T00:00:00Z', updatedAt: '2026-09-07T00:00:00Z'
    }]);
    
    await useGoalStore.getState().initialize();
    return useGoalStore.getState().goals.length === 1 && useGoalStore.getState().goals[0].id === 'legacy-goal-1' && useGoalStore.getState().status === 'ready';
  }
);

// GOAL-ASYNC-02
resetStore();
await runTest(
  'GOAL-ASYNC-02',
  'Initialization idempotency.',
  'Loading state prevents duplicate fetches.',
  async () => {
    let readCount = 0;
    const originalGetRepo = RepositoryFactory.getGoalRepository;
    RepositoryFactory.getGoalRepository = () => {
      const repo = originalGetRepo();
      return {
        ...repo, // We can spread properties, but not prototype methods
        getAll: async () => {
          readCount++;
          return repo.getAll();
        },
        getAllSync: () => (repo as any)._getAllSync(),
        saveAll: (i) => repo.saveAll(i),
        saveAllSync: (i) => (repo as any)._saveAllSync(i),
        getById: (id) => repo.getById(id),
        create: (i) => repo.create(i),
        delete: (id) => repo.delete(id),
        update: (id, updates) => repo.update(id, updates)
      } as any;
    };

    useGoalStore.setState({ status: 'loading' });
    await useGoalStore.getState().initialize();
    const stoppedEarly = readCount === 0;

    RepositoryFactory.getGoalRepository = originalGetRepo;
    return stoppedEarly;
  }
);

// GOAL-ASYNC-03
resetStore();
await useGoalStore.getState().initialize();
await runTest(
  'GOAL-ASYNC-03',
  'Create success.',
  'Goal is added to Zustand and Repository identically.',
  async () => {
    await useGoalStore.getState().createGoal('New Zustand Goal', 'Desc', 10);
    const storeGoals = useGoalStore.getState().goals;
    const repoGoals = await RepositoryFactory.getGoalRepository().getAll();
    
    return storeGoals.length === 1 && repoGoals.length === 1 && storeGoals[0].title === 'New Zustand Goal';
  }
);

// GOAL-ASYNC-04
await runTest(
  'GOAL-ASYNC-04',
  'Update success.',
  'Goal is updated in both sources.',
  async () => {
    const goalId = useGoalStore.getState().goals[0].id;
    await useGoalStore.getState().updateGoal(goalId, { title: 'Updated Title' });
    
    const storeGoals = useGoalStore.getState().goals;
    const repoGoals = await RepositoryFactory.getGoalRepository().getAll();
    
    return storeGoals[0].title === 'Updated Title' && repoGoals[0].title === 'Updated Title';
  }
);

// GOAL-ASYNC-05
await runTest(
  'GOAL-ASYNC-05',
  'Update progress success.',
  'Goal progress is updated in both sources.',
  async () => {
    const goalId = useGoalStore.getState().goals[0].id;
    await useGoalStore.getState().updateProgress(goalId, 50);
    
    const storeGoals = useGoalStore.getState().goals;
    const repoGoals = await RepositoryFactory.getGoalRepository().getAll();
    
    return storeGoals[0].progress === 50 && repoGoals[0].progress === 50;
  }
);

// GOAL-ASYNC-06
await runTest(
  'GOAL-ASYNC-06',
  'Delete success.',
  'Goal is permanently removed.',
  async () => {
    const goalId = useGoalStore.getState().goals[0].id;
    await useGoalStore.getState().deleteGoal(goalId);
    
    return useGoalStore.getState().goals.length === 0 
         && (await RepositoryFactory.getGoalRepository().getAll()).length === 0;
  }
);

// GOAL-ASYNC-07
await runTest(
  'GOAL-ASYNC-07',
  'Create failure rollback.',
  'State is unmutated if persistence fails.',
  async () => {
    resetStore();
    await useGoalStore.getState().initialize();
    const originalGoals = [...useGoalStore.getState().goals];
    
    const originalGetRepo = RepositoryFactory.getGoalRepository;
    RepositoryFactory.getGoalRepository = () => {
      const repo = originalGetRepo();
      return {
        getAll: () => repo.getAll(),
        getAllSync: () => (repo as any)._getAllSync(),
        saveAll: (i) => repo.saveAll(i),
        saveAllSync: (i) => (repo as any)._saveAllSync(i),
        getById: (id) => repo.getById(id),
        delete: (id) => repo.delete(id),
        update: (id, updates) => repo.update(id, updates),
        create: async () => { throw new Error('Quota Exceeded'); },
      } as any;
    };
    
    let caught = false;
    try {
      await useGoalStore.getState().createGoal('Should Fail');
    } catch (e) {
      caught = true;
    }
    
    RepositoryFactory.getGoalRepository = originalGetRepo;
    return caught && useGoalStore.getState().goals.length === originalGoals.length && useGoalStore.getState().error === 'Quota Exceeded';
  }
);

// GOAL-ASYNC-08
await runTest(
  'GOAL-ASYNC-08',
  'Update failure rollback.',
  'Targeted rollback works.',
  async () => {
    resetStore();
    await useGoalStore.getState().initialize();
    const g = await useGoalStore.getState().createGoal('Initial Goal');
    const originalProgress = g.progress;

    const originalGetRepo = RepositoryFactory.getGoalRepository;
    RepositoryFactory.getGoalRepository = () => {
      const repo = originalGetRepo();
      return {
        getAll: () => repo.getAll(),
        getAllSync: () => (repo as any)._getAllSync(),
        saveAll: (i) => repo.saveAll(i),
        saveAllSync: (i) => (repo as any)._saveAllSync(i),
        getById: (id) => repo.getById(id),
        create: (i) => repo.create(i),
        delete: (id) => repo.delete(id),
        update: async () => { throw new Error('Update Failed'); },
      } as any;
    };

    let caught = false;
    try {
      await useGoalStore.getState().updateProgress(g.id, 99);
    } catch (e) {
      caught = true;
    }

    RepositoryFactory.getGoalRepository = originalGetRepo;
    const finalGoal = useGoalStore.getState().goals.find(x => x.id === g.id);
    return caught && finalGoal?.progress === originalProgress && useGoalStore.getState().error === 'Update Failed';
  }
);

// GOAL-ASYNC-09
await runTest(
  'GOAL-ASYNC-09',
  'Delete failure rollback.',
  'Targeted rollback puts it back.',
  async () => {
    resetStore();
    await useGoalStore.getState().initialize();
    const g = await useGoalStore.getState().createGoal('Delete Me');

    const originalGetRepo = RepositoryFactory.getGoalRepository;
    RepositoryFactory.getGoalRepository = () => {
      const repo = originalGetRepo();
      return {
        getAll: () => repo.getAll(),
        getAllSync: () => (repo as any)._getAllSync(),
        saveAll: (i) => repo.saveAll(i),
        saveAllSync: (i) => (repo as any)._saveAllSync(i),
        getById: (id) => repo.getById(id),
        create: (i) => repo.create(i),
        update: (id, updates) => repo.update(id, updates),
        delete: async () => { throw new Error('Delete Failed'); },
      } as any;
    };

    let caught = false;
    try {
      await useGoalStore.getState().deleteGoal(g.id);
    } catch (e) {
      caught = true;
    }

    RepositoryFactory.getGoalRepository = originalGetRepo;
    return caught && useGoalStore.getState().goals.some(x => x.id === g.id) && useGoalStore.getState().error === 'Delete Failed';
  }
);

// GOAL-ASYNC-10
await runTest(
  'GOAL-ASYNC-10',
  'Different-goal concurrent operations.',
  'Targeted rollback works under concurrency.',
  async () => {
    resetStore();
    await useGoalStore.getState().initialize();
    const g1 = await useGoalStore.getState().createGoal('Goal A');
    const g2 = await useGoalStore.getState().createGoal('Goal B');

    const originalGetRepo = RepositoryFactory.getGoalRepository;
    
    RepositoryFactory.getGoalRepository = () => {
      const repo = originalGetRepo();
      return {
        getAll: () => repo.getAll(),
        getAllSync: () => (repo as any)._getAllSync(),
        saveAll: (i) => repo.saveAll(i),
        saveAllSync: (i) => (repo as any)._saveAllSync(i),
        getById: (id) => repo.getById(id),
        create: (i) => repo.create(i),
        delete: (id) => repo.delete(id),
        update: async (id: string, updates: any) => { 
          if (id === g1.id) throw new Error('Update Failed for A');
          return repo.update(id, updates);
        },
      } as any;
    };

    let aCaught = false;
    
    const promiseA = useGoalStore.getState().updateProgress(g1.id, 99).catch(() => { aCaught = true; });
    const promiseB = useGoalStore.getState().updateProgress(g2.id, 99);

    await Promise.all([promiseA, promiseB]);

    RepositoryFactory.getGoalRepository = originalGetRepo;
    const finalA = useGoalStore.getState().goals.find(x => x.id === g1.id);
    const finalB = useGoalStore.getState().goals.find(x => x.id === g2.id);

    return aCaught && finalA?.progress === 0 && finalB?.progress === 99;
  }
);

// GOAL-ASYNC-11
await runTest(
  'GOAL-ASYNC-11',
  'Same-goal concurrent update A fails, B succeeds.',
  'B state survives.',
  async () => {
    resetStore();
    await useGoalStore.getState().initialize();
    const g1 = await useGoalStore.getState().createGoal('Goal A');

    const originalGetRepo = RepositoryFactory.getGoalRepository;
    
    let aStarted = false;
    RepositoryFactory.getGoalRepository = () => {
      const repo = originalGetRepo();
      return {
        getAll: () => repo.getAll(),
        getAllSync: () => (repo as any)._getAllSync(),
        saveAll: (i) => repo.saveAll(i),
        saveAllSync: (i) => (repo as any)._saveAllSync(i),
        getById: (id) => repo.getById(id),
        create: (i) => repo.create(i),
        delete: (id) => repo.delete(id),
        update: async (id: string, updates: any) => { 
          if (!aStarted && updates.title === 'Title A') {
              aStarted = true;
              await new Promise(r => setTimeout(r, 50));
              throw new Error('Update Failed for A');
          }
          return repo.update(id, updates);
        },
      } as any;
    };

    let aCaught = false;
    
    const promiseA = useGoalStore.getState().updateGoal(g1.id, { title: 'Title A' }).catch(() => { aCaught = true; });
    
    await new Promise(r => setTimeout(r, 10));
    const promiseB = useGoalStore.getState().updateGoal(g1.id, { title: 'Title B' });

    await Promise.all([promiseA, promiseB]);

    RepositoryFactory.getGoalRepository = originalGetRepo;
    const finalA = useGoalStore.getState().goals.find(x => x.id === g1.id);

    return aCaught && finalA?.title === 'Title B';
  }
);

// GOAL-ASYNC-12
await runTest(
  'GOAL-ASYNC-12',
  'Update A fails while delete B succeeds on the same goal.',
  'A must NOT resurrect the deleted goal.',
  async () => {
    resetStore();
    await useGoalStore.getState().initialize();
    const g = await useGoalStore.getState().createGoal('Update Me Then Delete Me');

    const originalGetRepo = RepositoryFactory.getGoalRepository;
    
    let aStarted = false;
    RepositoryFactory.getGoalRepository = () => {
      const repo = originalGetRepo();
      return {
        getAll: () => repo.getAll(),
        getAllSync: () => (repo as any)._getAllSync(),
        saveAll: (i) => repo.saveAll(i),
        saveAllSync: (i) => (repo as any)._saveAllSync(i),
        getById: (id) => repo.getById(id),
        create: (i) => repo.create(i),
        delete: (id) => repo.delete(id),
        update: async (id: string, updates: any) => { 
          if (!aStarted) {
              aStarted = true;
              await new Promise(r => setTimeout(r, 50));
              throw new Error('Update Failed for A');
          }
          return repo.update(id, updates);
        },
      } as any;
    };

    let aCaught = false;
    const promiseA = useGoalStore.getState().updateGoal(g.id, { title: 'Pending Update' }).catch(() => { aCaught = true; });
    
    await new Promise(r => setTimeout(r, 10));
    const promiseB = useGoalStore.getState().deleteGoal(g.id);

    await Promise.all([promiseA, promiseB]);

    RepositoryFactory.getGoalRepository = originalGetRepo;
    return aCaught && useGoalStore.getState().goals.find(x => x.id === g.id) === undefined;
  }
);

// GOAL-ASYNC-13
await runTest(
  'GOAL-ASYNC-13',
  'Explicit optimistic timing.',
  'State must change BEFORE repository Promise resolves.',
  async () => {
    resetStore();
    await useGoalStore.getState().initialize();
    
    const originalGetRepo = RepositoryFactory.getGoalRepository;
    let resolveRepoPromise: () => void;
    
    RepositoryFactory.getGoalRepository = () => {
      const repo = originalGetRepo();
      return {
        getAll: () => repo.getAll(),
        getAllSync: () => (repo as any)._getAllSync(),
        saveAll: (i) => repo.saveAll(i),
        saveAllSync: (i) => (repo as any)._saveAllSync(i),
        getById: (id) => repo.getById(id),
        update: (id, updates) => repo.update(id, updates),
        delete: (id) => repo.delete(id),
        create: async (i) => { 
          return new Promise<void>((resolve) => {
            resolveRepoPromise = () => {
              repo.create(i).then(resolve);
            };
          });
        },
      } as any;
    };

    const createPromise = useGoalStore.getState().createGoal('Optimistic Goal');
    
    const hasGoalBeforeResolve = useGoalStore.getState().goals.some(g => g.title === 'Optimistic Goal');
    
    resolveRepoPromise!();
    await createPromise;
    
    const hasGoalAfterResolve = useGoalStore.getState().goals.some(g => g.title === 'Optimistic Goal');

    RepositoryFactory.getGoalRepository = originalGetRepo;
    return hasGoalBeforeResolve && hasGoalAfterResolve;
  }
);

  console.log("=== TESTS COMPLETE ===");
}

runAll().catch(e => {
  console.error(e);
  process.exit(1);
});
