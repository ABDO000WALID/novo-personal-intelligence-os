import { Task, Goal, FocusSession, Note, Transaction, KnowledgeItem } from './src/types/data';
import { generateSmartInsights } from './src/core/intelligence/insightEngine';
import { analyzeGoals, analyzeDailyGoalAlignment } from './src/core/intelligence/goalEngine';
import { calculateNovoScore } from './src/core/intelligence/scoreEngine';
import { analyzeProductivity } from './src/core/intelligence/productivityEngine';
import { evaluateAttentionRadar } from './src/core/intelligence/attentionEngine';
import { determineNextAction } from './src/core/intelligence/nextActionEngine';
import { generateWeeklyReview } from './src/core/intelligence/weeklyReviewEngine';
import { generateActivityTimeline } from './src/core/intelligence/activityEngine';
import { captureWorkspaceSnapshot } from './src/core/intelligence/workspaceSnapshotBuilder';
import { evaluateWorkspaceIntelligence } from './src/core/intelligence/intelligenceOrchestrator';
import { buildNOVOContext } from './src/core/intelligence/contextEngine';
import { getTodayString } from './src/core/intelligence/dateUtils';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

async function runSuite() {
  console.log('======================================================================');
  console.log('GATE 20-B: INTELLIGENCE CORRECTNESS & HARDENING SUITE');
  console.log('======================================================================\n');

  const FIXED_NOW = new Date('2026-10-18T10:00:00.000Z');
  const TODAY_STR = '2026-10-18';

  // -------------------------------------------------------------------
  // TEST 1: Today's Completion Rate vs Lifetime Completion Rate
  // -------------------------------------------------------------------
  console.log('--- Test 1: Productivity Streak Insight Correctness ---');
  {
    // Case A: 100 historical tasks, 80 completed (lifetime 80%), but today has 5 tasks with 0 completed
    const stateLifetimeHighTodayZero = {
      productivity: {
        totalTasks: 100,
        completedTasks: 80,
        pendingTasks: 20,
        todayTasks: 5,
        todayCompletedTasks: 0,
        completionPercentage: 80,
        highPriorityPendingCount: 1,
        overdueTasksCount: 0,
        recentCompletionRate: 0,
      },
      goals: { totalGoals: 1, completedGoals: 0, activeGoals: 1, averageProgress: 50, goalsBelow25: 0, goalsAbove75: 0, recentlyUpdatedGoals: 1, healthStatus: 'good' as const },
      focus: { totalSessions: 2, totalFocusMinutes: 50, todaySessions: 1, todayFocusMinutes: 25, weeklyFocusMinutes: 50, averageSessionDuration: 25, recentActivityCount: 2 },
      finance: { totalIncome: 1000, totalExpenses: 200, currentBalance: 800, recentSpending: 50, expensesByCategory: [], largestExpenseCategory: null, recentTransactionCount: 2 },
      knowledge: { totalNotes: 5, recentlyCreatedNotes: 1, recentlyUpdatedNotes: 1, notesCreatedThisWeek: 1, latestActivity: FIXED_NOW.toISOString(), totalKnowledgeItems: 0, pinnedKnowledgeCount: 0 },
    };

    const insightsA = generateSmartInsights(stateLifetimeHighTodayZero as any, FIXED_NOW);
    const streakA = insightsA.find((i) => i.id === 'ins-productivity-streak');
    assert(streakA === undefined, 'Productivity streak must NOT trigger when todayCompletedTasks === 0 despite high lifetime completion');

    // Case B: Today has 4 tasks, 3 completed (75% today)
    const stateTodayHigh = {
      ...stateLifetimeHighTodayZero,
      productivity: {
        ...stateLifetimeHighTodayZero.productivity,
        todayTasks: 4,
        todayCompletedTasks: 3,
        completionPercentage: 30, // lifetime low
        recentCompletionRate: 75,
      },
    };
    const insightsB = generateSmartInsights(stateTodayHigh as any, FIXED_NOW);
    const streakB = insightsB.find((i) => i.id === 'ins-productivity-streak');
    assert(streakB !== undefined, 'Productivity streak triggers when today completion rate is >= 70%');
    assert(streakB?.description.includes('75%'), `Insight description reflects today's 75%: "${streakB?.description}"`);
    assert(streakB?.descriptionAr?.includes('75%') === true, `Arabic insight reflects today's 75%: "${streakB?.descriptionAr}"`);
  }

  // -------------------------------------------------------------------
  // TEST 2: Invalid / Undefined / NaN Goal Progress Sanitization
  // -------------------------------------------------------------------
  console.log('\n--- Test 2: Goal Progress Sanitization & Score NaN Prevention ---');
  {
    const corruptedGoals: Goal[] = [
      { id: 'g1', title: 'Goal 1', description: '', progress: undefined as any, createdAt: '2026-10-01', updatedAt: '2026-10-10' },
      { id: 'g2', title: 'Goal 2', description: '', progress: NaN, createdAt: '2026-10-01', updatedAt: '2026-10-10' },
      { id: 'g3', title: 'Goal 3', description: '', progress: null as any, createdAt: '2026-10-01', updatedAt: '2026-10-10' },
      { id: 'g4', title: 'Goal 4', description: '', progress: 60, createdAt: '2026-10-01', updatedAt: '2026-10-10' },
    ];

    const health = analyzeGoals(corruptedGoals, FIXED_NOW);
    assert(!isNaN(health.averageProgress), `averageProgress is not NaN: ${health.averageProgress}`);
    assert(typeof health.averageProgress === 'number', 'averageProgress is numeric');
    // Total progress = 0 + 0 + 0 + 60 = 60, totalGoals = 4 -> average = 15
    assert(health.averageProgress === 15, `averageProgress correctly computes 15 (got ${health.averageProgress})`);
    assert(health.completedGoals === 0, 'completedGoals is 0');
    assert(health.activeGoals === 4, 'activeGoals is 4');

    // Downstream ScoreEngine NaN safety
    const dummyProductivity = {
      totalTasks: 2, completedTasks: 1, pendingTasks: 1, todayTasks: 1, todayCompletedTasks: 1,
      completionPercentage: 50, highPriorityPendingCount: 0, overdueTasksCount: 0, recentCompletionRate: 50,
    };
    const dummyFocus = {
      totalSessions: 1, totalFocusedMinutes: 25, todaySessions: 1, todayFocusMinutes: 25,
      weeklyFocusMinutes: 25, averageSessionDuration: 25, recentActivityCount: 1,
    };
    const dummyKnowledge = {
      totalNotes: 1, recentlyCreatedNotes: 1, recentlyUpdatedNotes: 1, notesCreatedThisWeek: 1,
      latestActivity: FIXED_NOW.toISOString(), totalKnowledgeItems: 0, pinnedKnowledgeCount: 0,
    };

    const scoreResult = calculateNovoScore({
      productivity: dummyProductivity,
      goals: health,
      focus: dummyFocus,
      knowledge: dummyKnowledge,
    });

    assert(!isNaN(scoreResult.score), `NOVO Score is not NaN: ${scoreResult.score}`);
    assert(scoreResult.score > 0 && scoreResult.score <= 100, `NOVO Score is bounded [0, 100]: ${scoreResult.score}`);
    assert(!isNaN(scoreResult.breakdown.goals), `Goal score breakdown is not NaN: ${scoreResult.breakdown.goals}`);

    // Test valid progress behavior unchanged
    const validGoals: Goal[] = [
      { id: 'vg1', title: 'Valid 1', description: '', progress: 40, createdAt: '2026-10-01', updatedAt: '2026-10-10' },
      { id: 'vg2', title: 'Valid 2', description: '', progress: 80, createdAt: '2026-10-01', updatedAt: '2026-10-10' },
    ];
    const validHealth = analyzeGoals(validGoals, FIXED_NOW);
    assert(validHealth.averageProgress === 60, `Valid goals averageProgress is exactly 60 (got ${validHealth.averageProgress})`);
    assert(validHealth.goalsAbove75 === 1, 'Valid goalsAbove75 count is 1');
  }

  // -------------------------------------------------------------------
  // TEST 3: Task Date Normalization (YYYY-MM-DD and ISO datetime)
  // -------------------------------------------------------------------
  console.log('\n--- Test 3: Task Date Normalization Across Engines ---');
  {
    const tasksWithIso: Task[] = [
      { id: 't-plain', title: 'Plain Date', date: '2026-10-18', completed: false, priority: 'medium', createdAt: '2026-10-18T08:00:00Z' },
      { id: 't-iso', title: 'ISO Datetime', date: '2026-10-18T14:30:00.000Z', completed: false, priority: 'high', createdAt: '2026-10-18T08:00:00Z', goalId: 'g1' },
      { id: 't-past-iso', title: 'Past ISO', date: '2026-10-16T12:00:00.000Z', completed: false, priority: 'medium', createdAt: '2026-10-16T08:00:00Z' },
    ];

    // ProductivityEngine
    const prod = analyzeProductivity(tasksWithIso, FIXED_NOW);
    assert(prod.todayTasks === 2, `ProductivityEngine counts both plain and ISO today tasks: ${prod.todayTasks} (expected 2)`);
    assert(prod.overdueTasksCount === 1, `ProductivityEngine counts past ISO task as overdue: ${prod.overdueTasksCount} (expected 1)`);

    // GoalEngine alignment
    const goalsForAlign: Goal[] = [
      { id: 'g1', title: 'Active Goal', description: '', progress: 20, createdAt: '2026-10-01', updatedAt: '2026-10-01' },
    ];
    const alignment = analyzeDailyGoalAlignment(tasksWithIso, goalsForAlign, FIXED_NOW);
    assert(alignment.todayTaskCount === 2, `GoalEngine counts both plain and ISO today tasks: ${alignment.todayTaskCount}`);
    assert(alignment.todayGoalTaskCount === 1, `GoalEngine recognizes ISO task linked to goal: ${alignment.todayGoalTaskCount}`);

    // AttentionEngine
    const attention = evaluateAttentionRadar({
      tasks: tasksWithIso,
      goals: goalsForAlign,
      todayStr: TODAY_STR,
      now: FIXED_NOW,
    });
    // Tier 1 overdue should catch past ISO task
    assert(attention.tier === 1, `AttentionRadar recognizes past ISO task as Tier 1 overdue: ${attention.tier}`);
    if (attention.tier === 1) {
      assert(attention.selectedTaskId === 't-past-iso', `Selected overdue task is t-past-iso (got ${attention.selectedTaskId})`);
    }

    // NextActionEngine
    const nextAction = determineNextAction(tasksWithIso, goalsForAlign, FIXED_NOW);
    assert(nextAction.tier === 1, `NextActionEngine recognizes past ISO task as Tier 1: ${nextAction.tier}`);
    if (nextAction.type === 'existing_task') {
      assert(nextAction.selectedTaskId === 't-past-iso', `Selected next action is t-past-iso (got ${nextAction.selectedTaskId})`);
    }
  }

  // -------------------------------------------------------------------
  // TEST 4: Weekly Review Strict Calendar Boundaries
  // -------------------------------------------------------------------
  console.log('\n--- Test 4: Strict Calendar-Week Boundaries in WeeklyReview ---');
  {
    // Sun Oct 11 to Sat Oct 17 is calendar week prior.
    // Sun Oct 18 is start of new week!
    // FIXED_NOW is Sun Oct 18, 2026.
    // An item on Sat Oct 17 is within rolling 7 days, but BEFORE start of current week!
    const reviewData = {
      tasks: [
        { id: 't-this-week', title: 'Sunday Task', date: '2026-10-18', completed: true, priority: 'medium' as const, createdAt: '2026-10-18T09:00:00Z' },
        { id: 't-last-week', title: 'Saturday Task', date: '2026-10-17', completed: true, priority: 'medium' as const, createdAt: '2026-10-17T15:00:00Z' },
      ],
      sessions: [
        { id: 's1', duration: 30, completedAt: '2026-10-18T10:00:00Z' },
        { id: 's2', duration: 45, completedAt: '2026-10-17T14:00:00Z' }, // previous week
      ],
      notes: [
        { id: 'n1', title: 'Sun Note', content: '', createdAt: '2026-10-18T08:00:00Z', updatedAt: '2026-10-18T08:00:00Z' },
        { id: 'n2', title: 'Sat Note', content: '', createdAt: '2026-10-17T08:00:00Z', updatedAt: '2026-10-17T08:00:00Z' },
      ],
    };

    const review = generateWeeklyReview(reviewData, FIXED_NOW);
    assert(review.tasksCreated === 1, `Strict calendar week includes only this week task: ${review.tasksCreated} (expected 1)`);
    assert(review.tasksCompleted === 1, `Strict calendar week includes only this week completed task: ${review.tasksCompleted} (expected 1)`);
    assert(review.focusSessions === 1, `Strict calendar week includes only this week focus session: ${review.focusSessions} (expected 1)`);
    assert(review.focusMinutes === 30, `Strict calendar week focusMinutes is 30: ${review.focusMinutes} (expected 30)`);
    assert(review.notesCreated === 1, `Strict calendar week notesCreated is 1: ${review.notesCreated} (expected 1)`);
  }

  // -------------------------------------------------------------------
  // TEST 5: Undefined Priority Consistency (Next Action vs Attention Radar)
  // -------------------------------------------------------------------
  console.log('\n--- Test 5: Harmonized Default Priority for Undefined/Missing Priority ---');
  {
    // Task 1 has undefined priority.
    // Task 2 has explicit 'low' priority.
    // Both are overdue.
    // With harmonized 'medium' default:
    // Task 1 (medium) must rank HIGHER than Task 2 (low) in BOTH engines!
    const overdueTasks: Task[] = [
      { id: 't-low', title: 'Explicit Low', date: '2026-10-15', completed: false, priority: 'low', createdAt: '2026-10-15T00:00:00Z' },
      { id: 't-undef', title: 'Undefined Priority', date: '2026-10-15', completed: false, priority: undefined as any, createdAt: '2026-10-15T12:00:00Z' },
    ];

    const nextActionRes = determineNextAction(overdueTasks, [], FIXED_NOW);
    const attentionRes = evaluateAttentionRadar({
      tasks: overdueTasks,
      goals: [],
      todayStr: TODAY_STR,
      now: FIXED_NOW,
    });

    assert(nextActionRes.type === 'existing_task', 'Next Action selects existing task');
    assert(attentionRes.tier === 1, 'Attention Radar triggers Tier 1 overdue');

    const nextTaskId = nextActionRes.type === 'existing_task' ? nextActionRes.selectedTaskId : null;
    const attentionTaskId = attentionRes.tier === 1 ? attentionRes.selectedTaskId : null;

    assert(nextTaskId === 't-undef', `Next Action ranks undefined priority as medium (over low): ${nextTaskId}`);
    assert(attentionTaskId === 't-undef', `Attention Radar ranks undefined priority as medium (over low): ${attentionTaskId}`);
    assert(nextTaskId === attentionTaskId, `Next Action and Attention Radar pick identical task: ${nextTaskId} === ${attentionTaskId}`);
  }

  // -------------------------------------------------------------------
  // TEST 6: Deterministic Activity Timeline Fallback
  // -------------------------------------------------------------------
  console.log('\n--- Test 6: Deterministic Activity Timeline Fallback ---');
  {
    const sourceWithMissingDates = {
      tasks: [
        { id: 't-no-created', title: 'No Date Task', date: '2026-10-18', completed: true, priority: 'medium' as const, createdAt: undefined as any },
      ],
      goals: [
        { id: 'g-no-date', title: 'No Date Goal', description: '', progress: 50, createdAt: undefined as any, updatedAt: undefined as any },
      ],
    };

    const timeline1 = generateActivityTimeline(sourceWithMissingDates, 30, FIXED_NOW);
    const timeline2 = generateActivityTimeline(sourceWithMissingDates, 30, FIXED_NOW);

    assert(timeline1.length === 2, `Timeline has 2 events: ${timeline1.length}`);
    assert(timeline1[0].createdAt === FIXED_NOW.toISOString(), `Missing createdAt falls back to deterministic timestamp: ${timeline1[0].createdAt}`);
    assert(timeline1[0].id === timeline2[0].id, 'Identical calls produce identical first item ID');
    assert(timeline1[1].id === timeline2[1].id, 'Identical calls produce identical second item ID');
    assert(timeline1[0].createdAt === timeline2[0].createdAt, 'Identical calls produce identical item createdAt');
    assert(JSON.stringify(timeline1) === JSON.stringify(timeline2), 'Repeated calls produce 100% bit-for-bit identical activity timeline JSON');
  }

  // -------------------------------------------------------------------
  // TEST 7: WorkspaceSnapshot Builder Extraction Parity
  // -------------------------------------------------------------------
  console.log('\n--- Test 7: WorkspaceSnapshot Builder Extraction Parity ---');
  {
    const rawData = {
      tasks: [{ id: 't1', title: 'T1', date: '2026-10-18', completed: false, priority: 'medium' as const, createdAt: '2026-10-18' }],
      goals: [{ id: 'g1', title: 'G1', description: '', progress: 10, createdAt: '2026-10-18', updatedAt: '2026-10-18' }],
      notes: [{ id: 'n1', title: 'N1', content: '', createdAt: '2026-10-18', updatedAt: '2026-10-18' }],
    };

    const snapshot = captureWorkspaceSnapshot(rawData, FIXED_NOW);
    assert(snapshot.capturedAt === FIXED_NOW.toISOString(), `Snapshot capturedAt matches passed now: ${snapshot.capturedAt}`);
    assert(snapshot.date === TODAY_STR, `Snapshot date matches YYYY-MM-DD: ${snapshot.date}`);
    assert(Array.isArray(snapshot.tasks) && snapshot.tasks.length === 1, 'Snapshot tasks array preserved');
    assert(Array.isArray(snapshot.sessions) && snapshot.sessions.length === 0, 'Missing sessions defaulted to empty array');
    assert(Array.isArray(snapshot.conversations) && snapshot.conversations.length === 0, 'Missing conversations defaulted to empty array');
    assert(snapshot.activeFocusState === null, 'Missing activeFocusState defaulted to null');

    // Integration with buildNOVOContext
    const legacyCtx = buildNOVOContext(rawData, FIXED_NOW);
    assert(legacyCtx.tasks.length === 1, 'buildNOVOContext correctly delegates via captureWorkspaceSnapshot');
    assert(legacyCtx.date === TODAY_STR, 'buildNOVOContext date matches');
    assert(typeof legacyCtx.productivityScore === 'number', 'buildNOVOContext productivityScore populated');
  }

  // -------------------------------------------------------------------
  // TEST 8: Full Pipeline Determinism & Frozen Immutability
  // -------------------------------------------------------------------
  console.log('\n--- Test 8: Full Pipeline Determinism on Frozen Inputs ---');
  {
    const frozenTasks = Object.freeze([
      Object.freeze({ id: 'ft1', title: 'Frozen 1', date: '2026-10-18', completed: true, priority: 'high' as const, createdAt: '2026-10-18' }),
      Object.freeze({ id: 'ft2', title: 'Frozen 2', date: '2026-10-18', completed: false, priority: 'medium' as const, createdAt: '2026-10-18' }),
    ]);
    const frozenGoals = Object.freeze([
      Object.freeze({ id: 'fg1', title: 'Frozen Goal', description: '', progress: 50, createdAt: '2026-10-18', updatedAt: '2026-10-18' }),
    ]);

    const frozenSnapshot = Object.freeze({
      capturedAt: FIXED_NOW.toISOString(),
      date: TODAY_STR,
      tasks: frozenTasks as any,
      goals: frozenGoals as any,
      notes: Object.freeze([]) as any,
      knowledgeItems: Object.freeze([]) as any,
      transactions: Object.freeze([]) as any,
      sessions: Object.freeze([]) as any,
      conversations: Object.freeze([]) as any,
      activeFocusState: null,
      activeConversationId: null,
    });

    const eval1 = evaluateWorkspaceIntelligence(frozenSnapshot, FIXED_NOW);
    const eval2 = evaluateWorkspaceIntelligence(frozenSnapshot, FIXED_NOW);

    assert(eval1.score.score === eval2.score.score, 'NOVO Score is identical across repeated runs');
    assert(eval1.briefing.summary === eval2.briefing.summary, 'Briefing summary is identical');
    assert(eval1.insights.length === eval2.insights.length, 'Insights count is identical');
    assert(JSON.stringify(eval1.activityTimeline) === JSON.stringify(eval2.activityTimeline), 'Activity timeline is identical across runs');
  }

  console.log('\n======================================================================');
  console.log(`Gate 20-B Intelligence Correctness Suite: ${failed === 0 ? 'PASS' : 'FAIL'} (${passed}/${passed + failed})`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
