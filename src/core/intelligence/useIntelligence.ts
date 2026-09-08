import { useMemo, useCallback } from 'react';
import { usePlanner } from '../../modules/planner/hooks/usePlanner';
import { useGoals } from '../../modules/goals/hooks/useGoals';
import { useFocus } from '../../modules/focus/hooks/useFocus';
import { useNotes } from '../../modules/notes/hooks/useNotes';
import { useMoney } from '../../modules/money/hooks/useMoney';
import { useKnowledge } from '../../modules/knowledge/hooks/useKnowledge';
import { useChat } from '../../modules/chat/hooks/useChat';

import {
  ProductivitySummary,
  GoalHealthResult,
  FocusSummary,
  FinanceSummary,
  KnowledgeSummary,
  Insight,
  ActivityEvent,
  ActivityItem,
  DailyOverview,
  NOVOContext,
  NovoScore,
  DailyBriefing,
  WeeklyReview,
} from './intelligenceTypes';

import { analyzeProductivity } from './productivityEngine';
import { analyzeGoals } from './goalEngine';
import { analyzeFocus } from './focusEngine';
import { analyzeFinance } from './financeEngine';
import { analyzeNotesAndKnowledge } from './notesEngine';
import { calculateNovoScore } from './scoreEngine';
import { generateSmartInsights } from './insightEngine';
import {
  generateActivityTimeline,
  getTodayActivity,
  getWeekActivity,
} from './activityEngine';
import { generateDailyBriefing } from './briefingEngine';
import { generateWeeklyReview } from './weeklyReviewEngine';
import { buildNOVOContext } from './contextEngine';
import { getTodayString } from './dateUtils';

export interface UseIntelligenceResult {
  productivity: ProductivitySummary;
  goalHealth: GoalHealthResult;
  focus: FocusSummary;
  finance: FinanceSummary;
  knowledge: KnowledgeSummary;
  productivityScore: number; // 0 to 100 scalar
  novoScore: NovoScore; // Full score with labels and category breakdown
  briefing: DailyBriefing; // Morning/daily briefing with stats and recommendation
  weeklyReview: WeeklyReview; // Weekly productivity retrospective
  insights: Insight[];
  topInsight: Insight | null;
  activityTimeline: ActivityItem[];
  todayActivity: ActivityItem[];
  weekActivity: ActivityItem[];
  dailyOverview: DailyOverview;
  getContext: () => NOVOContext;
}

/**
 * Unified Intelligence Hook for NOVO
 * Reactive, memoized bridge connecting local user storage data directly
 * with the deterministic intelligence analysis engines.
 */
export function useIntelligence(): UseIntelligenceResult {
  const { tasks } = usePlanner();
  const { goals } = useGoals();
  const { sessions } = useFocus();
  const { notes } = useNotes();
  const { transactions } = useMoney();
  const { items: knowledgeItems } = useKnowledge();
  const { conversations } = useChat();

  // 1. Productivity analysis
  const productivity = useMemo(() => {
    return analyzeProductivity(tasks);
  }, [tasks]);

  // 2. Goals health analysis
  const goalHealth = useMemo(() => {
    return analyzeGoals(goals);
  }, [goals]);

  // 3. Focus analysis
  const focus = useMemo(() => {
    return analyzeFocus(sessions);
  }, [sessions]);

  // 4. Finance analysis
  const finance = useMemo(() => {
    return analyzeFinance(transactions);
  }, [transactions]);

  // 5. Notes & Knowledge analysis
  const knowledge = useMemo(() => {
    return analyzeNotesAndKnowledge(notes, knowledgeItems);
  }, [notes, knowledgeItems]);

  // 6. NOVO Score (0 - 100 with category breakdown)
  const novoScore = useMemo(() => {
    return calculateNovoScore({
      productivity,
      goals: goalHealth,
      focus,
      knowledge,
    });
  }, [productivity, goalHealth, focus, knowledge]);

  const productivityScore = novoScore.score;

  // 7. Smart Insights
  const insights = useMemo(() => {
    return generateSmartInsights({
      productivity,
      goals: goalHealth,
      focus,
      finance,
      knowledge,
    });
  }, [productivity, goalHealth, focus, finance, knowledge]);

  const topInsight = useMemo(() => {
    return insights.length > 0 ? insights[0] : null;
  }, [insights]);

  // 8. Derived Activity Timeline
  const activityData = useMemo(() => {
    return {
      tasks,
      goals,
      notes,
      sessions,
      transactions,
      conversations,
      knowledgeItems,
    };
  }, [tasks, goals, notes, sessions, transactions, conversations, knowledgeItems]);

  const activityTimeline = useMemo(() => {
    return generateActivityTimeline(activityData, 30);
  }, [activityData]);

  const todayActivity = useMemo(() => {
    return getTodayActivity(activityTimeline);
  }, [activityTimeline]);

  const weekActivity = useMemo(() => {
    return getWeekActivity(activityTimeline);
  }, [activityTimeline]);

  // 9. Daily Briefing
  const briefing = useMemo(() => {
    return generateDailyBriefing({
      productivity,
      goals: goalHealth,
      focus,
      finance,
      knowledge,
    });
  }, [productivity, goalHealth, focus, finance, knowledge]);

  // 10. Weekly Review
  const weeklyReview = useMemo(() => {
    return generateWeeklyReview({
      tasks,
      notes,
      goals,
      sessions,
      transactions,
      knowledgeItems,
    });
  }, [tasks, notes, goals, sessions, transactions, knowledgeItems]);

  // 11. Daily Overview object
  const dailyOverview: DailyOverview = useMemo(() => {
    return {
      date: getTodayString(),
      taskSummary: productivity,
      goalSummary: goalHealth,
      focusSummary: focus,
      financeSummary: finance,
      knowledgeSummary: knowledge,
      productivityScore,
      topInsights: insights,
      recentActivity: activityTimeline as ActivityEvent[],
    };
  }, [productivity, goalHealth, focus, finance, knowledge, productivityScore, insights, activityTimeline]);

  // 12. Context Builder callable
  const getContext = useCallback((): NOVOContext => {
    return buildNOVOContext({
      tasks,
      goals,
      notes,
      sessions,
      transactions,
      conversations,
      knowledgeItems,
    });
  }, [tasks, goals, notes, sessions, transactions, conversations, knowledgeItems]);

  return {
    productivity,
    goalHealth,
    focus,
    finance,
    knowledge,
    productivityScore,
    novoScore,
    briefing,
    weeklyReview,
    insights,
    topInsight,
    activityTimeline,
    todayActivity,
    weekActivity,
    dailyOverview,
    getContext,
  };
}
