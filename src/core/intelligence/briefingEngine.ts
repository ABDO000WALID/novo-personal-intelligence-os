import {
  ProductivitySummary,
  GoalHealthResult,
  FocusSummary,
  FinanceSummary,
  KnowledgeSummary,
} from './intelligenceTypes';
import { DailyGoalAlignmentResult } from './goalEngine';

export interface DailyBriefingTaskStats {
  remainingImportant: number;
  completedToday: number;
  totalToday: number;
  pendingCount: number;
}

export interface DailyBriefingGoalStats {
  activeCount: number;
  averageProgress: number;
}

export interface DailyBriefingFocusStats {
  todayMinutes: number;
  weeklyMinutes: number;
  completedSessions: number;
}

export interface DailyBriefingMoneyStats {
  balance: number;
  recentExpenses: number;
}

export interface DailyBriefing {
  greeting: string;
  greetingAr: string;
  summary: string;
  summaryAr: string;
  taskStats: DailyBriefingTaskStats;
  goalStats: DailyBriefingGoalStats;
  focusStats: DailyBriefingFocusStats;
  moneyStats: DailyBriefingMoneyStats;
  recommendation: string;
  recommendationAr: string;
  goalAlignment?: DailyGoalAlignmentResult;
}

export interface BriefingInputState {
  productivity: ProductivitySummary;
  goals: GoalHealthResult;
  focus: FocusSummary;
  finance: FinanceSummary;
  knowledge: KnowledgeSummary;
  goalAlignment?: DailyGoalAlignmentResult;
}

/**
 * Generates local time-aware greeting
 */
export function getTimeGreeting(now: Date = new Date()): { greeting: string; greetingAr: string } {
  const hour = now.getHours();

  if (hour >= 5 && hour < 12) {
    return { greeting: 'Good morning', greetingAr: 'صباح الخير' };
  } else if (hour >= 12 && hour < 17) {
    return { greeting: 'Good afternoon', greetingAr: 'مساء الخير' };
  } else {
    return { greeting: 'Good evening', greetingAr: 'مساء الخير' };
  }
}

/**
 * Deterministic Daily Briefing Engine
 * Synthesizes cross-module workspace data into NOVO's signature morning/daily briefing.
 * Pure function, zero external network or AI API dependencies.
 */
