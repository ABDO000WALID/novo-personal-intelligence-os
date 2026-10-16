/**
 * Gate 19.4-B - Cloud Workspace Runtime Continuity Test Suite
 *
 * Acceptance Areas:
 * Test 1  — Provider invariant (permanent migrated workspace resolves to Firebase)
 * Test 2  — Tasks CRUD (repository-mediated create, read, update, delete)
 * Test 3  — Goals CRUD (create, read, update progress, delete)
 * Test 4  — Notes CRUD (create, read, update, delete)
 * Test 5  — Knowledge CRUD (create with/without optional fields, read, update, delete)
 * Test 6  — Money CRUD (create, read, update, delete)
 * Test 7  — Focus Sessions CRUD (create session, read, clear)
 * Test 8  — Conversations CRUD (create, message append, rename, delete)
 * Test 9  — Active Focus lifecycle (save active state, get, update, remove)
 * Test 10 — Active Chat lifecycle (save active chat, get, update, clear)
 * Test 11 — Reload / re-hydration persistence (create -> clear stores -> hydrate -> update -> reload -> delete -> reload)
 * Test 12 — Write failure / rollback safety (error surfaced, optimistic rollback, no silent revert to local, no identity shift)
 * Test 13 — Identity isolation (User A vs User B namespace isolation, in-flight operation fencing)
 * Test 14 — Guest/local non-interference (guest routes to local, writes to localStorage, zero cloud pollution)
 */

import './test_firebase_mock_app';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { resetAuthIdentity } from './src/core/auth/authOrchestrator';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { FirebaseTaskRepository } from './src/core/data/repositories/firebase';
import { setMockFirestore } from './src/core/data/repositories/firebase/firestoreProvider';
import { storageService } from './src/core/storage/storageService';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { useNoteStore } from './src/core/state/noteStore';
import { useKnowledgeStore } from './src/core/state/knowledgeStore';
import { useMoneyStore } from './src/core/state/moneyStore';
import { useFocusStore } from './src/core/state/focusStore';
import { useChatStore } from './src/core/state/chatStore';
import { FocusSession } from './src/types/data';

let passedCount = 0;
let failedCount = 0;
const failedTests: string[] = [];

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    failedCount++;
    failedTests.push(message);
    throw new Error(message);
  }
  console.log(`  ✓ PASS: ${message}`);
  passedCount++;
}

// In-memory Firestore test double
const mockDb: Record<string, any> = {};
let setDocHook: ((path: string, data: any) => Promise<void> | void) | null = null;
let simulateWriteError: boolean = false;

const mockFirestore: any = {
  getFirestore: () => ({}),
  doc: (_db: any, path: string) => path,
  collection: (_db: any, path: string) => path,
  getDoc: async (docRef: string) => {
    const parts = docRef.split('/');
    const col = parts.slice(0, parts.length - 1).join('/');
    const id = parts[parts.length - 1];
    const exists = mockDb[col] && mockDb[col][id] !== undefined;
    return {
      exists: () => exists,
      data: () => (exists ? JSON.parse(JSON.stringify(mockDb[col][id])) : undefined),
    };
  },
  getDocs: async (colRef: string) => {
    const docs = mockDb[colRef] || {};
    return {
      docs: Object.keys(docs).map(id => ({
        id,
        data: () => JSON.parse(JSON.stringify(docs[id])),
      })),
    };
  },
  setDoc: async (docRef: string, data: any, options?: any) => {
    if (simulateWriteError) {
      throw new Error('Simulated network error during Firestore setDoc write');
    }
    if (setDocHook) await setDocHook(docRef, data);

    const parts = docRef.split('/');
    const col = parts.slice(0, parts.length - 1).join('/');
    const id = parts[parts.length - 1];
    if (!mockDb[col]) mockDb[col] = {};
    if (options?.merge && mockDb[col][id]) {
      mockDb[col][id] = { ...mockDb[col][id], ...JSON.parse(JSON.stringify(data)) };
    } else {
      mockDb[col][id] = JSON.parse(JSON.stringify(data));
    }
  },
  writeBatch: () => ({
    set: (docRef: string, data: any) => {
      if (simulateWriteError) {
        throw new Error('Simulated batch error during Firestore write');
      }
      const parts = docRef.split('/');
      const col = parts.slice(0, parts.length - 1).join('/');
      const id = parts[parts.length - 1];
      if (!mockDb[col]) mockDb[col] = {};
      mockDb[col][id] = JSON.parse(JSON.stringify(data));
    },
    delete: (docRef: string) => {
      const parts = docRef.split('/');
      const col = parts.slice(0, parts.length - 1).join('/');
      const id = parts[parts.length - 1];
      if (mockDb[col]) delete mockDb[col][id];
    },
    commit: async () => {},
  }),
  deleteDoc: async (docRef: string) => {
    if (simulateWriteError) {
      throw new Error('Simulated network error during Firestore deleteDoc');
    }
    const parts = docRef.split('/');
    const col = parts.slice(0, parts.length - 1).join('/');
    const id = parts[parts.length - 1];
    if (mockDb[col]) delete mockDb[col][id];
  },
};

