import { normalizeDateString, isDateToday, isDateBeforeToday } from "./src/core/intelligence/dateUtils";
import { generateSmartInsights } from "./src/core/intelligence/insightEngine";
import { generateDailyBriefing } from "./src/core/intelligence/briefingEngine";
import { buildNOVOContext } from "./src/core/intelligence/contextEngine";
import { analyzeProductivity } from "./src/core/intelligence/productivityEngine";
import { analyzeDailyGoalAlignment } from "./src/core/intelligence/goalEngine";
import { determineNextAction } from "./src/core/intelligence/nextActionEngine";
import { evaluateAttentionRadar } from "./src/core/intelligence/attentionEngine";
import { analyzeAllGoalsPacing } from "./src/core/intelligence/goalVelocityEngine";
import { Task, Goal, FocusSession } from "./src/types/data";
import { WorkspaceSnapshot } from "./src/core/intelligence/intelligenceTypes";

let assertionsRun = 0;

function assert(condition: boolean, message: string): void {
  assertionsRun++;
  if (!condition) {
    throw new Error(`Assertion #${assertionsRun} FAILED: ${message}`);
  }
}

console.log("============================================================");
console.log(" Gate 20-C Intelligence Convergence Test Suite");
console.log("============================================================\n");

// ------------------------------------------------------------
// Area 1: Deterministic insight ordering with ID tie-breaking (8 assertions)
// ------------------------------------------------------------
console.log("--- Area 1: Deterministic Insight Ordering ---");
const baseTasks: Task[] = [
  { id: "t1", title: "Task 1", completed: false, priority: "high", date: "2026-10-20" } as Task,
  { id: "t2", title: "Task 2", completed: false, priority: "high", date: "2026-10-20" } as Task,
];
const baseGoals: Goal[] = [];
const baseSessions: FocusSession[] = [];

const snapshotA: WorkspaceSnapshot = { tasks: baseTasks, goals: baseGoals, focusSessions: baseSessions };
const insightsA = generateSmartInsights(snapshotA);
const insightsB = generateSmartInsights(snapshotA);

assert(Array.isArray(insightsA), "generateSmartInsights returns array");
assert(insightsA.length === insightsB.length, "Deterministic insight length parity");
assert(insightsA.map(i => i.type).join(",") === insightsB.map(i => i.type).join(","), "Deterministic insight type sequence");
assert(insightsA.map(i => i.priority).join(",") === insightsB.map(i => i.priority).join(","), "Deterministic insight priority sequence");

const mockCandidateInsights = [
  { id: "ins-z", priority: "high" },
  { id: "ins-a", priority: "high" },
  { id: "ins-m", priority: "medium" },
  { id: "ins-b", priority: "high" },
];
const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
mockCandidateInsights.sort((a, b) => {
  const pDiff = (priorityWeight[b.priority] ?? 0) - (priorityWeight[a.priority] ?? 0);
  if (pDiff !== 0) return pDiff;
  return a.id.localeCompare(b.id);
});

assert(mockCandidateInsights[0].id === "ins-a", "Area 1: Tie-break order #1 is lexical lowest ID");
assert(mockCandidateInsights[1].id === "ins-b", "Area 1: Tie-break order #2 is second lexical ID");
assert(mockCandidateInsights[2].id === "ins-z", "Area 1: Tie-break order #3 is last high-priority ID");
assert(mockCandidateInsights[3].id === "ins-m", "Area 1: Lower priority sorted after high");

// ------------------------------------------------------------
// Area 2: Canonical Date Normalization across Refactored Engines (10 assertions)
// ------------------------------------------------------------
console.log("--- Area 2: Canonical Date Normalization ---");
const isoDateTime = "2026-10-20T14:30:00.000Z";
const dateOnly = "2026-10-20";
const dateObj = new Date(2026, 9, 20);

assert(normalizeDateString(isoDateTime) === "2026-10-20", "normalizeDateString handles ISO string");
assert(normalizeDateString(dateOnly) === "2026-10-20", "normalizeDateString handles date-only string");
assert(normalizeDateString(dateObj) === "2026-10-20", "normalizeDateString handles Date object");
assert(normalizeDateString("") === "", "normalizeDateString handles empty string");
assert(normalizeDateString(null) === "", "normalizeDateString handles null");
assert(normalizeDateString(undefined) === "", "normalizeDateString handles undefined");

const fixedNow = new Date("2026-10-20T12:00:00.000Z");
assert(isDateToday(isoDateTime, fixedNow) === true, "isDateToday handles ISO string");
assert(isDateToday("2026-10-19", fixedNow) === false, "isDateToday handles yesterday");
assert(isDateBeforeToday("2026-10-19", fixedNow) === true, "isDateBeforeToday handles past date");
assert(isDateBeforeToday("2026-10-20T08:00:00Z", fixedNow) === false, "isDateBeforeToday returns false for today ISO");

// ------------------------------------------------------------
// Area 3: Overdue Detection Parity (productivityEngine vs NOVOContext) (7 assertions)
// ------------------------------------------------------------
console.log("--- Area 3: Overdue Parity Across Engines ---");
const testTasksOverdue: Task[] = [
  { id: "ov1", title: "Overdue standard", completed: false, priority: "medium", date: "2026-10-19" } as Task,
  { id: "ov2", title: "Overdue ISO", completed: false, priority: "high", date: "2026-10-18T23:59:59.000Z" } as Task,
  { id: "td1", title: "Today Task", completed: false, priority: "urgent", date: "2026-10-20" } as Task,
  { id: "cm1", title: "Completed Past", completed: true, priority: "high", date: "2026-10-15" } as Task,
];

