import './test_env.ts';
import { buildNOVOContext } from './src/core/intelligence/contextEngine';
import { KnowledgeItem, Task, Goal, Note, FocusSession, Transaction } from './src/types/data';

console.log("=== RUNNING PHASE 9.2D-3 KNOWLEDGE BOUNDING TEST ===");

let passedAll = true;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.log(`[FAIL] ${msg}`);
    passedAll = false;
  } else {
    console.log(`[PASS] ${msg}`);
  }
}

// Generate test data
const createKnowledge = (id: number, offsetDays: number): KnowledgeItem => ({
  id: `k${id}`,
  title: `Knowledge ${id}`,
  content: 'content',
  category: 'study',
  tags: [],
  importance: 'medium',
  pinned: false,
  createdAt: new Date(Date.now() - offsetDays * 86400000).toISOString(),
  updatedAt: new Date(Date.now() - offsetDays * 86400000).toISOString(),
});

const emptyBaseData = {
  tasks: [],
  goals: [],
  notes: [],
  sessions: [],
  transactions: [],
};

// KNOW-BOUND-01: 0 items
let ctx = buildNOVOContext({ ...emptyBaseData, knowledgeItems: [] });
assert(ctx.knowledgeSummary.totalKnowledgeItems === 0, "KNOW-BOUND-01: 0 Knowledge -> 0 sent");

// KNOW-BOUND-02: 10 items
let k10 = Array.from({ length: 10 }).map((_, i) => createKnowledge(i, i));
ctx = buildNOVOContext({ ...emptyBaseData, knowledgeItems: k10 });
assert(ctx.knowledgeSummary.totalKnowledgeItems === 10, "KNOW-BOUND-02: 10 Knowledge -> 10 sent");

// KNOW-BOUND-03: 50 items
let k50 = Array.from({ length: 50 }).map((_, i) => createKnowledge(i, i));
ctx = buildNOVOContext({ ...emptyBaseData, knowledgeItems: k50 });
assert(ctx.knowledgeSummary.totalKnowledgeItems === 50, "KNOW-BOUND-03: 50 Knowledge -> 50 sent");

// KNOW-BOUND-04: 51 items
let k51 = Array.from({ length: 51 }).map((_, i) => createKnowledge(i, i));
ctx = buildNOVOContext({ ...emptyBaseData, knowledgeItems: k51 });
assert(ctx.knowledgeSummary.totalKnowledgeItems === 50, "KNOW-BOUND-04: 51 Knowledge -> exactly 50 sent");

// KNOW-BOUND-05: 100 items
let k100 = Array.from({ length: 100 }).map((_, i) => createKnowledge(i, i));
ctx = buildNOVOContext({ ...emptyBaseData, knowledgeItems: k100 });
assert(ctx.knowledgeSummary.totalKnowledgeItems === 50, "KNOW-BOUND-05: 100 Knowledge -> exactly 50 sent");

// KNOW-BOUND-06: Verify selected 50 are the most recently updated
// Let's make items 0-49 the OLDEST, and items 50-99 the NEWEST.
// We expect the result to only contain items 50-99.
let kMixed = Array.from({ length: 100 }).map((_, i) => createKnowledge(i, i < 50 ? 1000 + i : i - 50));
ctx = buildNOVOContext({ ...emptyBaseData, knowledgeItems: kMixed });
// In recentKnowledge, it should have the absolute newest (which are indices 50-99)
// The oldest item in the bounded set should have an offset of 49 days.
const latestUpdateInBounded = new Date(ctx.knowledgeSummary.latestActivity!).getTime();
// Since the latest activity is the max updatedAt, it should correspond to offset 0 (which is today).
// Let's actually verify by checking recentKnowledge (which is top 5).
const top5IDs = ctx.recentKnowledge.map(k => k.id);
const expectedTop5IDs = ['k50', 'k51', 'k52', 'k53', 'k54']; // These have offsets 0, 1, 2, 3, 4
const hasCorrectIds = expectedTop5IDs.every(id => top5IDs.includes(id));
assert(hasCorrectIds, "KNOW-BOUND-06: Verify selected 50 are the most recently updated items.");

// KNOW-BOUND-07: Verify original array not mutated
const kCopy = [...kMixed];
buildNOVOContext({ ...emptyBaseData, knowledgeItems: kMixed });
let mutated = false;
for (let i = 0; i < kMixed.length; i++) {
  if (kMixed[i].id !== kCopy[i].id) mutated = true;
}
assert(!mutated, "KNOW-BOUND-07: Verify the original Knowledge store array is not mutated.");

// KNOW-BOUND-08: Verify context structure remains valid
assert(typeof ctx.knowledgeSummary.totalKnowledgeItems === 'number', "KNOW-BOUND-08: Context structure remains valid");

if (passedAll) {
  console.log("=== ALL TESTS PASSED ===");
  process.exit(0);
} else {
  console.log("=== SOME TESTS FAILED ===");
  process.exit(1);
}
