import './test_env.ts';
import { LocalAsyncRepository } from './src/core/data/repositories/local/LocalAsyncRepository';
import { storageService } from './src/core/storage/storageService';

console.log("=== RUNNING PHASE 9.2E-1 ASYNC REPOSITORY TESTS ===");

let passedAll = true;
function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.log(`[FAIL] ${msg}`);
    passedAll = false;
  } else {
    console.log(`[PASS] ${msg}`);
  }
}

type TestItem = { id: string; name: string };
const TEST_KEY = 'test_async_repo';

class TestAsyncRepository extends LocalAsyncRepository<TestItem> {
  constructor() {
    super(TEST_KEY, () => []);
  }
}

async function runTests() {
  localStorage.clear();

  const repo = new TestAsyncRepository();

  // Seed some data directly via sync
  storageService.setItem(TEST_KEY, [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]);

  // ASYNC-08: existing localStorage data remains readable.
  // ASYNC-01: getAll() resolves with existing records.
  const all = await repo.getAll();
  assert(all.length === 2 && all[0].name === 'A', "ASYNC-01 & ASYNC-08: getAll() resolves existing localStorage data");

  // ASYNC-02: getById() resolves with correct record.
  const item2 = await repo.getById('2');
  assert(item2?.name === 'B', "ASYNC-02: getById() resolves with correct record");

  // ASYNC-06: missing getById() returns null.
  const item3 = await repo.getById('3');
  assert(item3 === null, "ASYNC-06: missing getById() returns null");

  // ASYNC-07: Promise contract is actually respected.
  const p = repo.getAll();
  assert(p instanceof Promise, "ASYNC-07: Promise contract is respected");

  // ASYNC-03: create() persists a new record.
  await repo.create({ id: '3', name: 'C' });
  const allAfterCreate = storageService.getItem<TestItem[]>(TEST_KEY, []);
  assert(allAfterCreate.length === 3 && allAfterCreate[2].name === 'C', "ASYNC-03: create() persists a new record");

  // ASYNC-04: update() modifies only the intended record.
  await repo.update('2', { name: 'B_updated' });
  const allAfterUpdate = await repo.getAll();
  assert(allAfterUpdate.find(i => i.id === '2')?.name === 'B_updated', "ASYNC-04: update() modifies intended record");
  assert(allAfterUpdate.find(i => i.id === '1')?.name === 'A', "ASYNC-04: update() doesn't touch other records");

  // ASYNC-05: delete() removes only the intended record.
  await repo.delete('1');
  const allAfterDelete = await repo.getAll();
  assert(allAfterDelete.find(i => i.id === '1') === undefined, "ASYNC-05: delete() removes intended record");
  assert(allAfterDelete.length === 2, "ASYNC-05: delete() leaves other records");

  // ASYNC-10: repository errors are propagated.
  try {
    await repo.create({ id: '2', name: 'Duplicate' });
    assert(false, "ASYNC-10: create() duplicate did not throw");
  } catch (e: any) {
    assert(e.message.includes('already exists'), "ASYNC-10: repository errors are propagated");
  }

  try {
    await repo.update('99', { name: 'Missing' });
    assert(false, "ASYNC-10: update() missing did not throw");
  } catch (e: any) {
    assert(e.message.includes('not found'), "ASYNC-10: missing update throws");
  }

  await repo.create({ id: '10', name: 'Ten' });
  await repo.create({ id: '11', name: 'Eleven' });
  
  // Try concurrent updates
  await Promise.all([
    repo.update('10', { name: 'Ten_new' }),
    repo.update('11', { name: 'Eleven_new' })
  ]);
  
  const allAfterConcurrent = await repo.getAll();
  const t10 = allAfterConcurrent.find(i => i.id === '10');
  const t11 = allAfterConcurrent.find(i => i.id === '11');
  
  // If concurrent updates lost data, they would overwrite each other. 
  // However, in our simple sync-based implementation, it should just work because the underlying storage is sync.
  // Wait, if it's await repo.getAll() in update(), it yields the event loop! 
  // Let's see if the test passes.
  assert(t10?.name === 'Ten_new' && t11?.name === 'Eleven_new', "Edge case: Concurrent updates preserved both records");

  if (passedAll) {
    console.log("=== ALL TESTS PASSED ===");
    process.exit(0);
  } else {
    console.log("=== SOME TESTS FAILED ===");
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
