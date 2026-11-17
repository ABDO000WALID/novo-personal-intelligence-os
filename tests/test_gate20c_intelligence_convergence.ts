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
console.log(" Gate 20-C Intelligence Convergence Test Suite (Hardened)");
console.log("============================================================\n");

// ------------------------------------------------------------
// Area 1: Deterministic insight ordering with ID tie-breaking (8 assertions)
// ------------------------------------------------------------
console.log("--- Area 1: Deterministic Insight Ordering ---");
const dummyInputState = {
  productivity: {
    totalTasks: 10,
    completedTasks: 2,
    pendingTasks: 8,
    todayTasks: 6,
    todayCompletedTasks: 1,
    completionPercentage: 20,
    highPriorityPendingCount: 2,
    overdueTasksCount: 2,
    recentCompletionRate: 20,
  },
  goals: {
    totalGoals: 2,
    completedGoals: 0,
    activeGoals: 2,
    averageProgress: 40,
    goalsBelow25: 0,
    goalsAbove75: 0,
    recentlyUpdatedGoals: 1,
    healthStatus: "good" as const,
  },
  focus: {
    totalFocusMinutes: 60,
    todayFocusMinutes: 30,
    weeklyFocusMinutes: 60,
    totalSessions: 2,
    averageSessionMinutes: 30,
    longestStreakDays: 1,
  },
  finance: {
    totalIncome: 0,
    totalExpenses: 0,
    currentBalance: 0,
    recentSpending: 0,
    expensesByCategory: [],
    largestExpenseCategory: null,
    recentTransactionCount: 0,
  },
  knowledge: {
    totalNotes: 2,
    recentlyCreatedNotes: 1,
    recentlyUpdatedNotes: 1,
    notesCreatedThisWeek: 1,
    latestActivity: null,
    totalKnowledgeItems: 2,
  },
};

const insightsA = generateSmartInsights(dummyInputState);
const insightsB = generateSmartInsights(dummyInputState);

assert(Array.isArray(insightsA), "generateSmartInsights returns array");
assert(insightsA.length === insightsB.length, "Deterministic insight length parity");
assert(insightsA.map(i => i.type).join(",") === insightsB.map(i => i.type).join(","), "Deterministic insight type sequence");
assert(insightsA.map(i => i.priority).join(",") === insightsB.map(i => i.priority).join(","), "Deterministic insight priority sequence");

// Test genuine production insight tie-breaking on the raw returned array
const highTaskLoadInsight = insightsA.find(i => i.id === "ins-high-task-load");
const overdueTasksInsight = insightsA.find(i => i.id === "ins-overdue-tasks");
assert(highTaskLoadInsight !== undefined && highTaskLoadInsight.priority === "high", "ins-high-task-load generated with high priority");
assert(overdueTasksInsight !== undefined && overdueTasksInsight.priority === "high", "ins-overdue-tasks generated with high priority");

const actualHighTaskLoadIdx = insightsA.indexOf(highTaskLoadInsight!);
const actualOverdueIdx = insightsA.indexOf(overdueTasksInsight!);
assert(actualHighTaskLoadIdx !== -1 && actualOverdueIdx !== -1, "Both insights present in raw production output");
assert(actualHighTaskLoadIdx < actualOverdueIdx, "Lexical tie-breaker preserves ascending order in raw production array");

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

const baseGoals: Goal[] = [
  { id: "g1", title: "Goal 1", status: "active", progress: 50, targetDate: "2026-10-25" } as Goal
];
const baseSessions: FocusSession[] = [
  { id: "s1", durationMinutes: 25, completedAt: "2026-10-20T10:00:00.000Z" } as FocusSession
];

const fullSnapshot: WorkspaceSnapshot = {
  tasks: testTasksOverdue,
  goals: baseGoals,
  focusSessions: baseSessions,
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
const competingState = {
  ...dummyInputState,
  productivity: {
    ...dummyInputState.productivity,
    overdueTasksCount: 2,
    highPriorityPendingCount: 3,
  },
};

const briefingPrecedence = generateDailyBriefing(competingState, fixedNow);

assert(briefingPrecedence.recommendation.includes("overdue tasks that need review"), "Briefing selects overdue recommendation text");
assert(!briefingPrecedence.recommendation.includes("highest priority task is still incomplete"), "Briefing suppresses competing high-priority recommendation");
assert(briefingPrecedence.recommendationAr.includes("مهام متأخرة تحتاج للمراجعة"), "Arabic briefing selects overdue recommendation text");
assert(!briefingPrecedence.recommendationAr.includes("مهمتك ذات الأولوية القصوى"), "Arabic briefing suppresses competing high-priority recommendation");

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
  baseGoals,
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
