import {
  Task,
  Goal,
  Note,
  FocusSession,
  Transaction,
  KnowledgeItem,
} from '../../types/data';

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
