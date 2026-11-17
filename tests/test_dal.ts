import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { storageService, INITIAL_SEEDS } from './src/core/storage/storageService';
import { STORAGE_KEYS } from './src/core/storage/storageKeys';
import { AuthLifecycle } from "./src/core/auth/authLifecycle";
import { Task } from './src/types/data';

console.log("=== RUNNING DAL TEST HARNESS ===");

let passed = 0;
let total = 0;

function assert(condition: boolean, testName: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`✅ [PASS] ${testName}`);
  } else {
    console.error(`❌ [FAIL] ${testName}`);
  }
}

// TEST DAL-01: Existing tasks stored in localStorage can still be retrieved through TaskRepository.
AuthLifecycle.reset("test_dal_user");
const scopedKey = `novo:test_dal_user:${STORAGE_KEYS.TASKS}`;

const testTask: Task = {
  id: 'test-123',
  title: 'Test DAL-01',
  date: '2026-09-07',
  completed: false,
  priority: 'high',
  createdAt: new Date().toISOString()
};

// Seed storageService bypassing repository
storageService.setItem(scopedKey, [testTask]);
const repo = RepositoryFactory.getTaskRepository();
const tasksFromRepo = (repo as any)._getAllSync();

assert(
  tasksFromRepo.length === 1 && tasksFromRepo[0].id === 'test-123',
  "DAL-01: Repository retrieves raw storageService data."
);

// TEST DAL-02: Saving tasks through TaskRepository persists correctly.
const newTask: Task = {
  ...testTask,
  id: 'test-456',
  title: 'Test DAL-02'
};

(repo as any)._saveAllSync([testTask, newTask]);
const rawStorageTasks = storageService.getItem<Task[]>(scopedKey, []);

assert(
  rawStorageTasks.length === 2 && rawStorageTasks[1].id === 'test-456',
  "DAL-02: Repository saves pass through to storageService correctly."
);

// Cleanup
(repo as any)._saveAllSync([]);

console.log(`\n=== RESULTS: ${passed}/${total} PASSED ===`);
