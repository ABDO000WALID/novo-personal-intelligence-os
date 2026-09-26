import { backupService } from './src/core/storage/backupService';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';

async function runTests() {
  console.log('Testing Backup Async Boundary...');

  // BACKUP-ASYNC-01 & 02 & 03
  let getAllCalls = 0;
  
  // Mock Note repo
  const mockNoteRepo = Object.create(RepositoryFactory.getNoteRepository());
  mockNoteRepo.getAll = async () => {
    getAllCalls++;
    await new Promise(r => setTimeout(r, 20));
    return [{ id: 'mock1', title: 'Note 1' }];
  };
  (mockNoteRepo as any)._getAllSync = () => { throw new Error('getAllSync called!'); };
  RepositoryFactory.getNoteRepository = () => mockNoteRepo;

  console.log('FOCUS-ASYNC-01 & 02 & 03 (exportBackup returns promise, uses async)');
  const p = backupService.getCurrentData();
  if (!(p instanceof Promise)) {
    throw new Error('getCurrentData did not return a Promise');
  }
  
  const data = await p;
  console.log(`getAllCalls (expected 1): ${getAllCalls}`);
  console.log(`notes length: ${data.notes.length}`);

  // BACKUP-ASYNC-05 (Read failure propagates)
  console.log('BACKUP-ASYNC-05 (Read failure propagates)');
  const mockNoteRepoFail = Object.create(mockNoteRepo);
  mockNoteRepoFail.getAll = async () => {
    await new Promise(r => setTimeout(r, 20));
    throw new Error('simulated read failure');
  };
  RepositoryFactory.getNoteRepository = () => mockNoteRepoFail;
  
  try {
    await backupService.getCurrentData();
    console.log('FAILED: Error did not propagate');
  } catch (err) {
    console.log(`Error propagated correctly: ${err.message}`);
  }

  // Restore Note Repo
  RepositoryFactory.getNoteRepository = () => mockNoteRepo;


  // BACKUP-ASYNC-06 & 07 (restore/import uses async, failure propagates)
  console.log('BACKUP-ASYNC-06 & 07 (import uses async)');
  let saveAllCalls = 0;
  const mockTaskRepo = Object.create(RepositoryFactory.getTaskRepository());
  mockTaskRepo.saveAll = async (items) => {
    saveAllCalls++;
    await new Promise(r => setTimeout(r, 20));
    if (items.length > 0 && items[0].title === 'trigger-error') {
      throw new Error('simulated write failure');
    }
  };
  (mockTaskRepo as any)._saveAllSync = () => { throw new Error('saveAllSync called!'); };
  RepositoryFactory.getTaskRepository = () => mockTaskRepo;

  const validBackup = {
    version: 1,
    exportedAt: '2026-09-11',
    data: {
      notes: [], goals: [], tasks: [{ id: '1', title: 'Task 1', date: '', completed: false, priority: 'none', createdAt: '' } as any],
      focusSessions: [], transactions: [], conversations: [], knowledgeItems: []
    }
  };
  
  const success = await backupService.importBackup(validBackup);
  console.log(`Import successful: ${success}`);
  console.log(`saveAllCalls (expected 1): ${saveAllCalls}`);

  // trigger failure
  const failingBackup = { ...validBackup, data: { ...validBackup.data, tasks: [{ id: '2', title: 'trigger-error', date: '', completed: false, priority: 'none', createdAt: '' } as any] } };
  const failSuccess = await backupService.importBackup(failingBackup);
  console.log(`Import failed as expected: ${!failSuccess}`);

  console.log('ALL TESTS EXECUTED');
}

runTests().catch(e => { console.error(e); process.exit(1); });
