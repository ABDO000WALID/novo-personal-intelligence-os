import {
  Task,
  Goal,
  Note,
  FocusSession,
  Transaction,
  KnowledgeItem,
  Conversation,
} from '../../types/data';
import { ActiveFocusState } from '../../modules/focus/domain/types';

// 1. Productivity Types
export interface ProductivitySummary {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  todayTasks: number;
  todayCompletedTasks: number;
  completionPercentage: number; // 0 - 100
  highPriorityPendingCount: number;
  overdueTasksCount: number;
  recentCompletionRate: number; // 0 - 100
}

// 2. Goal Types
export type GoalHealthStatus = 'excellent' | 'good' | 'needs_attention' | 'at_risk';

export interface GoalHealthResult {
  totalGoals: number;
  activeGoals: number;
  completedGoals: number;
  averageProgress: number; // 0 - 100
  goalsBelow25: number;
  goalsAbove75: number;
  recentlyUpdatedGoals: number;
  healthStatus: GoalHealthStatus;
}

// 3. Focus Types
export interface FocusSummary {
  totalSessions: number;
  totalFocusedMinutes: number;
  todaySessions: number;
  todayFocusMinutes: number;
  weeklyFocusMinutes: number;
  averageSessionDuration: number;
  recentActivityCount: number;
}

// 4. Finance Types
export interface ExpenseCategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
}

export interface FinanceSummary {
  totalIncome: number;
  totalExpenses: number;
  currentBalance: number;
  recentSpending: number; // Last 7 days
  expensesByCategory: ExpenseCategoryBreakdown[];
  largestExpenseCategory: string | null;
  recentTransactionCount: number;
}

// 5. Notes & Knowledge Types
export interface KnowledgeSummary {
  totalNotes: number;
  recentlyCreatedNotes: number;
  recentlyUpdatedNotes: number;
  notesCreatedThisWeek: number;
  latestActivity: string | null;
  totalKnowledgeItems: number;
  pinnedKnowledgeCount: number;
}

// 6. Normalized Activity Event
export type ActivityEventType =
  | 'note'
  | 'goal'
  | 'task'
  | 'focus'
  | 'money'
  | 'chat'
  | 'knowledge'
  | string;

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  title: string;
  titleAr?: string;
  description: string;
  descriptionAr?: string;
  createdAt: string; // ISO 8601
  timestamp?: string; // ISO 8601
  module: string;
}

export type ActivityItem = ActivityEvent;

// 7. Smart Insights
export type InsightCategory =
  | 'warning'
  | 'success'
  | 'suggestion'
  | 'information'
  | 'productivity'
  | 'goals'
  | 'focus'
  | 'finance'
  | 'knowledge'
  | 'system';

export type InsightType = InsightCategory;

export type InsightPriority = 'low' | 'medium' | 'high';

export interface Insight {
  id: string;
  type: InsightCategory;
  priority: InsightPriority;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  actionLabel?: string;
  actionLabelAr?: string;
  module?: string;
  relatedModule?: string;
  createdAt: string;
}

export type { NovoScore, ScoreBreakdown } from './scoreEngine';
export type { DailyBriefing, DailyBriefingTaskStats, DailyBriefingGoalStats, DailyBriefingFocusStats, DailyBriefingMoneyStats } from './briefingEngine';
export type { WeeklyReview } from './weeklyReviewEngine';
export type { DailyGoalAlignmentResult } from './goalEngine';
export type { NextActionResult } from './nextActionEngine';
export type { AttentionRadarResult } from './attentionEngine';
export type { GoalPacingAnalysis } from './goalVelocityEngine';

import type { NextActionResult } from './nextActionEngine';
import type { AttentionRadarResult } from './attentionEngine';
import type { GoalPacingAnalysis } from './goalVelocityEngine';
import type { NovoScore } from './scoreEngine';
import type { DailyBriefing } from './briefingEngine';
import type { WeeklyReview } from './weeklyReviewEngine';
import type { DailyGoalAlignmentResult } from './goalEngine';

// 12. Canonical WorkspaceSnapshot (Input Boundary)
export interface WorkspaceSnapshot {
  readonly capturedAt: string;
  readonly date: string;
  readonly tasks: Task[];
  readonly goals: Goal[];
  readonly notes: Note[];
  readonly knowledgeItems: KnowledgeItem[];
  readonly transactions: Transaction[];
  readonly sessions: FocusSession[];
  readonly conversations?: Conversation[];
  readonly activeFocusState?: ActiveFocusState | null;
  readonly activeConversationId?: string | null;
}

// 13. Canonical IntelligenceSnapshot (Output Boundary)
export interface IntelligenceSnapshot {
  readonly evaluatedAt: string;
  readonly snapshot: WorkspaceSnapshot;
  readonly productivity: ProductivitySummary;
  readonly goalHealth: GoalHealthResult;
  readonly dailyGoalAlignment: DailyGoalAlignmentResult;
  readonly focus: FocusSummary;
  readonly finance: FinanceSummary;
  readonly knowledge: KnowledgeSummary;
  readonly score: NovoScore;
  readonly insights: Insight[];
  readonly briefing: DailyBriefing;
  readonly weeklyReview: WeeklyReview;
  readonly nextAction: NextActionResult;
  readonly attentionRadar: AttentionRadarResult;
  readonly goalPacing: GoalPacingAnalysis[];
  readonly activityTimeline: ActivityItem[];
}

// 8. Daily Overview
export interface DailyOverview {
  date: string;
  taskSummary: ProductivitySummary;
  goalSummary: GoalHealthResult;
  focusSummary: FocusSummary;
  financeSummary: FinanceSummary;
  knowledgeSummary: KnowledgeSummary;
  productivityScore: number;
  topInsights: Insight[];
  recentActivity: ActivityEvent[];
}

// 10. NOVO Context (Unified Local Intelligence State)
export interface NOVOContext {
  generatedAt: string;
  date: string;
  todayTasks: Task[];
  completedTasks: Task[];
  overdueTasks: Task[];
  activeGoals: Goal[];
  notesCount: number;
  recentNotes: Note[];
  recentKnowledge: KnowledgeItem[];
  focusSessions: FocusSession[];
  focusStats: FocusSummary;
  moneySummary: FinanceSummary;
  tasks: Task[];
  goals: Goal[];
  focusSummary: FocusSummary;
  financeSummary: FinanceSummary;
  knowledgeSummary: KnowledgeSummary;
  productivitySummary: ProductivitySummary;
  goalHealth: GoalHealthResult;
  productivityScore: number;
  recentActivity: ActivityEvent[];
  insights: Insight[];
  conversations?: Conversation[];
  activeFocusState?: ActiveFocusState | null;
  activeConversationId?: string | null;
  briefing?: DailyBriefing;
  nextAction?: NextActionResult;
  attentionRadar?: AttentionRadarResult;
  goalPacing?: GoalPacingAnalysis[];
}

// 11. Unified NOVO Summary
export interface NOVOSummary {
  productivityScore: number;
  tasksSummary: ProductivitySummary;
  goalsSummary: GoalHealthResult;
  focusSummary: FocusSummary;
  notesSummary: KnowledgeSummary;
  financialSummary: FinanceSummary;
}
