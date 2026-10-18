import {
  WorkspaceSnapshot,
  IntelligenceSnapshot,
} from './intelligenceTypes';
import { analyzeProductivity } from './productivityEngine';
import { analyzeGoals, analyzeDailyGoalAlignment } from './goalEngine';
import { analyzeFocus } from './focusEngine';
import { analyzeFinance } from './financeEngine';
import { analyzeNotesAndKnowledge } from './notesEngine';
import { analyzeAllGoalsPacing } from './goalVelocityEngine';
import { generateActivityTimeline } from './activityEngine';
import { calculateNovoScore } from './scoreEngine';
import { determineNextAction } from './nextActionEngine';
import { evaluateAttentionRadar } from './attentionEngine';
import { generateSmartInsights } from './insightEngine';
import { generateDailyBriefing } from './briefingEngine';
import { generateWeeklyReview } from './weeklyReviewEngine';
import { getTodayString } from './dateUtils';

/**
 * Deterministic Intelligence Orchestrator
 *
 * The sole canonical evaluation pipeline for NOVO workspace intelligence.
 * Pure, synchronous, and completely deterministic.
 * Zero React dependency, zero Zustand dependency, zero RepositoryFactory dependency,
 * zero Firebase dependency, zero localStorage dependency, zero Gemini/LLM dependency.
 *
 * Implements the 5-step dependency sequence:
 * STEP 1 — Domain Analysis
 * STEP 2 — Structural Synthesis
 * STEP 3 — Scoring / Priority
 * STEP 4 — Insights / Briefing
 * STEP 5 — Retrospective
 */
export function evaluateWorkspaceIntelligence(
  snapshot: WorkspaceSnapshot,
  now: Date = new Date()
): IntelligenceSnapshot {
  const todayStr = snapshot.date || getTodayString(now);

  // STEP 1 — DOMAIN ANALYSIS
  const productivity = analyzeProductivity(snapshot.tasks, now);
  const goalHealth = analyzeGoals(snapshot.goals, now);
  const focus = analyzeFocus(snapshot.sessions, now);
  const finance = analyzeFinance(snapshot.transactions, now);
  const knowledge = analyzeNotesAndKnowledge(snapshot.notes, snapshot.knowledgeItems, now);

  // STEP 2 — STRUCTURAL SYNTHESIS
  const dailyGoalAlignment = analyzeDailyGoalAlignment(snapshot.tasks, snapshot.goals, todayStr);
  const goalPacing = analyzeAllGoalsPacing(snapshot.goals, snapshot.tasks, snapshot.sessions, now);
  const activityTimeline = generateActivityTimeline(
    {
      notes: snapshot.notes,
      goals: snapshot.goals,
      tasks: snapshot.tasks,
      sessions: snapshot.sessions,
      transactions: snapshot.transactions,
      conversations: snapshot.conversations,
      knowledgeItems: snapshot.knowledgeItems,
    },
    30
  );

  // STEP 3 — SCORING / PRIORITY
  const score = calculateNovoScore({
    productivity,
    goals: goalHealth,
    focus,
    knowledge,
  });
  const nextAction = determineNextAction(snapshot.tasks, snapshot.goals, todayStr);
  const attentionRadar = evaluateAttentionRadar({
    tasks: snapshot.tasks,
    goals: snapshot.goals,
    focusSessions: snapshot.sessions,
    todayStr,
    todayFocusMinutes: focus.todayFocusMinutes,
  });

  // STEP 4 — INSIGHTS / BRIEFING
  const insights = generateSmartInsights(
    {
      productivity,
      goals: goalHealth,
      focus,
      finance,
      knowledge,
    },
    now
  );
  const briefing = generateDailyBriefing(
    {
      productivity,
      goals: goalHealth,
      focus,
      finance,
      knowledge,
      goalAlignment: dailyGoalAlignment,
    },
    now
  );

  // STEP 5 — RETROSPECTIVE
  const weeklyReview = generateWeeklyReview(
    {
      tasks: snapshot.tasks,
      goals: snapshot.goals,
      notes: snapshot.notes,
      sessions: snapshot.sessions,
      transactions: snapshot.transactions,
      knowledgeItems: snapshot.knowledgeItems,
    },
    now
  );

  return {
    evaluatedAt: now.toISOString(),
    snapshot,
    productivity,
    goalHealth,
    dailyGoalAlignment,
    focus,
    finance,
    knowledge,
    score,
    insights,
    briefing,
    weeklyReview,
    nextAction,
    attentionRadar,
    goalPacing,
    activityTimeline,
  };
}