export function generateDailyBriefing(
  state: BriefingInputState,
  now: Date = new Date()
): DailyBriefing {
  const productivity = state?.productivity || {
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    todayTasks: 0,
    todayCompletedTasks: 0,
    completionPercentage: 0,
    highPriorityPendingCount: 0,
    overdueTasksCount: 0,
    recentCompletionRate: 0,
  };
  const goals = state?.goals || {
    totalGoals: 0,
    completedGoals: 0,
    activeGoals: 0,
    averageProgress: 0,
    goalsBelow25: 0,
    goalsAbove75: 0,
    recentlyUpdatedGoals: 0,
    healthStatus: 'good',
  };
  const focus = state?.focus || {
    totalFocusMinutes: 0,
    todayFocusMinutes: 0,
    weeklyFocusMinutes: 0,
    totalSessions: 0,
    averageSessionMinutes: 0,
    longestStreakDays: 0,
  };
  const finance = state?.finance || {
    currentBalance: 0,
    recentIncome: 0,
    recentExpenses: 0,
    recentSpending: 0,
    expenseRatio: 0,
    transactionCount: 0,
    savingsRate: 0,
    topCategory: null,
  };
  const knowledge = state?.knowledge || {
    totalNotes: 0,
    recentlyCreatedNotes: 0,
    recentlyUpdatedNotes: 0,
    notesCreatedThisWeek: 0,
    latestActivity: null,
    totalKnowledgeItems: 0,
  };

  const { greeting, greetingAr } = getTimeGreeting(now);

  const taskStats: DailyBriefingTaskStats = {
    remainingImportant: productivity.highPriorityPendingCount,
    completedToday: productivity.todayCompletedTasks,
    totalToday: productivity.todayTasks,
    pendingCount: productivity.pendingTasks,
  };

  const goalStats: DailyBriefingGoalStats = {
    activeCount: goals.activeGoals,
    averageProgress: goals.averageProgress,
  };

  const focusStats: DailyBriefingFocusStats = {
    todayMinutes: focus.todayFocusMinutes,
    weeklyMinutes: focus.weeklyFocusMinutes,
    completedSessions: focus.totalSessions,
  };

  const moneyStats: DailyBriefingMoneyStats = {
    balance: finance.currentBalance,
    recentExpenses: finance.recentSpending,
  };

  // Check if workspace is empty
  const isBrandNew =
    productivity.totalTasks === 0 &&
    goals.totalGoals === 0 &&
    knowledge.totalNotes === 0;

  if (isBrandNew) {
    return {
      greeting,
      greetingAr,
      summary: 'Start building your workspace by adding your first task or goal.',
      summaryAr: 'ابدأ ببناء مساحة عملك بإضافة مهمتك أو هدفك الأول.',
      taskStats,
      goalStats,
      focusStats,
      moneyStats,
      recommendation: 'Create your first goal or plan today’s agenda in the Planner.',
      recommendationAr: 'أنشئ هدفك الأول أو حدد مهام اليوم في المخطط لبدء بناء زخمك.',
      goalAlignment: state?.goalAlignment,
    };
  }

  // Determine Summary text
  let summary = '';
  let summaryAr = '';

  if (productivity.todayTasks > 0 && productivity.todayCompletedTasks === productivity.todayTasks) {
    summary = `All ${productivity.todayTasks} of today’s tasks are completed. You have excellent momentum.`;
    summaryAr = `تم إنجاز كافة مهام اليوم الـ ${productivity.todayTasks}. أنت في قمة الزخم الإيجابي.`;
  } else if (productivity.todayTasks > 0) {
    const remaining = productivity.todayTasks - productivity.todayCompletedTasks;
    summary = `${remaining} task${remaining > 1 ? 's' : ''} scheduled for today (${productivity.todayCompletedTasks} completed so far).`;
    summaryAr = `لديك ${remaining} مهام متبقية لليوم (${productivity.todayCompletedTasks} منجزة حتى الآن).`;
  } else if (productivity.pendingTasks > 0) {
    summary = `You have ${productivity.pendingTasks} pending tasks in your planner and ${goals.activeGoals} active goals.`;
    summaryAr = `لديك ${productivity.pendingTasks} مهام بانتظار التنفيذ في المخطط و ${goals.activeGoals} أهداف نشطة.`;
  } else {
    summary = `Your agenda is currently clear across ${goals.activeGoals} active goals.`;
    summaryAr = `جدول أعمالك هادئ ومستقر مع متابعة ${goals.activeGoals} أهداف نشطة.`;
  }

  // Determine Local Intelligent Recommendation
  let recommendation = '';
  let recommendationAr = '';

  if (productivity.overdueTasksCount > 0) {
    recommendation = `You have ${productivity.overdueTasksCount} overdue task${productivity.overdueTasksCount > 1 ? 's' : ''} that need review. Consider addressing them first.`;
    recommendationAr = `لديك ${productivity.overdueTasksCount} مهام متأخرة تحتاج للمراجعة. ابدأ بمعالجتها أولاً لإزالة العوائق.`;
  } else if (productivity.highPriorityPendingCount > 0) {
    recommendation = 'Your highest priority task is still incomplete. Consider starting there.';
    recommendationAr = 'مهمتك ذات الأولوية القصوى لم تكتمل بعد. فكّر في البدء بها لضمان أعلى أثر.';
  } else if (focus.todayFocusMinutes === 0 && productivity.pendingTasks > 0) {
    recommendation = 'Starting a 25-minute focus session will unlock deep momentum on today’s agenda.';
    recommendationAr = 'جلسة تركيز واحدة لـ 25 دقيقة ستمنحك انطلاقة قوية لإنجاز مهامك اليوم.';
  } else if (goals.healthStatus === 'at_risk' && goals.totalGoals > 0) {
    recommendation = 'Some active goals have stagnant progress. Review milestone checkpoints.';
    recommendationAr = 'بعض الأهداف تشهد تباطؤاً في الإنجاز. راجع الخطوات المرحلية القادمة.';
  } else if (productivity.todayCompletedTasks > 0) {
    recommendation = 'Great consistency today. Maintain steady focus and take brief reflective breaks.';
    recommendationAr = 'استمرارية ممتازة اليوم. حافظ على تركيزك المتزن وخذ استراحات تأملية قصيرة.';
  } else {
    recommendation = 'Review your daily priorities and commit to a single high-impact action.';
    recommendationAr = 'راجع أولويات يومك وحدد خطوة تنفيذية واحدة ذات أثر ملموس لتبدأ بها.';
  }

  return {
    greeting,
    greetingAr,
    summary,
    summaryAr,
    taskStats,
    goalStats,
    focusStats,
    moneyStats,
    recommendation,
    recommendationAr,
    goalAlignment: state?.goalAlignment,
  };
}
