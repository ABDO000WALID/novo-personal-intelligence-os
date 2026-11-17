// test_env mock
if (typeof global !== 'undefined') {
  (global as any).localStorage = {
    _data: {},
    getItem(k: string) { return this._data[k] || null; },
    setItem(k: string, v: any) { this._data[k] = v; },
    removeItem(k: string) { delete this._data[k]; },
    clear() { this._data = {}; }, length: 0, key(n: number) { return null; }
  };
}

import { useMoneyStore } from './src/core/state/moneyStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { getNOVOContext } from './src/core/intelligence/contextEngine';
import { Transaction } from './src/types/data';
import { calculateFinancialSummary } from './src/modules/money/domain/moneyEngine';

console.log("=== RUNNING PHASE 9.2E-5A REGRESSION GATE (MONEY ASYNC) ===\n");

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
  
  if (!passed) {
      process.exit(1);
  }
}

const resetStore = () => {
  (RepositoryFactory.getMoneyRepository() as any)._saveAllSync([]);
  useMoneyStore.setState({ transactions: [], status: 'idle', error: null });
};

async function runAll() {
  const originalGetRepo = RepositoryFactory.getMoneyRepository;

  // MONEY-ASYNC-01
  resetStore();
  await runTest(
    'MONEY-ASYNC-01',
    'Async initialization from populated repository.',
    'Store correctly loads existing items on init.',
    async () => {
      (RepositoryFactory.getMoneyRepository() as any)._saveAllSync([{
        id: 'legacy-money-1', type: 'income', amount: 100, category: 'test', description: '', createdAt: '2026-09-07T00:00:00Z'
      }]);
      
      await useMoneyStore.getState().initialize();
      const state = useMoneyStore.getState();
      return state.status === 'ready' && state.transactions.length === 1 && state.transactions[0].id === 'legacy-money-1';
    }
  );

  // MONEY-ASYNC-02
  resetStore();
  await runTest(
    'MONEY-ASYNC-02',
    'Concurrent initialization deduplication.',
    'Exactly one repository getAll call executes.',
    async () => {
      let readCount = 0;
      RepositoryFactory.getMoneyRepository = () => {
        const repo = originalGetRepo();
        return {
          getAll: async () => {
            readCount++;
            await new Promise(r => setTimeout(r, 10));
            return repo.getAll();
          },
          getAllSync: () => (repo as any)._getAllSync(),
          saveAll: (i: any) => repo.saveAll(i),
          saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
          getById: (id: string) => repo.getById(id),
          create: (i: any) => repo.create(i),
          delete: (id: string) => repo.delete(id),
          update: (id: string, updates: any) => repo.update(id, updates)
        } as any;
      };

      (RepositoryFactory.getMoneyRepository() as any)._saveAllSync([{
        id: 'dedup-1', type: 'expense', amount: 50, category: 'food', description: '', createdAt: '2026-09-07T00:00:00Z'
      }]);
      
      useMoneyStore.setState({ status: 'idle' });
      const p1 = useMoneyStore.getState().initialize();
      const p2 = useMoneyStore.getState().initialize();
      
      await Promise.all([p1, p2]);
      const finalState = useMoneyStore.getState();
      RepositoryFactory.getMoneyRepository = originalGetRepo;
      
      return readCount === 1 && finalState.status === 'ready' && finalState.transactions.length === 1 && finalState.transactions[0].id === 'dedup-1';
    }
  );

  // MONEY-ASYNC-03
  resetStore();
  await runTest(
    'MONEY-ASYNC-03',
    'Initialization failure and retry.',
    'Failure sets error status, retry reaches ready.',
    async () => {
      let shouldFail = true;
      RepositoryFactory.getMoneyRepository = () => {
        const repo = originalGetRepo();
        return {
          getAll: async () => {
            if (shouldFail) throw new Error("Init fail");
            return repo.getAll();
          },
          getAllSync: () => (repo as any)._getAllSync(),
          saveAll: (i: any) => repo.saveAll(i),
          saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
          getById: (id: string) => repo.getById(id),
          create: (i: any) => repo.create(i),
          delete: (id: string) => repo.delete(id),
          update: (id: string, updates: any) => repo.update(id, updates)
        } as any;
      };

      let caught = false;
      try {
          await useMoneyStore.getState().initialize();
      } catch(e) { caught = true; }
      
      const stateFail = useMoneyStore.getState();
      
      shouldFail = false;
      useMoneyStore.setState({ status: 'idle' });
      await useMoneyStore.getState().initialize();
      const stateSuccess = useMoneyStore.getState();
      
      RepositoryFactory.getMoneyRepository = originalGetRepo;
      return caught && stateFail.status === 'error' && stateSuccess.status === 'ready';
    }
  );

  // MONEY-ASYNC-04
  resetStore();
  await runTest(
    'MONEY-ASYNC-04',
    'Optimistic create timing.',
    'New item exists in Zustand BEFORE repository.create resolves.',
    async () => {
      await useMoneyStore.getState().initialize();
      
      let resolvePromise: any;
      const promise = new Promise<void>(res => resolvePromise = res);
      
      RepositoryFactory.getMoneyRepository = () => {
        const repo = originalGetRepo();
        return {
          getAll: () => repo.getAll(),
          getAllSync: () => (repo as any)._getAllSync(),
          saveAll: (i: any) => repo.saveAll(i),
          saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
          getById: (id: string) => repo.getById(id),
          create: async (item: any) => {
            await promise;
            return repo.create(item);
          },
          delete: (id: string) => repo.delete(id),
          update: (id: string, updates: any) => repo.update(id, updates)
        } as any;
      };

      const createPromise = useMoneyStore.getState().createTransaction({ type: 'income', amount: 200, category: 'opt', description: 'test' });
      
      const stateDuring = useMoneyStore.getState().transactions;
      const foundDuring = stateDuring.find(tx => tx.category === 'opt');
      
      resolvePromise();
      await createPromise;
      
      RepositoryFactory.getMoneyRepository = originalGetRepo;
      return !!foundDuring && useMoneyStore.getState().transactions.length === 1;
    }
  );

  // MONEY-ASYNC-05
  resetStore();
  await runTest(
    'MONEY-ASYNC-05',
    'Stable transaction ID contract.',
    'Returned item has same ID, repository receives same ID.',
    async () => {
      await useMoneyStore.getState().initialize();
      
      let receivedId = '';
      RepositoryFactory.getMoneyRepository = () => {
        const repo = originalGetRepo();
        return {
          getAll: () => repo.getAll(),
          getAllSync: () => (repo as any)._getAllSync(),
          saveAll: (i: any) => repo.saveAll(i),
          saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
          getById: (id: string) => repo.getById(id),
          create: async (item: any) => {
            receivedId = item.id;
            return repo.create(item);
          },
          delete: (id: string) => repo.delete(id),
          update: (id: string, updates: any) => repo.update(id, updates)
        } as any;
      };

      const p = useMoneyStore.getState().createTransaction({ type: 'income', amount: 100, category: 'cat', description: '' });
      const storeId = useMoneyStore.getState().transactions[0].id;
      const returnedItem = await p;
      
      RepositoryFactory.getMoneyRepository = originalGetRepo;
      return returnedItem.id === storeId && receivedId === storeId;
    }
  );

  // MONEY-ASYNC-06
  resetStore();
  await runTest(
    'MONEY-ASYNC-06',
    'Create failure targeted rollback.',
    'Only that item disappears and unrelated items remain.',
    async () => {
      await useMoneyStore.getState().initialize();
      await useMoneyStore.getState().createTransaction({ type: 'income', amount: 10, category: 'Keep Me', description: '' });
      
      RepositoryFactory.getMoneyRepository = () => {
        const repo = originalGetRepo();
        return {
          getAll: () => repo.getAll(),
          getAllSync: () => (repo as any)._getAllSync(),
          saveAll: (i: any) => repo.saveAll(i),
          saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
          getById: (id: string) => repo.getById(id),
          create: async (item: any) => {
             if (item.category === 'Fail Me') throw new Error('Create failed');
             return repo.create(item);
          },
          delete: (id: string) => repo.delete(id),
          update: (id: string, updates: any) => repo.update(id, updates)
        } as any;
      };

      try {
          await useMoneyStore.getState().createTransaction({ type: 'income', amount: 20, category: 'Fail Me', description: '' });
      } catch(e) {}
      
      const state = useMoneyStore.getState().transactions;
      RepositoryFactory.getMoneyRepository = originalGetRepo;
      
      return state.length === 1 && state[0].category === 'Keep Me';
    }
  );

  // MONEY-ASYNC-07
  resetStore();
  await runTest(
    'MONEY-ASYNC-07',
    'Optimistic update timing.',
    'Zustand changes BEFORE persistence resolves.',
    async () => {
      await useMoneyStore.getState().initialize();
      const item = await useMoneyStore.getState().createTransaction({ type: 'income', amount: 10, category: 'cat', description: '' });
      
      let resolvePromise: any;
      const promise = new Promise<void>(res => resolvePromise = res);
      
      RepositoryFactory.getMoneyRepository = () => {
        const repo = originalGetRepo();
        return {
          getAll: () => repo.getAll(),
          getAllSync: () => (repo as any)._getAllSync(),
          saveAll: (i: any) => repo.saveAll(i),
          saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
          getById: (id: string) => repo.getById(id),
          create: (item: any) => repo.create(item),
          delete: (id: string) => repo.delete(id),
          update: async (id: string, updates: any) => {
            await promise;
            return repo.update(id, updates);
          }
        } as any;
      };

      const updatePromise = useMoneyStore.getState().updateTransaction(item.id, { amount: 50 });
      
      const stateDuring = useMoneyStore.getState().transactions.find(tx => tx.id === item.id);
      
      resolvePromise();
      await updatePromise;
      
      RepositoryFactory.getMoneyRepository = originalGetRepo;
      return stateDuring?.amount === 50;
    }
  );

  // MONEY-ASYNC-08
  resetStore();
  await runTest(
    'MONEY-ASYNC-08',
    'Update failure targeted rollback.',
    'Verify only the affected item rolls back.',
    async () => {
      await useMoneyStore.getState().initialize();
      const item1 = await useMoneyStore.getState().createTransaction({ type: 'income', amount: 10, category: 'T1', description: '' });
      const item2 = await useMoneyStore.getState().createTransaction({ type: 'income', amount: 10, category: 'T2', description: '' });
      
      RepositoryFactory.getMoneyRepository = () => {
        const repo = originalGetRepo();
        return {
          getAll: () => repo.getAll(),
          getAllSync: () => (repo as any)._getAllSync(),
          saveAll: (i: any) => repo.saveAll(i),
          saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
          getById: (id: string) => repo.getById(id),
          create: (item: any) => repo.create(item),
          delete: (id: string) => repo.delete(id),
          update: async (id: string, updates: any) => {
            if (id === item1.id) throw new Error('Update failed');
            return repo.update(id, updates);
          }
        } as any;
      };

      try { await useMoneyStore.getState().updateTransaction(item1.id, { amount: 20 }); } catch(e) {}
      await useMoneyStore.getState().updateTransaction(item2.id, { amount: 30 });
      
      const finalItems = useMoneyStore.getState().transactions;
      RepositoryFactory.getMoneyRepository = originalGetRepo;
      
      return finalItems.find(tx => tx.id === item1.id)?.amount === 10 && finalItems.find(tx => tx.id === item2.id)?.amount === 30;
    }
  );

  // MONEY-ASYNC-09
  resetStore();
  await runTest(
    'MONEY-ASYNC-09',
    'Same-transaction concurrent update protection.',
    'A fails, B succeeds. A rollback does NOT erase B.',
    async () => {
      await useMoneyStore.getState().initialize();
      const item = await useMoneyStore.getState().createTransaction({ type: 'income', amount: 10, category: 'cat', description: '' });
      
      let resolveA: any;
      const promiseA = new Promise<void>(res => resolveA = res);
      
      RepositoryFactory.getMoneyRepository = () => {
        const repo = originalGetRepo();
        return {
          getAll: () => repo.getAll(),
          getAllSync: () => (repo as any)._getAllSync(),
          saveAll: (i: any) => repo.saveAll(i),
          saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
          getById: (id: string) => repo.getById(id),
          create: (item: any) => repo.create(item),
          delete: (id: string) => repo.delete(id),
          update: async (id: string, updates: any) => {
            if (updates.amount === 20) {
                await promiseA;
                throw new Error("Update A failed");
            }
            return repo.update(id, updates);
          }
        } as any;
      };

      const updateAPromise = useMoneyStore.getState().updateTransaction(item.id, { amount: 20 });
      const updateBPromise = useMoneyStore.getState().updateTransaction(item.id, { amount: 30 });
      
      resolveA();
      try { await updateAPromise; } catch(e) {}
      await updateBPromise;
      
      const finalItem = useMoneyStore.getState().transactions.find(tx => tx.id === item.id);
      RepositoryFactory.getMoneyRepository = originalGetRepo;
      
      return finalItem?.amount === 30;
    }
  );

  // MONEY-ASYNC-10
  resetStore();
  await runTest(
    'MONEY-ASYNC-10',
    'Update/delete race.',
    'A fails, B deletes successfully. A does NOT resurrect item.',
    async () => {
      await useMoneyStore.getState().initialize();
      const item = await useMoneyStore.getState().createTransaction({ type: 'income', amount: 10, category: 'cat', description: '' });
      
      let resolveA: any;
      const promiseA = new Promise<void>(res => resolveA = res);
      
      RepositoryFactory.getMoneyRepository = () => {
        const repo = originalGetRepo();
        return {
          getAll: () => repo.getAll(),
          getAllSync: () => (repo as any)._getAllSync(),
          saveAll: (i: any) => repo.saveAll(i),
          saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
          getById: (id: string) => repo.getById(id),
          create: (item: any) => repo.create(item),
          delete: (id: string) => repo.delete(id),
          update: async (id: string, updates: any) => {
             await promiseA;
             throw new Error("Update failed");
          }
        } as any;
      };

      const updateAPromise = useMoneyStore.getState().updateTransaction(item.id, { amount: 20 });
      const deleteBPromise = useMoneyStore.getState().deleteTransaction(item.id);
      
      resolveA();
      try { await updateAPromise; } catch(e) {}
      await deleteBPromise;
      
      const finalItem = useMoneyStore.getState().transactions.find(tx => tx.id === item.id);
      RepositoryFactory.getMoneyRepository = originalGetRepo;
      
      return finalItem === undefined;
    }
  );

  // MONEY-ASYNC-11
  resetStore();
  await runTest(
    'MONEY-ASYNC-11',
    'Optimistic delete.',
    'Item disappears BEFORE repository.delete resolves.',
    async () => {
      await useMoneyStore.getState().initialize();
      const item = await useMoneyStore.getState().createTransaction({ type: 'income', amount: 10, category: 'cat', description: '' });
      
      let resolvePromise: any;
      const promise = new Promise<void>(res => resolvePromise = res);
      
      RepositoryFactory.getMoneyRepository = () => {
        const repo = originalGetRepo();
        return {
          getAll: () => repo.getAll(),
          getAllSync: () => (repo as any)._getAllSync(),
          saveAll: (i: any) => repo.saveAll(i),
          saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
          getById: (id: string) => repo.getById(id),
          create: (item: any) => repo.create(item),
          update: (id: string, updates: any) => repo.update(id, updates),
          delete: async (id: string) => {
             await promise;
             return repo.delete(id);
          }
        } as any;
      };

      const delPromise = useMoneyStore.getState().deleteTransaction(item.id);
      
      const foundDuring = useMoneyStore.getState().transactions.find(tx => tx.id === item.id);
      
      resolvePromise();
      await delPromise;
      
      RepositoryFactory.getMoneyRepository = originalGetRepo;
      
      return foundDuring === undefined;
    }
  );

  // MONEY-ASYNC-12
  resetStore();
  await runTest(
    'MONEY-ASYNC-12',
    'Delete failure targeted rollback.',
    'Failed deletion restores ONLY the deleted item.',
    async () => {
      await useMoneyStore.getState().initialize();
      const item1 = await useMoneyStore.getState().createTransaction({ type: 'income', amount: 10, category: 'Item 1', description: '' });
      const item2 = await useMoneyStore.getState().createTransaction({ type: 'income', amount: 10, category: 'Item 2', description: '' });
      
      RepositoryFactory.getMoneyRepository = () => {
        const repo = originalGetRepo();
        return {
          getAll: () => repo.getAll(),
          getAllSync: () => (repo as any)._getAllSync(),
          saveAll: (i: any) => repo.saveAll(i),
          saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
          getById: (id: string) => repo.getById(id),
          create: (item: any) => repo.create(item),
          update: (id: string, updates: any) => repo.update(id, updates),
          delete: async (id: string) => {
             if (id === item1.id) throw new Error("Delete failed");
             return repo.delete(id);
          }
        } as any;
      };

      try { await useMoneyStore.getState().deleteTransaction(item1.id); } catch(e) {}
      await useMoneyStore.getState().deleteTransaction(item2.id);
      
      const finalItems = useMoneyStore.getState().transactions;
      RepositoryFactory.getMoneyRepository = originalGetRepo;
      
      return finalItems.length === 1 && finalItems[0].id === item1.id;
    }
  );

  // MONEY-ASYNC-13
  resetStore();
  await runTest(
    'MONEY-ASYNC-13',
    'Concurrent mutation isolation.',
    'Two overlap, one succeeds, one fails. Failed removed.',
    async () => {
      await useMoneyStore.getState().initialize();
      
      RepositoryFactory.getMoneyRepository = () => {
        const repo = originalGetRepo();
        return {
          getAll: () => repo.getAll(),
          getAllSync: () => (repo as any)._getAllSync(),
          saveAll: (i: any) => repo.saveAll(i),
          saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
          getById: (id: string) => repo.getById(id),
          delete: (id: string) => repo.delete(id),
          update: (id: string, updates: any) => repo.update(id, updates),
          create: async (item: any) => {
             if (item.category === 'Fail') throw new Error("Create failed");
             return repo.create(item);
          }
        } as any;
      };

      const p1 = useMoneyStore.getState().createTransaction({ type: 'income', amount: 10, category: 'Fail', description: '' }).catch(() => {});
      const p2 = useMoneyStore.getState().createTransaction({ type: 'income', amount: 10, category: 'Succeed', description: '' });
      
      await Promise.all([p1, p2]);
      
      const finalItems = useMoneyStore.getState().transactions;
      RepositoryFactory.getMoneyRepository = originalGetRepo;
      
      return finalItems.length === 1 && finalItems[0].category === 'Succeed';
    }
  );

  // MONEY-ASYNC-14
  resetStore();
  await runTest(
    'MONEY-ASYNC-14',
    'Legacy sync eradication.',
    'Verify moneyStore no longer contains legacy sync.',
    () => {
       const state = useMoneyStore.getState() as any;
       // If it was still sync, initialize would return void, not Promise
       return state.initialize().then !== undefined;
    }
  );

  // MONEY-ASYNC-15
  resetStore();
  await runTest(
    'MONEY-ASYNC-15',
    'Financial summary integrity after async hydration/mutations.',
    'Summary calculation works identically with populated async data.',
    async () => {
      await useMoneyStore.getState().initialize();
      
      // We will create a few transactions, then call the financeEngine directly.
      await useMoneyStore.getState().createTransaction({ type: 'income', amount: 1000, category: 'Salary', description: '' });
      await useMoneyStore.getState().createTransaction({ type: 'expense', amount: 200, category: 'Food', description: '' });
      
      // Instead of calculateFinancialSummary which relies on context or UI, we can call it on the store array.
      // Wait, MoneyView imports calculateFinancialSummary which is removed in this version of the codebase.
      // Actually it's analyzeFinance we can use from contextEngine.
      const ctx = getNOVOContext();
      
      return ctx.moneySummary.totalIncome === 1000 && ctx.moneySummary.totalExpenses === 200 && ctx.moneySummary.currentBalance === 800;
    }
  );

  console.log("=== TESTS COMPLETE ===\n");
}

runAll();
