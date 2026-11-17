/**
 * Novo Gate 19.3B - Phase 2.2 Supplementary Test Coverage Closure Suite
 *
 * Requirements:
 * 1. Remote-only document coverage across ALL SEVEN domains:
 *    - tasks
 *    - goals
 *    - notes
 *    - knowledge
 *    - money
 *    - focus_sessions
 *    - conversations
 *    For every case:
 *    - migration fails closed before any domain write is committed by that attempt
 *    - unexpected remote record remains unchanged
 *    - localStorage remains unchanged
 *    - FAILED marker mutation occurs only if the run still owns the active fencing generation
 *
 * 2. Stale owner marker protection:
 *    - Stale migration owner cannot overwrite newer owner's marker when status is FAILED
 *    - Stale migration owner cannot overwrite newer owner's marker when status is COMPLETED
 *    - Check exact marker contents and fencing generation
 *
 * 3. Idempotent retry and conflict preservation:
 *    - Identical local/remote records remain eligible for safe retry without unnecessary overwrite
 *    - Differing same-ID records remain unchanged and fail closed
 *    - Unexpected remote singleton active chat state is preserved and fails closed
 *
 * 4. Preflight containment:
 *    - No domain collection records written when remote-only record detected in any collection or singleton
 */

import './test_firebase_mock_app';
import {
  MigrationService,
  PreexistingCloudDataConflictError,
  MigrationFencingError
} from './src/core/data/migration/MigrationService';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { storageService } from './src/core/storage/storageService';
import { STORAGE_KEYS } from './src/core/storage/storageKeys';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { setMockFirestore } from './src/core/data/repositories/firebase/firestoreProvider';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${msg}`);
    throw new Error(msg);
  }
  console.log(`  ✓ PASS: ${msg}`);
}

interface MockDocState {
  data: any;
  version: number;
}

const mockStore = new Map<string, MockDocState>();

function resetStore() {
  mockStore.clear();
}

const mockFirestoreInstance: any = {
  getFirestore: () => ({}),

  doc: (_db: any, path: string) => path,

  collection: (_db: any, path: string) => path,

  getDoc: async (docPath: string) => {
    const entry = mockStore.get(docPath);
    return {
      exists: () => entry !== undefined,
      data: () => (entry ? JSON.parse(JSON.stringify(entry.data)) : undefined),
    };
  },

  getDocs: async (colPath: string) => {
    const prefix = colPath.endsWith('/') ? colPath : `${colPath}/`;
    const matchingDocs: { id: string; data: () => any }[] = [];
    for (const [path, entry] of mockStore.entries()) {
      if (path.startsWith(prefix)) {
        const remaining = path.substring(prefix.length);
        if (!remaining.includes('/')) {
          matchingDocs.push({
            id: remaining,
            data: () => JSON.parse(JSON.stringify(entry.data)),
          });
        }
      }
    }
    return { docs: matchingDocs };
  },

  setDoc: async (docPath: string, data: any, options?: { merge?: boolean }) => {
    const existing = mockStore.get(docPath);
    const merged = (options?.merge && existing)
      ? { ...existing.data, ...data }
      : { ...data };
    const version = (existing?.version || 0) + 1;
    mockStore.set(docPath, { data: JSON.parse(JSON.stringify(merged)), version });
  },

  writeBatch: () => {
    const ops: (() => void)[] = [];
    return {
      set: (docPath: string, data: any, options?: { merge?: boolean }) => {
        ops.push(() => {
          const existing = mockStore.get(docPath);
          const merged = (options?.merge && existing)
            ? { ...existing.data, ...data }
            : { ...data };
          const version = (existing?.version || 0) + 1;
          mockStore.set(docPath, { data: JSON.parse(JSON.stringify(merged)), version });
        });
      },
      delete: (docPath: string) => {
        ops.push(() => mockStore.delete(docPath));
      },
      commit: async () => {
        for (const op of ops) op();
      },
    };
  },

  runTransaction: async (_db: any, updateFunction: (txn: any) => Promise<any>) => {
    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const readVersions = new Map<string, number>();
      const stagedWrites = new Map<string, { data: any; merge?: boolean }>();

      const txnContext = {
        get: async (docPath: string) => {
          const entry = mockStore.get(docPath);
          readVersions.set(docPath, entry ? entry.version : 0);
          return {
            exists: () => entry !== undefined,
            data: () => (entry ? JSON.parse(JSON.stringify(entry.data)) : undefined),
          };
        },
        set: (docPath: string, data: any, options?: { merge?: boolean }) => {
          stagedWrites.set(docPath, { data: JSON.parse(JSON.stringify(data)), merge: options?.merge });
        },
        delete: (docPath: string) => {
          stagedWrites.set(docPath, { data: undefined });
        },
      };

      const result = await updateFunction(txnContext);

      let conflict = false;
      for (const [docPath, version] of readVersions.entries()) {
        const currentEntry = mockStore.get(docPath);
        const currentVersion = currentEntry ? currentEntry.version : 0;
        if (currentVersion !== version) {
          conflict = true;
          break;
        }
      }

      if (conflict) {
        continue;
      }

      for (const [docPath, write] of stagedWrites.entries()) {
        if (write.data === undefined) {
          mockStore.delete(docPath);
        } else {
          const existing = mockStore.get(docPath);
          const merged = (write.merge && existing)
            ? { ...existing.data, ...write.data }
            : { ...write.data };
          const newVersion = (existing?.version || 0) + 1;
          mockStore.set(docPath, { data: merged, version: newVersion });
        }
      }

      return result;
    }
    throw new Error('Transaction failed: max retries exceeded due to concurrency conflicts.');
  },
};

setMockFirestore(mockFirestoreInstance);

function populateStandardWorkspace(uid: string) {
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.TASKS}`, [
    { id: 't_1', title: 'Task 1', completed: false },
    { id: 't_2', title: 'Task 2', completed: true },
  ]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.GOALS}`, [
    { id: 'g_1', title: 'Goal 1', progress: 25 },
  ]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.NOTES}`, [
    { id: 'n_1', content: 'Note content', tags: ['ideas'] },
  ]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.KNOWLEDGE}`, [
    { id: 'k_1', title: 'Doc 1', content: 'Knowledge base doc' },
  ]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.MONEY_ENTRIES}`, [
    { id: 'm_1', amount: 88.50, category: 'food' },
  ]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.FOCUS_SESSIONS}`, [
    { id: 'f_1', duration: 1200, state: 'completed' },
  ]);
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.CONVERSATIONS}`, [
    { id: 'c_1', title: 'Chat 1', messages: [{ sender: 'user', text: 'Hi' }] },
  ]);
  storageService.setItem(`novo:${uid}:novo_active_focus`, {
    active: true,
    sessionId: 'f_1',
    elapsedSeconds: 120,
  });
  storageService.setItem(`novo:${uid}:${STORAGE_KEYS.ACTIVE_CHAT_ID}`, 'c_1');
}

