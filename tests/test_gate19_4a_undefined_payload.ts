/**
 * Gate 19.4-A - Regression Test for Undefined Payload Sanitization in FirebaseAsyncRepository
 *
 * Verifies:
 * 1. An entity containing undefined properties can be written successfully.
 * 2. The resulting Firestore payload does not contain those undefined properties.
 * 3. Defined properties remain unchanged.
 * 4. null remains null.
 * 5. false remains false.
 * 6. zero remains zero.
 * 7. empty string remains empty string.
 * 8. empty arrays and empty objects remain intact.
 * 9. Existing repository behavior (create, update, saveAll) remains intact.
 */

import './test_firebase_mock_app';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { setMockFirestore } from './src/core/data/repositories/firebase/firestoreProvider';
import { FirebaseAsyncRepository, sanitizeUndefined } from './src/core/data/repositories/firebase/FirebaseAsyncRepository';

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ PASS: ${message}`);
}

// In-memory inspection recording
const setDocCalls: Array<{ path: string; data: any; options?: any }> = [];
const batchSetCalls: Array<{ path: string; data: any }> = [];
const mockDb: Record<string, any> = {};

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
    setDocCalls.push({ path: docRef, data, options });
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
      batchSetCalls.push({ path: docRef, data });
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
    const parts = docRef.split('/');
    const col = parts.slice(0, parts.length - 1).join('/');
    const id = parts[parts.length - 1];
    if (mockDb[col]) delete mockDb[col][id];
  },
};

setMockFirestore(mockFirestore);

interface TestEntity {
  id: string;
  title: string;
  goalId?: string;
  noteId?: string;
  nullField: null;
  falseField: boolean;
  zeroField: number;
  emptyStr: string;
  emptyArr: any[];
  emptyObj: Record<string, any>;
  nested?: {
    definedProp: string;
    undefinedProp?: string;
  };
}

class TestFirebaseRepository extends FirebaseAsyncRepository<TestEntity> {
  constructor() {
    super('test_entities');
  }
}

async function runTests() {
  console.log('=================================================================');
  console.log('GATE 19.4-A: UNDEFINED PAYLOAD SANITIZATION REGRESSION TESTS');
  console.log('=================================================================');

  // Test 1: Pure sanitization unit test
  console.log('\nTest 1: Pure sanitizeUndefined helper behavior');
  const rawInput = {
    id: 'example-1',
    title: 'Example Knowledge Item',
    goalId: undefined,
    noteId: undefined,
    nullField: null,
    falseField: false,
    zeroField: 0,
    emptyStr: '',
    emptyArr: [],
    emptyObj: {},
    nested: {
      definedProp: 'valid',
      undefinedProp: undefined,
    },
  };

  const clean = sanitizeUndefined(rawInput);

  assert('goalId' in clean === false, 'undefined goalId is omitted');
  assert('noteId' in clean === false, 'undefined noteId is omitted');
  assert(clean.title === 'Example Knowledge Item', 'defined title is preserved');
  assert(clean.nullField === null, 'null field remains strictly null');
  assert(clean.falseField === false, 'false field remains strictly false');
  assert(clean.zeroField === 0, 'zero field remains strictly 0');
  assert(clean.emptyStr === '', 'empty string remains strictly ""');
  assert(Array.isArray(clean.emptyArr) && clean.emptyArr.length === 0, 'empty array remains strictly []');
  assert(typeof clean.emptyObj === 'object' && Object.keys(clean.emptyObj).length === 0, 'empty object remains strictly {}');
  assert(clean.nested?.definedProp === 'valid', 'nested defined property is preserved');
  assert('undefinedProp' in (clean.nested || {}) === false, 'nested undefined property is omitted');

  // Test 2: Repository create() passes sanitized payload to Firestore fs.setDoc
  console.log('\nTest 2: Repository create() writes sanitized payload to Firestore');
  AuthLifecycle.reset('user_gate19_4a');
  setDocCalls.length = 0;

  const repo = new TestFirebaseRepository();
  const entityToCreate: TestEntity = {
    id: 'entity-1',
    title: 'Knowledge Without Goal Or Note',
    goalId: undefined,
    noteId: undefined,
    nullField: null,
    falseField: false,
    zeroField: 0,
    emptyStr: '',
    emptyArr: [],
    emptyObj: {},
  };

  await repo.create(entityToCreate);

  assert(setDocCalls.length === 1, 'fs.setDoc was called exactly once');
  const createCall = setDocCalls[0];
  assert(createCall.path === 'users/user_gate19_4a/test_entities/entity-1', 'Correct Firestore path targeted');
  assert('goalId' in createCall.data === false, 'Firestore setDoc payload does NOT contain goalId');
  assert('noteId' in createCall.data === false, 'Firestore setDoc payload does NOT contain noteId');
  assert(createCall.data.id === 'entity-1', 'Payload preserves id');
  assert(createCall.data.title === 'Knowledge Without Goal Or Note', 'Payload preserves title');
  assert(createCall.data.nullField === null, 'Payload preserves null');
  assert(createCall.data.falseField === false, 'Payload preserves false');
  assert(createCall.data.zeroField === 0, 'Payload preserves 0');
  assert(createCall.data.emptyStr === '', 'Payload preserves empty string');
  assert(Array.isArray(createCall.data.emptyArr) && createCall.data.emptyArr.length === 0, 'Payload preserves empty array');
  assert(typeof createCall.data.emptyObj === 'object' && Object.keys(createCall.data.emptyObj).length === 0, 'Payload preserves empty object');

  // Test 3: Repository update() sanitizes partial changes
  console.log('\nTest 3: Repository update() writes sanitized partial payload');
  setDocCalls.length = 0;

  const partialUpdate: Partial<TestEntity> = {
    title: 'Updated Knowledge Title',
    goalId: undefined,
    falseField: false,
    nullField: null,
    zeroField: 0,
  };

  await repo.update('entity-1', partialUpdate);

  assert(setDocCalls.length === 1, 'fs.setDoc was called for update');
  const updateCall = setDocCalls[0];
  assert(updateCall.options?.merge === true, 'Update uses merge: true');
  assert('goalId' in updateCall.data === false, 'Update payload does NOT contain undefined goalId');
  assert(updateCall.data.title === 'Updated Knowledge Title', 'Update payload preserves title');
  assert(updateCall.data.falseField === false, 'Update payload preserves false');
  assert(updateCall.data.nullField === null, 'Update payload preserves null');
  assert(updateCall.data.zeroField === 0, 'Update payload preserves zero');

  // Test 4: Repository saveAll() sanitizes batched items
  console.log('\nTest 4: Repository saveAll() writes sanitized items via batch.set');
  batchSetCalls.length = 0;

  const batchEntities: TestEntity[] = [
    {
      id: 'entity-batch-1',
      title: 'Batch Item 1',
      goalId: undefined,
      noteId: 'note-123',
      nullField: null,
      falseField: false,
      zeroField: 0,
      emptyStr: '',
      emptyArr: [],
      emptyObj: {},
    },
    {
      id: 'entity-batch-2',
      title: 'Batch Item 2',
      goalId: 'goal-456',
      noteId: undefined,
      nullField: null,
      falseField: true,
      zeroField: 100,
      emptyStr: 'content',
      emptyArr: ['tag1'],
      emptyObj: { k: 'v' },
    },
  ];

  await repo.saveAll(batchEntities);

  assert(batchSetCalls.length === 2, 'writeBatch set was called for both items');
  const b1 = batchSetCalls.find(c => c.path.endsWith('entity-batch-1'));
  const b2 = batchSetCalls.find(c => c.path.endsWith('entity-batch-2'));
  assert(b1 !== undefined, 'Batch 1 item captured');
  assert(b2 !== undefined, 'Batch 2 item captured');
  assert('goalId' in b1!.data === false, 'Batch 1 payload does not have undefined goalId');
  assert(b1!.data.noteId === 'note-123', 'Batch 1 payload preserves defined noteId');
  assert('noteId' in b2!.data === false, 'Batch 2 payload does not have undefined noteId');
  assert(b2!.data.goalId === 'goal-456', 'Batch 2 payload preserves defined goalId');

  // Test 5: Verify getById() reads back persisted entity cleanly
  console.log('\nTest 5: Repository getById() reads back persisted record');
  const fetched = await repo.getById('entity-batch-1');
  assert(fetched !== null, 'Entity fetched successfully');
  assert(fetched?.title === 'Batch Item 1', 'Fetched entity has correct title');
  assert(fetched?.noteId === 'note-123', 'Fetched entity preserves noteId');
  assert('goalId' in fetched! === false, 'Fetched entity does not contain undefined goalId');

  console.log('=================================================================');
  console.log('✅ ALL GATE 19.4-A REGRESSION TESTS PASSED (5/5)');
  console.log('=================================================================');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