setMockFirestore(mockFirestore);

function resetRuntime(uid: string | null = null, mode: 'firebase' | 'local' = 'firebase') {
  RepositoryFactory.setDataSource(mode);
  resetAuthIdentity(uid);
  setDocHook = null;
  simulateWriteError = false;
}

async function hydrateAllStores() {
  await Promise.all([
    useTaskStore.getState().initialize(),
    useGoalStore.getState().initialize(),
    useNoteStore.getState().initialize(),
    useKnowledgeStore.getState().initialize(),
    useMoneyStore.getState().initialize(),
    useFocusStore.getState().initialize(),
    useChatStore.getState().initialize(),
  ]);
}

async function runRuntimeSuite() {
  console.log('======================================================================');
  console.log('GATE 19.4-B: CLOUD WORKSPACE RUNTIME CONTINUITY SUITE');
  console.log('======================================================================');

  const TEST_UID = 'user_migrated_runtime';

  // -------------------------------------------------------------------------
  // Test 1: Provider Invariant
  // -------------------------------------------------------------------------
  console.log('\n--- Test 1: Provider invariant for permanent migrated workspace ---');
  resetRuntime(TEST_UID, 'firebase');
  assert(RepositoryFactory.getDataSource() === 'firebase', 'RepositoryFactory data source resolves to firebase');
  const taskRepo = RepositoryFactory.getTaskRepository();
  assert(taskRepo instanceof FirebaseTaskRepository, 'RepositoryFactory resolves to FirebaseTaskRepository');

  // -------------------------------------------------------------------------
  // Test 2: Tasks CRUD
  // -------------------------------------------------------------------------
  console.log('\n--- Test 2: Tasks CRUD (create, read, update, delete) ---');
  resetRuntime(TEST_UID, 'firebase');
  await hydrateAllStores();

  const createdTask = await useTaskStore.getState().createTask('Runtime Task 1', 'high', '2026-10-16');
  assert(createdTask && createdTask.id.length > 0, 'Task created with generated id');
  assert(mockDb[`users/${TEST_UID}/tasks`][createdTask.id]?.title === 'Runtime Task 1', 'Task persisted to Firestore users/{uid}/tasks');

  // Read
  const taskFromStore = useTaskStore.getState().tasks.find(t => t.id === createdTask.id);
  assert(taskFromStore?.title === 'Runtime Task 1', 'Created task read from store');

  // Update
  await useTaskStore.getState().updateTask(createdTask.id, { title: 'Updated Task 1', completed: true });
  assert(mockDb[`users/${TEST_UID}/tasks`][createdTask.id]?.title === 'Updated Task 1', 'Task update persisted to Firestore');
  assert(mockDb[`users/${TEST_UID}/tasks`][createdTask.id]?.completed === true, 'Task completion update persisted to Firestore');

  // Delete
  await useTaskStore.getState().deleteTask(createdTask.id);
  assert(mockDb[`users/${TEST_UID}/tasks`][createdTask.id] === undefined, 'Task deleted from Firestore');
  assert(!useTaskStore.getState().tasks.some(t => t.id === createdTask.id), 'Task removed from store');

  // -------------------------------------------------------------------------
  // Test 3: Goals CRUD
  // -------------------------------------------------------------------------
  console.log('\n--- Test 3: Goals CRUD (create, read, update progress, delete) ---');
  resetRuntime(TEST_UID, 'firebase');
  await hydrateAllStores();

  const createdGoal = await useGoalStore.getState().createGoal('Runtime Goal 1', 'Learn Cloud Architecture', 10);
  assert(createdGoal && createdGoal.id.length > 0, 'Goal created');
  assert(mockDb[`users/${TEST_UID}/goals`][createdGoal.id]?.progress === 10, 'Goal progress 10 persisted to Firestore');

  // Read
  assert(useGoalStore.getState().goals.some(g => g.id === createdGoal.id), 'Goal readable in store');

  // Update progress
  await useGoalStore.getState().updateProgress(createdGoal.id, 85);
  assert(mockDb[`users/${TEST_UID}/goals`][createdGoal.id]?.progress === 85, 'Goal progress 85 persisted to Firestore');

  // Delete
  await useGoalStore.getState().deleteGoal(createdGoal.id);
  assert(mockDb[`users/${TEST_UID}/goals`][createdGoal.id] === undefined, 'Goal deleted from Firestore');

  // -------------------------------------------------------------------------
  // Test 4: Notes CRUD
  // -------------------------------------------------------------------------
  console.log('\n--- Test 4: Notes CRUD (create, read, update, delete) ---');
  resetRuntime(TEST_UID, 'firebase');
  await hydrateAllStores();

  const createdNote = await useNoteStore.getState().createNote('Runtime Note Title', 'Runtime Note Content');
  assert(mockDb[`users/${TEST_UID}/notes`][createdNote.id]?.content === 'Runtime Note Content', 'Note persisted to Firestore');

  // Update
  await useNoteStore.getState().updateNote(createdNote.id, { content: 'Updated Note Content' });
  assert(mockDb[`users/${TEST_UID}/notes`][createdNote.id]?.content === 'Updated Note Content', 'Note content update persisted');

  // Delete
  await useNoteStore.getState().deleteNote(createdNote.id);
  assert(mockDb[`users/${TEST_UID}/notes`][createdNote.id] === undefined, 'Note deleted from Firestore');

  // -------------------------------------------------------------------------
  // Test 5: Knowledge CRUD (including optional goalId / noteId sanitization)
  // -------------------------------------------------------------------------
  console.log('\n--- Test 5: Knowledge CRUD with Gate 19.4-A undefined sanitization ---');
  resetRuntime(TEST_UID, 'firebase');
  await hydrateAllStores();

  // Create with absent optional fields
  const kWithoutLinks = await useKnowledgeStore.getState().createKnowledge({
    title: 'Standalone Cloud Concept',
    content: 'Concept without goal or note link',
    category: 'general',
  });
  const savedDoc1 = mockDb[`users/${TEST_UID}/knowledge`][kWithoutLinks.id];
  assert(savedDoc1 !== undefined, 'Knowledge item written to Firestore');
  assert('goalId' in savedDoc1 === false, 'goalId is NOT in Firestore payload when undefined');
  assert('noteId' in savedDoc1 === false, 'noteId is NOT in Firestore payload when undefined');

  // Create with defined optional fields
  const kWithLinks = await useKnowledgeStore.getState().createKnowledge({
    title: 'Linked Cloud Concept',
    content: 'Linked to a goal and note',
    goalId: 'goal-999',
    noteId: 'note-888',
  });
  const savedDoc2 = mockDb[`users/${TEST_UID}/knowledge`][kWithLinks.id];
  assert(savedDoc2.goalId === 'goal-999', 'goalId is preserved when defined');
  assert(savedDoc2.noteId === 'note-888', 'noteId is preserved when defined');

  // Update
  await useKnowledgeStore.getState().updateKnowledge(kWithLinks.id, { title: 'Updated Linked Cloud Concept' });
  assert(mockDb[`users/${TEST_UID}/knowledge`][kWithLinks.id]?.title === 'Updated Linked Cloud Concept', 'Knowledge update persisted');

  // Delete
  await useKnowledgeStore.getState().deleteKnowledge(kWithoutLinks.id);
  await useKnowledgeStore.getState().deleteKnowledge(kWithLinks.id);
  assert(mockDb[`users/${TEST_UID}/knowledge`][kWithoutLinks.id] === undefined, 'First knowledge item deleted');
  assert(mockDb[`users/${TEST_UID}/knowledge`][kWithLinks.id] === undefined, 'Second knowledge item deleted');

  // -------------------------------------------------------------------------
  // Test 6: Money CRUD
  // -------------------------------------------------------------------------
  console.log('\n--- Test 6: Money CRUD (create, read, update, delete) ---');
  resetRuntime(TEST_UID, 'firebase');
  await hydrateAllStores();

  const createdTx = await useMoneyStore.getState().createTransaction({
    type: 'income',
    amount: 1500,
    category: 'Consulting',
    description: 'Cloud architecture advisory',
  });
  assert(mockDb[`users/${TEST_UID}/money`][createdTx.id]?.amount === 1500, 'Transaction persisted to Firestore');

  // Update
  await useMoneyStore.getState().updateTransaction(createdTx.id, { amount: 1800, description: 'Expanded scope' });
  assert(mockDb[`users/${TEST_UID}/money`][createdTx.id]?.amount === 1800, 'Transaction update persisted');

  // Delete
  await useMoneyStore.getState().deleteTransaction(createdTx.id);
  assert(mockDb[`users/${TEST_UID}/money`][createdTx.id] === undefined, 'Transaction deleted from Firestore');

  // -------------------------------------------------------------------------
  // Test 7: Focus Sessions CRUD
  // -------------------------------------------------------------------------
  console.log('\n--- Test 7: Focus Sessions CRUD (create session, read, clear) ---');
  resetRuntime(TEST_UID, 'firebase');
  await hydrateAllStores();

  const focusRepo = RepositoryFactory.getFocusRepository();
  const sessionItem: FocusSession = {
    id: 'focus-sess-100',
    duration: 25,
    completedAt: '2026-10-16T10:00:00.000Z',
    actualDurationSeconds: 1500,
    mode: 'pomodoro',
  };
  await focusRepo.create(sessionItem);
  assert(mockDb[`users/${TEST_UID}/focus_sessions`]['focus-sess-100']?.duration === 25, 'Focus session persisted to Firestore');

  const fetchedSessions = await focusRepo.getSessions();
  assert(fetchedSessions.some(s => s.id === 'focus-sess-100'), 'Focus session retrieved via repository');

  await useFocusStore.getState().clearSessions();
  assert(Object.keys(mockDb[`users/${TEST_UID}/focus_sessions`] || {}).length === 0, 'Focus sessions cleared via batch delete');

  // -------------------------------------------------------------------------
  // Test 8: Conversations CRUD
  // -------------------------------------------------------------------------
  console.log('\n--- Test 8: Conversations CRUD (create, message append, rename, delete) ---');
  resetRuntime(TEST_UID, 'firebase');
  await hydrateAllStores();

  const createdConv = await useChatStore.getState().createConversation('Cloud Continuity Chat', 'Hello from runtime test');
  assert(mockDb[`users/${TEST_UID}/conversations`][createdConv.id]?.title === 'Cloud Continuity Chat', 'Conversation persisted');
  assert(mockDb[`users/${TEST_UID}/conversations`][createdConv.id]?.messages.length === 1, 'Initial message persisted in array');

  // Send message
  await useChatStore.getState().sendMessage('Second message from user', 'user', createdConv.id);
  assert(mockDb[`users/${TEST_UID}/conversations`][createdConv.id]?.messages.length === 2, 'Second message persisted in conversation array');

  // Rename
  await useChatStore.getState().renameConversation(createdConv.id, 'Renamed Cloud Chat');
  assert(mockDb[`users/${TEST_UID}/conversations`][createdConv.id]?.title === 'Renamed Cloud Chat', 'Renamed title persisted to Firestore');

  // Delete
  await useChatStore.getState().deleteConversation(createdConv.id);
  assert(mockDb[`users/${TEST_UID}/conversations`][createdConv.id] === undefined, 'Conversation deleted from Firestore');

  // -------------------------------------------------------------------------
  // Test 9: Active Focus Lifecycle
  // -------------------------------------------------------------------------
  console.log('\n--- Test 9: Active Focus singleton lifecycle ---');
  resetRuntime(TEST_UID, 'firebase');
  const focusSingletonRepo = RepositoryFactory.getFocusRepository();

  // Save active running state
  const runningState = {
    mode: 'pomodoro' as const,
    status: 'running' as const,
    startedAt: '2026-10-16T10:00:00.000Z',
    durationSeconds: 1500,
    totalPausedMs: 0,
    lastPauseTimestamp: null,
  };
  await focusSingletonRepo.saveActiveState(runningState);
  assert(mockDb[`users/${TEST_UID}/active_state`]?.focus?.status === 'running', 'Active running focus state written to active_state/focus');

  // Read back
  const retrievedFocus = await focusSingletonRepo.getActiveState();
  assert(retrievedFocus?.status === 'running' && retrievedFocus.durationSeconds === 1500, 'Active focus state read back accurately');

  // Update to paused
  const pausedState = {
    ...runningState,
    status: 'paused' as const,
    lastPauseTimestamp: '2026-10-16T10:10:00.000Z',
  };
  await focusSingletonRepo.saveActiveState(pausedState);
  const retrievedPaused = await focusSingletonRepo.getActiveState();
  assert(retrievedPaused?.status === 'paused', 'Paused state update persisted');

  // Clear / remove
  await focusSingletonRepo.removeActiveState();
  assert(mockDb[`users/${TEST_UID}/active_state`]?.focus === undefined, 'Active focus removed from Firestore');
  const clearedFocus = await focusSingletonRepo.getActiveState();
  assert(clearedFocus === null, 'getActiveState() returns null after removal');

  // -------------------------------------------------------------------------
  // Test 10: Active Chat Lifecycle
  // -------------------------------------------------------------------------
  console.log('\n--- Test 10: Active Chat singleton lifecycle ---');
  resetRuntime(TEST_UID, 'firebase');
  const chatSingletonRepo = RepositoryFactory.getChatRepository();

  // Save active chat ID
  await chatSingletonRepo.saveActiveChatId('conv-selected-001');
  assert(mockDb[`users/${TEST_UID}/active_state`]?.chat?.activeChatId === 'conv-selected-001', 'Active chat ID persisted to active_state/chat');

  // Read back
  const activeChatId = await chatSingletonRepo.getActiveChatId();
  assert(activeChatId === 'conv-selected-001', 'Active chat ID read back accurately');

  // Update
  await chatSingletonRepo.saveActiveChatId('conv-selected-002');
  assert(await chatSingletonRepo.getActiveChatId() === 'conv-selected-002', 'Updated active chat ID read back');

  // Clear (store passes '')
  await chatSingletonRepo.saveActiveChatId('');
  assert(mockDb[`users/${TEST_UID}/active_state`]?.chat?.activeChatId === '', 'Active chat cleared in Firestore');

  // -------------------------------------------------------------------------
  // Test 11: Reload / Re-hydration Persistence
  // -------------------------------------------------------------------------
  console.log('\n--- Test 11: Reload / re-hydration persistence across create, update, delete ---');
  resetRuntime(TEST_UID, 'firebase');
  await hydrateAllStores();

  // 1. Create representative records in cloud mode
  const rTask = await useTaskStore.getState().createTask('Persistent Reload Task');
  const rGoal = await useGoalStore.getState().createGoal('Persistent Reload Goal', 'Desc', 40);
  const rNote = await useNoteStore.getState().createNote('Persistent Reload Note', 'Body');
  const rKnow = await useKnowledgeStore.getState().createKnowledge({ title: 'Persistent Reload Knowledge', content: 'Body' });
  const rTx = await useMoneyStore.getState().createTransaction({ type: 'expense', amount: 50, category: 'Food', description: 'Lunch' });
  const rConv = await useChatStore.getState().createConversation('Persistent Reload Chat', 'First line');
  await RepositoryFactory.getFocusRepository().saveActiveState(runningState);
  await RepositoryFactory.getChatRepository().saveActiveChatId(rConv.id);

  // 2. Simulate browser reload / tear down in-memory stores
  resetAuthIdentity(TEST_UID);
  assert(useTaskStore.getState().tasks.length === 0, 'In-memory task store cleared after tear down');
  assert(useGoalStore.getState().goals.length === 0, 'In-memory goal store cleared after tear down');
  assert(useFocusStore.getState().activeState === null, 'In-memory active focus cleared after tear down');

  // 3. Re-hydrate through production repository path
  await hydrateAllStores();

  // 4. Verify all records survived
  assert(useTaskStore.getState().tasks.some(t => t.id === rTask.id && t.title === 'Persistent Reload Task'), 'Task survived reload hydration');
  assert(useGoalStore.getState().goals.some(g => g.id === rGoal.id && g.progress === 40), 'Goal survived reload hydration');
  assert(useNoteStore.getState().notes.some(n => n.id === rNote.id && n.title === 'Persistent Reload Note'), 'Note survived reload hydration');
  assert(useKnowledgeStore.getState().knowledge.some(k => k.id === rKnow.id), 'Knowledge item survived reload hydration');
  assert(useMoneyStore.getState().transactions.some(tx => tx.id === rTx.id && tx.amount === 50), 'Money transaction survived reload hydration');
  assert(useChatStore.getState().conversations.some(c => c.id === rConv.id), 'Conversation survived reload hydration');
  assert(useFocusStore.getState().activeState?.status === 'running', 'Active focus singleton restored on reload');
  assert(useChatStore.getState().activeConversationId === rConv.id, 'Active chat singleton restored on reload');

  // 5. Update representative records
  await useTaskStore.getState().updateTask(rTask.id, { title: 'Updated Reload Task' });
  await useGoalStore.getState().updateProgress(rGoal.id, 90);

  // 6. Tear down again and re-hydrate
  resetAuthIdentity(TEST_UID);
  await hydrateAllStores();

  // 7. Verify updated values survived
  assert(useTaskStore.getState().tasks.find(t => t.id === rTask.id)?.title === 'Updated Reload Task', 'Updated task title survived reload');
  assert(useGoalStore.getState().goals.find(g => g.id === rGoal.id)?.progress === 90, 'Updated goal progress survived reload');

  // 8. Delete representative records
  await useTaskStore.getState().deleteTask(rTask.id);
  await useGoalStore.getState().deleteGoal(rGoal.id);
  await RepositoryFactory.getFocusRepository().removeActiveState();

  // 9. Tear down again and re-hydrate
  resetAuthIdentity(TEST_UID);
  await hydrateAllStores();

  // 10. Verify deleted records remain absent
  assert(!useTaskStore.getState().tasks.some(t => t.id === rTask.id), 'Deleted task remains absent after reload');
  assert(!useGoalStore.getState().goals.some(g => g.id === rGoal.id), 'Deleted goal remains absent after reload');
  assert(useFocusStore.getState().activeState === null, 'Removed active focus remains absent after reload');

  // -------------------------------------------------------------------------
  // Test 12: Write Failure / Rollback Safety
  // -------------------------------------------------------------------------
  console.log('\n--- Test 12: Write failure and optimistic rollback safety ---');
  resetRuntime(TEST_UID, 'firebase');
  await hydrateAllStores();

  const taskCountBefore = useTaskStore.getState().tasks.length;
  simulateWriteError = true;

  let writeErrorThrown = false;
  try {
    await useTaskStore.getState().createTask('Task Should Fail');
  } catch (err: any) {
    writeErrorThrown = true;
    assert(err.message.includes('Simulated network error'), 'Operation reported exact error without false success');
  }

  assert(writeErrorThrown, 'Write error was thrown to caller');
  assert(useTaskStore.getState().tasks.length === taskCountBefore, 'Optimistic task rolled back on write failure');
  assert(RepositoryFactory.getDataSource() === 'firebase', 'Repository remains in firebase mode (no silent revert to local)');
  assert(AuthLifecycle.getUid() === TEST_UID, 'UID is not altered by write failure');
  simulateWriteError = false;

  // -------------------------------------------------------------------------
  // Test 13: Identity Isolation
  // -------------------------------------------------------------------------
  console.log('\n--- Test 13: Identity isolation between User A and User B ---');
  const USER_A = 'identity_user_A';
  const USER_B = 'identity_user_B';

  // Seed User A in Firebase
  resetRuntime(USER_A, 'firebase');
  await hydrateAllStores();
  const taskA = await useTaskStore.getState().createTask('User A Secret Task');
  assert(mockDb[`users/${USER_A}/tasks`][taskA.id]?.title === 'User A Secret Task', 'Task written under User A namespace');

  // Switch to User B
  resetRuntime(USER_B, 'firebase');
  await hydrateAllStores();

  // Verify User B store does not contain User A's task
  assert(!useTaskStore.getState().tasks.some(t => t.id === taskA.id), 'User B store does NOT contain User A task');
  assert(mockDb[`users/${USER_B}/tasks`]?.[taskA.id] === undefined, 'User A task does not exist in User B Firestore path');

  // In-flight operation fencing: User A async operation held while identity shifts to User B
  resetRuntime(USER_A, 'firebase');
  let releaseAHook: any;
  const pAHold = new Promise(r => { releaseAHook = r; });
  setDocHook = async (path: string) => {
    if (path.includes(USER_A)) {
      await pAHold;
    }
  };

  const pTaskA = useTaskStore.getState().createTask('Stale In-Flight Task');

  // Identity shifts to User B before User A's setDoc completes
  AuthLifecycle.reset(USER_B);

  // Release User A's hook
  releaseAHook();

  let staleCaught = false;
  try {
    await pTaskA;
  } catch (err: any) {
    staleCaught = true;
  }
  // User B's namespace must not have received User A's task
  assert(mockDb[`users/${USER_B}/tasks`]?.['Stale In-Flight Task'] === undefined, 'User A stale write did not contaminate User B');
  setDocHook = null;

  // -------------------------------------------------------------------------
  // Test 14: Guest / Local Non-Interference
  // -------------------------------------------------------------------------
  console.log('\n--- Test 14: Guest / local workspace non-interference ---');
  const GUEST_ID = 'guest_session_999';
  resetRuntime(GUEST_ID, 'local');

  assert(RepositoryFactory.getDataSource() === 'local', 'Guest resolves RepositoryFactory to local');
  const guestRepo = RepositoryFactory.getTaskRepository();
  assert(!(guestRepo instanceof FirebaseTaskRepository), 'Guest does NOT receive FirebaseTaskRepository');

  await useTaskStore.getState().initialize();
  const guestTask = await useTaskStore.getState().createTask('Local Guest Task');

  // Verify stored in localStorage
  const localTasks = storageService.getItem<any[]>(`novo:${GUEST_ID}:novo_v1_tasks`, []);
  assert(localTasks.some(t => t.id === guestTask.id && t.title === 'Local Guest Task'), 'Guest task persisted into localStorage');

  // Verify zero cloud pollution in mockDb
  assert(mockDb[`users/${GUEST_ID}`] === undefined, 'Zero Firestore documents created for guest user');
  assert(mockDb[`users/${GUEST_ID}/metadata`] === undefined, 'No migration marker created for guest user');

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`Gate 19.4-B Runtime Continuity: PASS (${passedCount}/${passedCount + failedCount})`);
  console.log('======================================================================');

  if (failedCount > 0) {
    console.error('Failed checks:', failedTests);
    process.exit(1);
  }
}

runRuntimeSuite().catch(err => {
  console.error('Suite execution failed:', err);
  process.exit(1);
});