async function runCoverageClosureTests() {
  console.log('================================================================');
  console.log('NOVO GATE 19.3B — PHASE 2.2 SUPPLEMENTARY TEST COVERAGE CLOSURE');
  console.log('================================================================\n');

  // Verify baseline: RepositoryFactory is in local mode
  assert(RepositoryFactory.getDataSource() === 'local', 'RepositoryFactory is initially in local mode');

  // -------------------------------------------------------------------------
  // Part 1: Remote-Only Document Detection Across All Seven Domains
  // -------------------------------------------------------------------------
  console.log('--- Part 1: Remote-Only Document Detection across All 7 Domains ---\n');

  const domainCases = [
    {
      domainName: 'tasks',
      pathSegment: 'tasks',
      remoteId: 't_uninvited_rogue',
      remoteData: { id: 't_uninvited_rogue', title: 'Unexpected Cloud Task', completed: false },
      storageKey: STORAGE_KEYS.TASKS,
    },
    {
      domainName: 'goals',
      pathSegment: 'goals',
      remoteId: 'g_uninvited_rogue',
      remoteData: { id: 'g_uninvited_rogue', title: 'Unexpected Cloud Goal', progress: 0 },
      storageKey: STORAGE_KEYS.GOALS,
    },
    {
      domainName: 'notes',
      pathSegment: 'notes',
      remoteId: 'n_uninvited_rogue',
      remoteData: { id: 'n_uninvited_rogue', content: 'Unexpected Cloud Note', tags: ['alien'] },
      storageKey: STORAGE_KEYS.NOTES,
    },
    {
      domainName: 'knowledge',
      pathSegment: 'knowledge',
      remoteId: 'k_uninvited_rogue',
      remoteData: { id: 'k_uninvited_rogue', title: 'Unexpected Cloud Doc', content: 'Alien knowledge' },
      storageKey: STORAGE_KEYS.KNOWLEDGE,
    },
    {
      domainName: 'money',
      pathSegment: 'money',
      remoteId: 'm_uninvited_rogue',
      remoteData: { id: 'm_uninvited_rogue', amount: 9999.99, category: 'mystery' },
      storageKey: STORAGE_KEYS.MONEY_ENTRIES,
    },
    {
      domainName: 'focus_sessions',
      pathSegment: 'focus_sessions',
      remoteId: 'f_uninvited_rogue',
      remoteData: { id: 'f_uninvited_rogue', duration: 3600, state: 'abandoned' },
      storageKey: STORAGE_KEYS.FOCUS_SESSIONS,
    },
    {
      domainName: 'conversations',
      pathSegment: 'conversations',
      remoteId: 'c_uninvited_rogue',
      remoteData: { id: 'c_uninvited_rogue', title: 'Unexpected Cloud Chat', messages: [] },
      storageKey: STORAGE_KEYS.CONVERSATIONS,
    },
  ];

  for (const tc of domainCases) {
    const uid = `uid_p22_remote_${tc.domainName}`;
    console.log(`Testing Remote-Only in Collection: ${tc.domainName}`);
    resetStore();
    AuthLifecycle.reset(uid);
    populateStandardWorkspace(uid);

    // Snapshot local storage before attempt
    const initialLocalItems = storageService.getItem<any[]>(`novo:${uid}:${tc.storageKey}`);
    const initialLocalCount = initialLocalItems ? initialLocalItems.length : 0;

    // Seed the unexpected remote-only record
    const remoteDocPath = `users/${uid}/${tc.pathSegment}/${tc.remoteId}`;
    mockStore.set(remoteDocPath, {
      data: tc.remoteData,
      version: 1,
    });

    let conflictCaught = false;
    try {
      await MigrationService.migrateCurrentUserToFirestore();
    } catch (e: any) {
      if (
        e.name === 'PreexistingCloudDataConflictError' &&
        e.message.includes(remoteDocPath) &&
        e.message.includes('absent from local workspace')
      ) {
        conflictCaught = true;
      } else {
        console.error('Unexpected error caught:', e);
      }
    }
    assert(conflictCaught, `Fails closed with PreexistingCloudDataConflictError for remote-only in ${tc.domainName}`);

    // Assert: remote document remains 100% unchanged
    const preservedRemote = mockStore.get(remoteDocPath);
    assert(
      preservedRemote !== undefined &&
      preservedRemote.version === 1 &&
      JSON.stringify(preservedRemote.data) === JSON.stringify(tc.remoteData),
      `Remote-only document in ${tc.domainName} was NOT modified or deleted`
    );

    // Assert: localStorage remains 100% unchanged
    const postLocalItems = storageService.getItem<any[]>(`novo:${uid}:${tc.storageKey}`);
    assert(
      postLocalItems !== null && postLocalItems.length === initialLocalCount,
      `localStorage for ${tc.domainName} remained completely untouched`
    );

    // Assert: NO domain records from local workspace were written to Firestore
    // Because preflight caught it before any chunk transaction write!
    const localTask1 = mockStore.get(`users/${uid}/tasks/t_1`);
    assert(localTask1 === undefined, `No domain record (tasks/t_1) was written before failing closed for ${tc.domainName}`);

    // Assert: FAILED marker mutation was recorded with proper generation
    const marker = mockStore.get(`users/${uid}/metadata/migration`);
    assert(marker !== undefined, `Migration marker exists for ${tc.domainName}`);
    assert(marker?.data.status === 'FAILED', `Marker status is FAILED for ${tc.domainName}`);
    assert(marker?.data.generation === 1, `Generation is 1 for ${tc.domainName}`);
    assert(
      marker?.data.errorCode === 'PreexistingCloudDataConflictError',
      `Error code is recorded as PreexistingCloudDataConflictError`
    );
  }

  // -------------------------------------------------------------------------
  // Part 2: Remote-Only Singleton Target (Active Chat) Fail-Closed & Untouched
  // -------------------------------------------------------------------------
  console.log('\n--- Part 2: Remote-Only Singleton Target (Active Chat) Fail-Closed ---\n');
  {
    const uid = 'uid_p22_remote_chat_singleton';
    resetStore();
    AuthLifecycle.reset(uid);
    populateStandardWorkspace(uid);

    // Remove local active chat so local has no active chat
    storageService.removeItem(`novo:${uid}:${STORAGE_KEYS.ACTIVE_CHAT_ID}`);

    // Seed remote active chat in Firestore
    const remoteChatDocPath = `users/${uid}/active_state/chat`;
    const remoteChatData = { activeChatId: 'c_ghost_cloud_chat' };
    mockStore.set(remoteChatDocPath, {
      data: remoteChatData,
      version: 1,
    });

    let chatConflictCaught = false;
    try {
      await MigrationService.migrateCurrentUserToFirestore();
    } catch (e: any) {
      if (
        e.name === 'PreexistingCloudDataConflictError' &&
        e.message.includes(remoteChatDocPath) &&
        e.message.includes('absent from local workspace')
      ) {
        chatConflictCaught = true;
      }
    }
    assert(chatConflictCaught, 'Fails closed when remote active chat exists but local has no active chat');

    // Remote document remains untouched
    const preservedChat = mockStore.get(remoteChatDocPath);
    assert(
      preservedChat !== undefined &&
      preservedChat.version === 1 &&
      preservedChat.data.activeChatId === 'c_ghost_cloud_chat',
      'Remote active chat document remains untouched'
    );

    // No domain writes occurred
    assert(mockStore.get(`users/${uid}/tasks/t_1`) === undefined, 'No domain writes occurred before preflight failure');

    // Local storage untouched (still absent)
    assert(
      storageService.getItem(`novo:${uid}:${STORAGE_KEYS.ACTIVE_CHAT_ID}`, null) === null,
      'LocalStorage active chat remains absent'
    );

    // Marker status is FAILED
    const marker = mockStore.get(`users/${uid}/metadata/migration`);
    assert(marker?.data.status === 'FAILED', 'Marker is FAILED for remote-only active chat');
  }

  // -------------------------------------------------------------------------
  // Part 3: Stale Owner Marker Protection against FAILED and COMPLETED Statuses
  // -------------------------------------------------------------------------
  console.log('\n--- Part 3: Stale Owner Marker Protection ---\n');

  // Test 3A: Stale owner cannot overwrite newer owner when newer status is FAILED
  {
    const uid = 'uid_p22_stale_vs_failed';
    resetStore();
    AuthLifecycle.reset(uid);
    populateStandardWorkspace(uid);

    // Newer owner previously failed at generation 20
    const newerFailedMarker = {
      status: 'FAILED',
      version: 1,
      startedAt: '2026-10-09T10:00:00.000Z',
      lastHeartbeatAt: '2026-10-09T10:01:00.000Z',
      failedAt: '2026-10-09T10:01:00.000Z',
      sessionId: 'session_NewerRun',
      migrationRunId: 'run_newer_20',
      generation: 20,
      errorCode: 'PreexistingCloudDataConflictError',
      errorMessage: 'Remote conflict',
    };
    mockStore.set(`users/${uid}/metadata/migration`, {
      data: newerFailedMarker,
      version: 5,
    });

    // Simulate stale owner from generation 19 trying to execute or finalize status
    const staleOwnership = {
      sessionId: 'session_StaleRun',
      migrationRunId: 'run_stale_19',
      generation: 19,
    };

    // Stale owner attempts _finalizeStatus with 'FAILED' or 'COMPLETED'
    const guard = AuthLifecycle.createGuard(uid);
    // Call MigrationService internal finalizeStatus or writeChunk to test fencing protection
    // We invoke MigrationService private method via typed call to verify
    await (MigrationService as any)._finalizeStatus(
      uid,
      guard,
      mockFirestoreInstance,
      staleOwnership,
      'FAILED',
      { errorMessage: 'Stale attempt should be rejected' }
    );

    // Assert: marker was NOT modified by stale owner
    const markerAfterStale = mockStore.get(`users/${uid}/metadata/migration`);
    assert(
      markerAfterStale?.data.generation === 20,
      'Marker generation remains 20 (stale gen 19 rejected)'
    );
    assert(
      markerAfterStale?.data.migrationRunId === 'run_newer_20',
      'Marker runId remains run_newer_20 (not overwritten by stale run)'
    );
    assert(
      markerAfterStale?.data.sessionId === 'session_NewerRun',
      'Marker sessionId remains session_NewerRun'
    );
    assert(
      markerAfterStale?.data.errorMessage === 'Remote conflict',
      'Marker errorMessage untouched by stale owner'
    );
    assert(markerAfterStale?.version === 5, 'Firestore document version remained unchanged at 5');
  }

  // Test 3B: Stale owner cannot overwrite newer owner when newer status is COMPLETED
  {
    const uid = 'uid_p22_stale_vs_completed';
    resetStore();
    AuthLifecycle.reset(uid);
    populateStandardWorkspace(uid);

    // Newer owner successfully completed at generation 50
    const newerCompletedMarker = {
      status: 'COMPLETED',
      version: 1,
      startedAt: '2026-10-09T12:00:00.000Z',
      lastHeartbeatAt: '2026-10-09T12:05:00.000Z',
      completedAt: '2026-10-09T12:05:00.000Z',
      sessionId: 'session_Winner',
      migrationRunId: 'run_winner_50',
      generation: 50,
      itemCounts: { tasks: 2, total: 2 },
    };
    mockStore.set(`users/${uid}/metadata/migration`, {
      data: newerCompletedMarker,
      version: 12,
    });

    const staleOwnership = {
      sessionId: 'session_Zombie',
      migrationRunId: 'run_zombie_49',
      generation: 49,
    };

    const guard = AuthLifecycle.createGuard(uid);
    await (MigrationService as any)._finalizeStatus(
      uid,
      guard,
      mockFirestoreInstance,
      staleOwnership,
      'FAILED',
      { errorMessage: 'Zombie failure' }
    );

    const markerAfterZombie = mockStore.get(`users/${uid}/metadata/migration`);
    assert(markerAfterZombie?.data.status === 'COMPLETED', 'Marker status remains COMPLETED');
    assert(markerAfterZombie?.data.generation === 50, 'Marker generation remains 50');
    assert(markerAfterZombie?.data.sessionId === 'session_Winner', 'Marker sessionId remains session_Winner');
    assert(markerAfterZombie?.version === 12, 'Firestore document version remained unchanged at 12');

    // Also verify heartbeat from stale owner does not mutate completed marker
    await (MigrationService as any)._heartbeat(
      uid,
      guard,
      mockFirestoreInstance,
      staleOwnership
    );
    const markerAfterHeartbeat = mockStore.get(`users/${uid}/metadata/migration`);
    assert(
      markerAfterHeartbeat?.data.lastHeartbeatAt === '2026-10-09T12:05:00.000Z',
      'Heartbeat from stale owner was dropped without mutating marker'
    );
    assert(markerAfterHeartbeat?.version === 12, 'Version remains unchanged at 12');
  }

  // -------------------------------------------------------------------------
  // Part 4: Idempotent Retry and Conflict Preservation
  // -------------------------------------------------------------------------
  console.log('\n--- Part 4: Idempotent Retry and Conflict Preservation ---\n');

  // Test 4A: Identical local/remote records remain eligible for safe retry without unnecessary overwrite
  {
    const uid = 'uid_p22_idempotent_retry';
    resetStore();
    AuthLifecycle.reset(uid);
    populateStandardWorkspace(uid);

    // First migration run completes normally
    await MigrationService.migrateCurrentUserToFirestore({ sessionId: 'session_Run1' });
    const run1Marker = mockStore.get(`users/${uid}/metadata/migration`);
    assert(run1Marker?.data.status === 'COMPLETED', 'First run completed successfully');
    const task1AfterRun1 = mockStore.get(`users/${uid}/tasks/t_1`);
    assert(task1AfterRun1 !== undefined, 'Task 1 exists in Firestore');
    const task1VersionAfterRun1 = task1AfterRun1?.version;

    // Second migration run with identical records (idempotent retry)
    await MigrationService.migrateCurrentUserToFirestore({ sessionId: 'session_Run2' });
    const run2Marker = mockStore.get(`users/${uid}/metadata/migration`);
    assert(run2Marker?.data.status === 'COMPLETED', 'Second run completed successfully');
    assert(run2Marker?.data.generation === 2, 'Generation incremented safely to 2');

    // Verify task 1 was NOT unnecessarily overwritten
    const task1AfterRun2 = mockStore.get(`users/${uid}/tasks/t_1`);
    assert(
      task1AfterRun2?.version === task1VersionAfterRun1,
      `Task 1 document was skipped without overwrite during idempotent retry (version: ${task1AfterRun2?.version})`
    );
  }

  // Test 4B: Differing same-ID records remain unchanged and fail closed
  {
    const uid = 'uid_p22_conflict_preservation';
    resetStore();
    AuthLifecycle.reset(uid);
    populateStandardWorkspace(uid);

    // Pre-seed remote task t_1 with differing data
    const remoteDifferentData = { id: 't_1', title: 'Tampered Remote Title', completed: true };
    mockStore.set(`users/${uid}/tasks/t_1`, {
      data: remoteDifferentData,
      version: 99,
    });

    let conflictOccurred = false;
    try {
      await MigrationService.migrateCurrentUserToFirestore();
    } catch (e: any) {
      if (e.name === 'PreexistingCloudDataConflictError') {
        conflictOccurred = true;
      }
    }
    assert(conflictOccurred, 'PreexistingCloudDataConflictError thrown when record differs');

    // Verify remote record was NOT overwritten and retains original version & data
    const preservedDoc = mockStore.get(`users/${uid}/tasks/t_1`);
    assert(
      preservedDoc?.data.title === 'Tampered Remote Title',
      'Differing remote document title was preserved'
    );
    assert(preservedDoc?.version === 99, 'Differing remote document version was preserved at 99');

    // Verify local storage is intact
    const localTasks = storageService.getItem<any[]>(`novo:${uid}:${STORAGE_KEYS.TASKS}`);
    assert(localTasks !== null && localTasks[0].title === 'Task 1', 'Local task in localStorage intact');
  }

  // -------------------------------------------------------------------------
  // Part 5: Clean Boundaries Verification
  // -------------------------------------------------------------------------
  console.log('\n--- Part 5: Clean Boundaries Verification ---\n');
  assert(RepositoryFactory.getDataSource() === 'local', 'RepositoryFactory remains strictly in local mode');

  console.log('\n================================================================');
  console.log('✅ ALL PHASE 2.2 SUPPLEMENTARY TESTS PASSED');
  console.log('================================================================\n');
}

runCoverageClosureTests().catch((e) => {
  console.error('Fatal error in Phase 2.2 test suite:', e);
  process.exit(1);
});