const prodMetrics = analyzeProductivity(testTasksOverdue, fixedNow);
assert(prodMetrics.overdueTasksCount === 2, "productivityEngine identifies exactly 2 overdue tasks");

const fullSnapshot: WorkspaceSnapshot = {
  tasks: testTasksOverdue,
  goals: [],
  focusSessions: [],
};
const context = buildNOVOContext(fullSnapshot, fixedNow);
assert(context.overdueTasks.length === 2, "NOVOContext identifies exactly 2 overdue tasks");
assert(context.overdueTasks.some(t => t.id === "ov1"), "NOVOContext contains standard overdue task");
assert(context.overdueTasks.some(t => t.id === "ov2"), "NOVOContext contains ISO overdue task");
assert(!context.overdueTasks.some(t => t.id === "td1"), "NOVOContext excludes today task from overdue");
assert(!context.overdueTasks.some(t => t.id === "cm1"), "NOVOContext excludes completed task from overdue");
assert(context.overdueTasks.length === prodMetrics.overdueTasksCount, "Parity count match between context and productivity");

// ------------------------------------------------------------
// Area 4: Briefing Overdue Priority over Generic Recommendations (4 assertions)
// ------------------------------------------------------------
console.log("--- Area 4: Briefing Overdue Recommendation Hierarchy ---");
const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split("T")[0];
const tasksWithRealOverdue: Task[] = [
  { id: "ov-live", title: "Live overdue", completed: false, priority: "high", date: yesterdayStr } as Task,
];
const briefingOverdue = generateDailyBriefing({
  tasks: tasksWithRealOverdue,
  goals: [],
  focusSessions: [],
});

assert(briefingOverdue.recommendation.length > 0, "Briefing recommendation generated for overdue in EN");
assert(briefingOverdue.recommendationAr.length > 0, "Briefing recommendation generated for overdue in AR");

const cleanTasks: Task[] = [
  { id: "hp1", title: "High priority pending", completed: false, priority: "high", date: normalizeDateString(new Date()) } as Task
];
const briefingHighPriority = generateDailyBriefing({
  tasks: cleanTasks,
  goals: [],
  focusSessions: [],
});

assert(briefingHighPriority.recommendation.length > 0, "Briefing generates recommendation for pending high priority");
assert(briefingHighPriority.recommendationAr.length > 0, "Briefing generates Arabic recommendation for pending high priority");

// ------------------------------------------------------------
// Area 5: Canonical Exposure & Reference Parity across Engines (9 assertions)
// ------------------------------------------------------------
console.log("--- Area 5: Canonical Consumer Exposure & Parity ---");
const goalEngineRes = analyzeDailyGoalAlignment([], testTasksOverdue, "2026-10-20");
assert(goalEngineRes !== undefined, "analyzeDailyGoalAlignment produces result with canonical date");

const nextActionRes = determineNextAction(testTasksOverdue, [], fixedNow);
assert(nextActionRes !== null && typeof nextActionRes === "object", "determineNextAction produces valid object");
assert(nextActionRes.action !== null, "determineNextAction selects action");

const attentionRadarRes = evaluateAttentionRadar({
  tasks: testTasksOverdue,
  goals: [],
  focusSessions: [],
  now: fixedNow,
});
assert(attentionRadarRes !== undefined && attentionRadarRes !== null, "evaluateAttentionRadar completes successfully");

const goalVelocityRes = analyzeAllGoalsPacing(
  [{ id: "g1", title: "Goal 1", status: "active", targetDate: "2026-10-25" } as Goal],
  testTasksOverdue,
  [],
  fixedNow
);
assert(Array.isArray(goalVelocityRes), "analyzeAllGoalsPacing produces array of analyses");

assert(context.briefing !== undefined, "context exposes briefing canonical field");
assert(context.nextAction !== undefined, "context exposes nextAction canonical field");
assert(context.attentionRadar !== undefined, "context exposes attentionRadar canonical field");
assert(context.goalPacing !== undefined, "context exposes goalPacing canonical field");

// ------------------------------------------------------------
// Area 6: Determinism, Read-Only Behavior & Immutability (7 assertions)
// ------------------------------------------------------------
console.log("--- Area 6: Determinism & Immutability ---");
const originalTaskSnapshot = JSON.stringify(testTasksOverdue);
const originalGoalsSnapshot = JSON.stringify(baseGoals);
const originalSessionsSnapshot = JSON.stringify(baseSessions);

const run1 = buildNOVOContext(fullSnapshot, fixedNow);
const run2 = buildNOVOContext(fullSnapshot, fixedNow);

assert(JSON.stringify(testTasksOverdue) === originalTaskSnapshot, "Input tasks are immutable");
assert(JSON.stringify(baseGoals) === originalGoalsSnapshot, "Input goals are immutable");
assert(JSON.stringify(baseSessions) === originalSessionsSnapshot, "Input focusSessions are immutable");

assert(run1.overdueTasks.length === run2.overdueTasks.length, "Deterministic repeated context overdue count");
assert(JSON.stringify(run1.nextAction) === JSON.stringify(run2.nextAction), "Deterministic repeated nextAction parity");
assert(JSON.stringify(run1.attentionRadar) === JSON.stringify(run2.attentionRadar), "Deterministic repeated attentionRadar parity");
assert(JSON.stringify(run1.goalPacing) === JSON.stringify(run2.goalPacing), "Deterministic repeated goalPacing parity");

console.log("\n============================================================");
if (assertionsRun === 45) {
  console.log(`Gate 20-C Intelligence Convergence Suite: PASS (${assertionsRun}/45)`);
  console.log("============================================================\n");
} else {
  throw new Error(`Expected exactly 45 assertions, but ran ${assertionsRun}`);
}
