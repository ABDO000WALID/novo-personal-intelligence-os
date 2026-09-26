import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { LocalTaskRepository, LocalChatRepository, LocalFocusRepository } from './src/core/data/repositories/local';
import { FirebaseTaskRepository, FirebaseChatRepository, FirebaseFocusRepository } from './src/core/data/repositories/firebase';
import { FirebaseAsyncRepository } from './src/core/data/repositories/firebase/FirebaseAsyncRepository';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { storageService } from './src/core/storage/storageService';
import { STORAGE_KEYS } from './src/core/storage/storageKeys';
import { setMockFirestore } from './src/core/data/repositories/firebase/firestoreProvider';

let firestoreCallCount = 0;

const mockFirestore: any = {
  getFirestore: () => {
    firestoreCallCount++;
    return {};
  },
  collection: () => { firestoreCallCount++; return {}; },
  doc: () => { firestoreCallCount++; return {}; },
  getDoc: async () => { firestoreCallCount++; return { exists: () => false }; },
  getDocs: async () => { firestoreCallCount++; return { docs: [] }; },
  setDoc: async () => { firestoreCallCount++; },
  deleteDoc: async () => { firestoreCallCount++; },
  writeBatch: () => { firestoreCallCount++; return { set: () => {}, delete: () => {}, commit: async () => {} }; },
  onSnapshot: () => { firestoreCallCount++; return () => {}; }
};

setMockFirestore(mockFirestore);

// Override app initialization check for testing (similar to test_firebase_repository)
Object.defineProperty(FirebaseAsyncRepository.prototype, 'db', {
  get: function() { return mockFirestore.getFirestore({}); }
});

