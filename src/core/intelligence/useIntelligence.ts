import { useMemo, useCallback } from 'react';
import { useGoalStore } from '../state/goalStore';
import { useTaskStore } from '../state/taskStore';
import { useFocusStore } from '../state/focusStore';
import { useNoteStore } from '../state/noteStore';
import { useMoneyStore } from '../state/moneyStore';
import { useKnowledgeStore } from '../state/knowledgeStore';
import { useChatStore } from '../state/chatStore';

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
  DailyGoalAlignmentResult,
  WorkspaceSnapshot,
} from './intelligenceTypes';
import { evaluateWorkspaceIntelligence } from './intelligenceOrchestrator';
import { toNOVOContext } from './contextEngine';
import { getTodayActivity, getWeekActivity } from './activityEngine';
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
  dailyGoalAlignment: DailyGoalAlignmentResult; // Pure deterministic goal-aligned execution analysis
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
 *
 * Reactive bridge connecting UI stores to the canonical evaluateWorkspaceIntelligence pipeline.
 * Owns React store subscriptions and assembles WorkspaceSnapshot.
 * Does NOT independently call individual intelligence engines.
 */
export function useIntelligence(): UseIntelligenceResult {
  const tasks = useTaskStore((state) => state.tasks);
  const goals = useGoalStore((state) => state.goals);
  const sessions = useFocusStore((state) => state.sessions);
  const notes = useNoteStore((state) => state.notes);
  const transactions = useMoneyStore((state) => state.transactions);
  const knowledgeItems = useKnowledgeStore((state) => state.knowledge);
  const conversations = useChatStore((state) => state.conversations);
  const activeFocusState = useFocusStore((state) => state.activeState);
  const activeConversationId = useChatStore((state) => state.activeConversationId);

  // Single canonical intelligence pipeline evaluation
  const intelligence = useMemo(() => {
    const snapshot: WorkspaceSnapshot = {
      capturedAt: new Date().toISOString(),
      date: getTodayString(),
      tasks,
      goals,
      notes,
      knowledgeItems,
      transactions,
      sessions,
      conversations,
      activeFocusState,
      activeConversationId,
    };
    return evaluateWorkspaceIntelligence(snapshot);
  }, [
    tasks,
    goals,
    sessions,
    notes,
    transactions,
    knowledgeItems,
    conversations,
    activeFocusState,
    activeConversationId,
  ]);

  const todayActivity = useMemo(() => {
    return getTodayActivity(intelligence.activityTimeline as any);
  }, [intelligence.activityTimeline]);

  const weekActivity = useMemo(() => {
    return getWeekActivity(intelligence.activityTimeline as any);
  }, [intelligence.activityTimeline]);

  const topInsight = useMemo(() => {
    return intelligence.insights.length > 0 ? intelligence.insights[0] : null;
  }, [intelligence.insights]);

  const dailyOverview: DailyOverview = useMemo(() => {
    return {
      date: intelligence.snapshot.date,
      taskSummary: intelligence.productivity,
      goalSummary: intelligence.goalHealth,
      focusSummary: intelligence.focus,
      financeSummary: intelligence.finance,
      knowledgeSummary: intelligence.knowledge,
      productivityScore: intelligence.score.score,
      topInsights: intelligence.insights,
      recentActivity: intelligence.activityTimeline as ActivityEvent[],
    };
  }, [intelligence]);

  // Stable adapter callback for downstream AI and chat orchestrator
  const getContext = useCallback((): NOVOContext => {
    return toNOVOContext(intelligence);
  }, [intelligence]);

  return {
    productivity: intelligence.productivity,
    goalHealth: intelligence.goalHealth,
    focus: intelligence.focus,
    finance: intelligence.finance,
    knowledge: intelligence.knowledge,
    productivityScore: intelligence.score.score,
    novoScore: intelligence.score,
    briefing: intelligence.briefing,
    weeklyReview: intelligence.weeklyReview,
    dailyGoalAlignment: intelligence.dailyGoalAlignment,
    insights: intelligence.insights,
    topInsight,
    activityTimeline: intelligence.activityTimeline,
    todayActivity,
    weekActivity,
    dailyOverview,
    getContext,
  };
}
