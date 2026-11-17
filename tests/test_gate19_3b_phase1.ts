/**
 * Gate 19.3B - Phase 1 Verification Tests
 * 
 * Verifies foundational migration types, deterministic canonicalization,
 * deep equality helpers, and batch planning limits.
 */

import {
  canonicalize,
  canonicalStringify,
  areCanonicallyEqual,
  diffCanonical,
  planMigrationBatches,
  estimateItemByteSize,
  OversizedItemError,
  MIGRATION_PATHS,
  MigrationMarker,
  MigrationStatus,
  MigrationErrorCode,
} from './src/core/data/migration';
import type { Task, Conversation, KnowledgeItem } from './src/types/data';
import type { ActiveFocusState } from './src/modules/focus/domain/types';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    console.error(`  ✗ FAIL: ${testName}${details ? ` - ${details}` : ''}`);
    throw new Error(`Test failed: ${testName}`);
  }
}

async function runPhase1Tests() {
  console.log('\n--- GATE 19.3B PHASE 1: FOUNDATIONAL SAFETY SUITE ---\n');

  // ==========================================
  // Test Group 1: Canonical Equality & Key Ordering
  // ==========================================
  console.log('Group 1: Canonical Equality Despite Object-Key Ordering');

  const task1: Task = {
    id: 'task-1',
    title: 'Complete Phase 1',
    date: '2026-10-09',
    completed: false,
    priority: 'high',
    createdAt: '2026-10-09T00:00:00Z',
  };

  const task1Reordered: any = {
    createdAt: '2026-10-09T00:00:00Z',
    priority: 'high',
    completed: false,
    title: 'Complete Phase 1',
    date: '2026-10-09',
    id: 'task-1',
  };

  assert(areCanonicallyEqual(task1, task1Reordered), 'Task with reordered keys is canonically equal');
  assert(
    canonicalStringify(task1) === canonicalStringify(task1Reordered),
    'canonicalStringify output is identical for reordered keys'
  );

  const nestedA = { a: 1, b: { c: 2, d: { e: 3, f: 4 } } };
  const nestedB = { b: { d: { f: 4, e: 3 }, c: 2 }, a: 1 };
  assert(areCanonicallyEqual(nestedA, nestedB), 'Deeply nested objects with reordered keys are equal');

  // ==========================================
  // Test Group 2: Meaningful Differences Detected
  // ==========================================
  console.log('\nGroup 2: Meaningful Differences Detected Correctly');

  const taskModified: Task = {
    ...task1,
    completed: true,
  };
  assert(!areCanonicallyEqual(task1, taskModified), 'Detects difference in boolean field');
  const diffBool = diffCanonical(task1, taskModified);
  assert(diffBool.equal === false && diffBool.path === 'completed', 'diffCanonical pinpoints changed path "completed"');

  const taskTitleDiff: Task = {
    ...task1,
    title: 'Different Title',
  };
  assert(!areCanonicallyEqual(task1, taskTitleDiff), 'Detects difference in string field');
  const diffTitle = diffCanonical(task1, taskTitleDiff);
  assert(diffTitle.equal === false && diffTitle.path === 'title', 'diffCanonical pinpoints changed path "title"');

  const missingKeyObj = { id: 'item-1', name: 'Item' };
  const extraKeyObj = { id: 'item-1', name: 'Item', extra: 123 };
  assert(!areCanonicallyEqual(missingKeyObj, extraKeyObj), 'Detects added/missing keys');
  const diffExtra = diffCanonical(missingKeyObj, extraKeyObj);
  assert(diffExtra.equal === false && diffExtra.path === 'extra', 'diffCanonical identifies unexpected key');

  // ==========================================
  // Test Group 3: Arrays and Nested Objects
  // ==========================================
  console.log('\nGroup 3: Arrays and Nested Objects');

  const convA: Conversation = {
    id: 'conv-1',
    title: 'Research Session',
    messages: [
      { id: 'm1', role: 'user', content: 'Hello', createdAt: '2026-10-09T00:00:00Z' },
      { id: 'm2', role: 'assistant', content: 'Hi there', createdAt: '2026-10-09T00:01:00Z' },
    ],
    createdAt: '2026-10-09T00:00:00Z',
    updatedAt: '2026-10-09T00:01:00Z',
  };

  const convB: any = {
    updatedAt: '2026-10-09T00:01:00Z',
    createdAt: '2026-10-09T00:00:00Z',
    id: 'conv-1',
    title: 'Research Session',
    messages: [
      // message 1 with keys reordered
      { content: 'Hello', createdAt: '2026-10-09T00:00:00Z', role: 'user', id: 'm1' },
      // message 2 with keys reordered
      { createdAt: '2026-10-09T00:01:00Z', role: 'assistant', id: 'm2', content: 'Hi there' },
    ],
  };

  assert(areCanonicallyEqual(convA, convB), 'Conversation with nested messages and reordered keys is equal');

  // Array element ordering MUST be preserved (semantic difference)
  const convReorderedMessages: Conversation = {
    ...convA,
    messages: [convA.messages[1], convA.messages[0]],
  };
  assert(!areCanonicallyEqual(convA, convReorderedMessages), 'Preserves semantic order of array items (different order => not equal)');

  const kItem1: KnowledgeItem = {
    id: 'k-1',
    title: 'TypeScript Tips',
    content: 'Details here',
    category: 'programming',
    tags: ['ts', 'dev'],
    importance: 'high',
    pinned: true,
    createdAt: '2026-10-09T00:00:00Z',
    updatedAt: '2026-10-09T00:00:00Z',
  };

  const kItemDiffTags: KnowledgeItem = {
    ...kItem1,
    tags: ['dev', 'ts'], // different tag order is not equal
  };
  assert(!areCanonicallyEqual(kItem1, kItemDiffTags), 'Tags array order is semantically respected');

  // ==========================================
  // Test Group 4: Undefined and Null Handling
  // ==========================================
  console.log('\nGroup 4: Undefined and Null Handling');

  const itemWithUndefined = { id: 'x', title: 'Test', goalId: undefined };
  const itemWithoutUndefined = { id: 'x', title: 'Test' };
  assert(areCanonicallyEqual(itemWithUndefined, itemWithoutUndefined), 'Undefined properties in objects are omitted and equal to absent');

  const activeFocusNull: ActiveFocusState = {
    mode: 'preset',
    status: 'running',
    startedAt: '2026-10-09T00:00:00Z',
    durationSeconds: 1500,
    totalPausedMs: 0,
    lastPauseTimestamp: null,
  };

  const activeFocusNullReordered: any = {
    lastPauseTimestamp: null,
    totalPausedMs: 0,
    durationSeconds: 1500,
    startedAt: '2026-10-09T00:00:00Z',
    status: 'running',
    mode: 'preset',
  };

  assert(areCanonicallyEqual(activeFocusNull, activeFocusNullReordered), 'null values are preserved and equal when reordered');

  const activeFocusUndefinedPause: any = {
    mode: 'preset',
    status: 'running',
    startedAt: '2026-10-09T00:00:00Z',
    durationSeconds: 1500,
    totalPausedMs: 0,
    lastPauseTimestamp: undefined,
  };

  assert(
    !areCanonicallyEqual(activeFocusNull, activeFocusUndefinedPause),
    'Explicit null is distinct from undefined/omitted'
  );

  // ==========================================
  // Test Group 5: Batch Operation Limit
  // ==========================================
  console.log('\nGroup 5: Batch Operation Limit');

  const thousandItems = Array.from({ length: 950 }, (_, i) => ({
    id: `item-${i}`,
    collection: 'tasks',
    data: { id: `item-${i}`, name: `Task ${i}` },
  }));

  const chunksOps = planMigrationBatches(thousandItems, {
    maxOpsPerBatch: 400,
    maxBytesPerBatch: 10 * 1024 * 1024,
  });

  assert(chunksOps.length === 3, `950 items with limit 400 yields 3 chunks (actual: ${chunksOps.length})`);
  assert(chunksOps[0].opCount === 400, `Chunk 0 has 400 operations (actual: ${chunksOps[0].opCount})`);
  assert(chunksOps[1].opCount === 400, `Chunk 1 has 400 operations (actual: ${chunksOps[1].opCount})`);
  assert(chunksOps[2].opCount === 150, `Chunk 2 has 150 operations (actual: ${chunksOps[2].opCount})`);

  let totalPlannedOps = chunksOps.reduce((sum, c) => sum + c.opCount, 0);
  assert(totalPlannedOps === 950, `All 950 operations accounted for across batches`);

  // ==========================================
  // Test Group 6: Batch Payload-Size Limit
  // ==========================================
  console.log('\nGroup 6: Batch Payload-Size Limit');

  // Create 10 items of ~15KB each
  const mediumData = 'X'.repeat(15_000);
  const itemsForSizeLimit = Array.from({ length: 10 }, (_, i) => ({
    id: `med-${i}`,
    collection: 'notes',
    data: { id: `med-${i}`, content: mediumData },
  }));

  const singleItemByteSize = estimateItemByteSize(itemsForSizeLimit[0].data);
  assert(singleItemByteSize >= 15_000, `Single item size accurately estimated (${singleItemByteSize} bytes)`);

  // Max payload limit of 40,000 bytes: each chunk can fit at most 2 items (~30KB), but 3 items would be ~45KB > 40KB
  const chunksBytes = planMigrationBatches(itemsForSizeLimit, {
    maxOpsPerBatch: 100,
    maxBytesPerBatch: 40_000,
  });

  assert(chunksBytes.length === 5, `10 items of ~15KB with 40KB limit creates 5 chunks (actual: ${chunksBytes.length})`);
  for (let c = 0; c < chunksBytes.length; c++) {
    assert(chunksBytes[c].totalBytes <= 40_000, `Chunk ${c} totalBytes (${chunksBytes[c].totalBytes}) <= 40,000 limit`);
    assert(chunksBytes[c].opCount === 2, `Chunk ${c} contains exactly 2 items`);
  }

  // ==========================================
  // Test Group 7: Single Oversized Record Rejected Safely
  // ==========================================
  console.log('\nGroup 7: Single Oversized Record Rejected Safely');

  const oversizedItem = {
    id: 'huge-chat-1',
    collection: 'conversations',
    data: {
      id: 'huge-chat-1',
      payload: 'A'.repeat(950_000), // ~950KB
    },
  };

  let threwOversizedError = false;
  try {
    planMigrationBatches([oversizedItem], {
      maxSingleItemBytes: 900 * 1024, // 900KB limit
    });
  } catch (err) {
    if (err instanceof OversizedItemError) {
      threwOversizedError = true;
      assert(err.itemId === 'huge-chat-1', 'OversizedItemError identifies correct itemId');
      assert(err.collection === 'conversations', 'OversizedItemError identifies correct collection');
      assert(err.byteSize > 900 * 1024, 'OversizedItemError identifies correct byteSize');
      assert(err.maxAllowedBytes === 900 * 1024, 'OversizedItemError reports correct limit');
    }
  }
  assert(threwOversizedError, 'Throws OversizedItemError when single record exceeds document size limit');

  // ==========================================
  // Test Group 8: Canonical Firestore Paths & Types
  // ==========================================
  console.log('\nGroup 8: Canonical Firestore Paths & Marker Types');

  const uid = 'test-uid-123';
  assert(MIGRATION_PATHS.marker(uid) === 'users/test-uid-123/metadata/migration', 'Marker path is users/{uid}/metadata/migration');
  assert(MIGRATION_PATHS.tasks(uid) === 'users/test-uid-123/tasks', 'Tasks path is users/{uid}/tasks');
  assert(MIGRATION_PATHS.goals(uid) === 'users/test-uid-123/goals', 'Goals path is users/{uid}/goals');
  assert(MIGRATION_PATHS.notes(uid) === 'users/test-uid-123/notes', 'Notes path is users/{uid}/notes');
  assert(MIGRATION_PATHS.knowledge(uid) === 'users/test-uid-123/knowledge', 'Knowledge path is users/{uid}/knowledge');
  assert(MIGRATION_PATHS.money(uid) === 'users/test-uid-123/money', 'Money path is users/{uid}/money');
  assert(MIGRATION_PATHS.focusSessions(uid) === 'users/test-uid-123/focus_sessions', 'Focus sessions path is users/{uid}/focus_sessions');
  assert(MIGRATION_PATHS.conversations(uid) === 'users/test-uid-123/conversations', 'Conversations path is users/{uid}/conversations');
  assert(MIGRATION_PATHS.activeFocus(uid) === 'users/test-uid-123/active_state/focus', 'Active focus path is users/{uid}/active_state/focus');
  assert(MIGRATION_PATHS.activeChat(uid) === 'users/test-uid-123/active_state/chat', 'Active chat path is users/{uid}/active_state/chat');

  const sampleMarker: MigrationMarker = {
    status: 'IN_PROGRESS',
    version: 1,
    sessionId: 'sess-abc-123',
    migrationRunId: 'run-xyz-456',
    generation: 42,
    startedAt: '2026-10-09T00:00:00Z',
    itemCounts: {
      tasks: 10,
      goals: 3,
      notes: 5,
      total: 18,
    },
  };
  assert(sampleMarker.generation === 42, 'MigrationMarker generation strongly typed');
  assert(sampleMarker.sessionId === 'sess-abc-123', 'MigrationMarker sessionId strongly typed');
  assert(sampleMarker.migrationRunId === 'run-xyz-456', 'MigrationMarker migrationRunId strongly typed');

  console.log(`\n=========================================`);
  console.log(`Phase 1 Test Suite: ${passedTests}/${totalTests} PASSED`);
  console.log(`=========================================\n`);
}

runPhase1Tests().catch((err) => {
  console.error('Fatal error in Phase 1 test suite:', err);
  process.exit(1);
});