async function runTests() {
  console.log("=== RUNNING GATE 2 TESTS (PROVIDER SELECTION) ===");

  // Reset to default
  RepositoryFactory.setDataSource('local');
  AuthLifecycle.reset('test-uid-1');

  // RF-01: Default Local
  const defaultTaskRepo = RepositoryFactory.getTaskRepository();
  if (!(defaultTaskRepo instanceof LocalTaskRepository)) {
    throw new Error('RF-01 Failed: Default repository is not Local.');
  }
  console.log("✅ [PASS] RF-01: Default Local");

  // RF-02: Explicit Firebase Selection
  RepositoryFactory.setDataSource('firebase');
  const firebaseTaskRepo = RepositoryFactory.getTaskRepository();
  if (!(firebaseTaskRepo instanceof FirebaseTaskRepository)) {
    throw new Error('RF-02 Failed: Explicit selection did not return Firebase repository.');
  }
  console.log("✅ [PASS] RF-02: Explicit Firebase Selection");

  // RF-03: Explicit Return to Local
  RepositoryFactory.setDataSource('local');
  const returnedLocalTaskRepo = RepositoryFactory.getTaskRepository();
  if (!(returnedLocalTaskRepo instanceof LocalTaskRepository)) {
    throw new Error('RF-03 Failed: Return to local did not yield Local repository.');
  }
  console.log("✅ [PASS] RF-03: Explicit Return to Local");

  // RF-04: Existing Instance Stability
  const stableLocalRepo = RepositoryFactory.getTaskRepository();
  RepositoryFactory.setDataSource('firebase');
  if (!(stableLocalRepo instanceof LocalTaskRepository)) {
    throw new Error('RF-04 Failed: Existing local repository instance mutated after provider change.');
  }
  console.log("✅ [PASS] RF-04: Existing Instance Stability");

  // RF-05: New Instance Uses New Provider
  const newFirebaseRepo = RepositoryFactory.getTaskRepository();
  if (!(newFirebaseRepo instanceof FirebaseTaskRepository)) {
    throw new Error('RF-05 Failed: New instance after switch did not use new provider.');
  }
  console.log("✅ [PASS] RF-05: New Instance Uses New Provider");

  // RF-06: No Firestore Activity During Selection
  RepositoryFactory.setDataSource('local');
  firestoreCallCount = 0;
  RepositoryFactory.setDataSource('firebase');
  if (firestoreCallCount !== 0) {
    throw new Error(`RF-06 Failed: Firestore activity detected during provider switch (Count: ${firestoreCallCount})`);
  }
  console.log("✅ [PASS] RF-06: No Firestore Activity During Selection");

  // RF-07: No LocalStorage Mutation During Selection
  AuthLifecycle.reset('uid-123');
  const localTaskKey = `novo:uid-123:${STORAGE_KEYS.TASKS}`;
  storageService.setItem(localTaskKey, [{ id: 't1', title: 'Test Task' }]);
  
  const lsBefore = JSON.stringify(storageService.getItem(localTaskKey, null));
  RepositoryFactory.setDataSource('local');
  RepositoryFactory.setDataSource('firebase');
  const lsAfter = JSON.stringify(storageService.getItem(localTaskKey, null));
  
  if (lsBefore !== lsAfter || lsAfter === 'null') {
    throw new Error('RF-07 Failed: LocalStorage mutated during provider switch.');
  }
  console.log("✅ [PASS] RF-07: No LocalStorage Mutation During Selection");

  // RF-08: No Automatic Auth Switching
  RepositoryFactory.setDataSource('firebase');
  AuthLifecycle.reset('test-uid-2');
  if (RepositoryFactory.getDataSource() !== 'firebase') {
    throw new Error('RF-08 Failed: Auth switch changed factory mode.');
  }
  console.log("✅ [PASS] RF-08: No Automatic Auth Switching");

  // RF-09: Firebase UID Safety
  RepositoryFactory.setDataSource('firebase');
  AuthLifecycle.reset('uid-A');
  const fbRepo = RepositoryFactory.getTaskRepository();
  if (!(fbRepo instanceof FirebaseTaskRepository)) {
      throw new Error('RF-09 Failed: Factory did not return FirebaseTaskRepository.');
  }
  
  // Test UID bounding inherited from Gate 1 via the public getter (exposed for test)
  const getCollectionPath = (fbRepo as any).getCollectionPath.bind(fbRepo);
  const pathA = getCollectionPath();
  if (pathA !== 'users/uid-A/tasks') {
    throw new Error(`RF-09 Failed: Expected users/uid-A/tasks, got ${pathA}`);
  }
  
  AuthLifecycle.reset('uid-B');
  const pathB = getCollectionPath();
  if (pathB !== 'users/uid-B/tasks') {
     throw new Error(`RF-09 Failed: Firebase repo did not adapt to UID change. Expected users/uid-B/tasks, got ${pathB}`);
  }
  console.log("✅ [PASS] RF-09: Firebase UID Safety (Factory returned correct subclass retaining Gate 1 behavior)");

  // RF-10: Active Focus Repository respects provider
  RepositoryFactory.setDataSource('local');
  const localFocus = RepositoryFactory.getFocusRepository();
  if (!(localFocus instanceof LocalFocusRepository)) {
      throw new Error('RF-10 Failed: Expected LocalFocusRepository');
  }
  RepositoryFactory.setDataSource('firebase');
  const firebaseFocus = RepositoryFactory.getFocusRepository();
  if (!(firebaseFocus instanceof FirebaseFocusRepository)) {
      throw new Error('RF-10 Failed: Expected FirebaseFocusRepository');
  }
  // Verify method existence
  if (typeof firebaseFocus.saveActiveState !== 'function') {
      throw new Error('RF-10 Failed: FirebaseFocusRepository missing saveActiveState');
  }
  console.log("✅ [PASS] RF-10: Active Focus Repository respects provider and returns correct implementations");

  // RF-11: Active Chat Repository respects provider
  RepositoryFactory.setDataSource('local');
  const localChat = RepositoryFactory.getChatRepository();
  if (!(localChat instanceof LocalChatRepository)) {
      throw new Error('RF-11 Failed: Expected LocalChatRepository');
  }
  RepositoryFactory.setDataSource('firebase');
  const firebaseChat = RepositoryFactory.getChatRepository();
  if (!(firebaseChat instanceof FirebaseChatRepository)) {
      throw new Error('RF-11 Failed: Expected FirebaseChatRepository');
  }
  if (typeof firebaseChat.saveActiveChatId !== 'function') {
      throw new Error('RF-11 Failed: FirebaseChatRepository missing saveActiveChatId');
  }
  console.log("✅ [PASS] RF-11: Active Chat Repository respects provider and returns correct implementations");

  // RF-12: Provider Cache Isolation explicit documentation
  RepositoryFactory.setDataSource('local');
  const localCacheRepo = RepositoryFactory.getTaskRepository();
  RepositoryFactory.setDataSource('firebase');
  const firebaseCacheRepo = RepositoryFactory.getTaskRepository();
  
  if (localCacheRepo === firebaseCacheRepo) {
      throw new Error('RF-12 Failed: Factory returned the same instance for different providers.');
  }
  if (!(localCacheRepo instanceof LocalTaskRepository)) {
       throw new Error('RF-12 Failed: Previous local repo mutated.');
  }
  if (!(firebaseCacheRepo instanceof FirebaseTaskRepository)) {
       throw new Error('RF-12 Failed: New repo is not Firebase.');
  }
  
  RepositoryFactory.setDataSource('local');
  const localCacheRepo2 = RepositoryFactory.getTaskRepository();
  if (!(localCacheRepo2 instanceof LocalTaskRepository)) {
      throw new Error('RF-12 Failed: Switching back to local did not return Local repository.');
  }
  console.log("✅ [PASS] RF-12: Provider Cache Isolation (new instance per call provides perfect isolation)");

  // RF-13: No Cross-Provider Mutation (Observable State)
  AuthLifecycle.reset('uid-999');
  const sentinelKey = `novo:uid-999:${STORAGE_KEYS.NOTES}`;
  storageService.setItem(sentinelKey, [{ id: 'sentinel', content: 'test' }]);
  
  RepositoryFactory.setDataSource('local');
  const val1 = JSON.stringify(storageService.getItem(sentinelKey, null));
  
  RepositoryFactory.setDataSource('firebase');
  const val2 = JSON.stringify(storageService.getItem(sentinelKey, null));
  
  RepositoryFactory.setDataSource('local');
  const val3 = JSON.stringify(storageService.getItem(sentinelKey, null));
  
  if (val1 !== val2 || val2 !== val3 || val1 === 'null') {
      throw new Error('RF-13 Failed: Sentinel local state mutated during provider switch.');
  }
  console.log("✅ [PASS] RF-13: No Cross-Provider Mutation (Sentinel verified)");

  console.log("=== ALL GATE 2 TESTS PASSED ===");
}

runTests().catch(e => {
  console.error("Test failed", e);
  process.exit(1);
});
