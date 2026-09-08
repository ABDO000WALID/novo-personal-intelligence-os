import {
  ProductivitySummary,
  GoalHealthResult,
  FocusSummary,
  FinanceSummary,
  KnowledgeSummary,
  Insight,
  InsightCategory,
  InsightPriority,
} from './intelligenceTypes';

export type { Insight, InsightCategory, InsightPriority };

export interface EngineInputState {
  productivity: ProductivitySummary;
  goals: GoalHealthResult;
  focus: FocusSummary;
  finance: FinanceSummary;
  knowledge: KnowledgeSummary;
}

/**
 * Deterministic Rule-Based Smart Insight Engine
 * Analyzes local user data without any external AI API.
 * Returns 2–3 grounded, actionable insights based on real user state.
 * Arabic is the primary language, with English localization support.
 */
export function generateSmartInsights(
  state: EngineInputState,
  now: Date = new Date()
): Insight[] {
  const candidateInsights: Insight[] = [];
  const createdAt = now.toISOString();

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
    healthStatus: 'good' as const,
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
    totalIncome: 0,
    totalExpenses: 0,
    currentBalance: 0,
    recentSpending: 0,
    expensesByCategory: [],
    largestExpenseCategory: null,
    recentTransactionCount: 0,
  };
  const knowledge = state?.knowledge || {
    totalNotes: 0,
    recentlyCreatedNotes: 0,
    recentlyUpdatedNotes: 0,
    notesCreatedThisWeek: 0,
    latestActivity: null,
    totalKnowledgeItems: 0,
  };

  // 1. Detect Empty Workspace
  const isWorkspaceEmpty =
    (productivity.totalTasks || 0) === 0 &&
    (goals.totalGoals || 0) === 0 &&
    (knowledge.totalNotes || 0) === 0;

  if (isWorkspaceEmpty) {
    candidateInsights.push({
      id: 'ins-empty-workspace',
      type: 'information',
      priority: 'medium',
      title: 'Welcome to NOVO',
      titleAr: 'مرحباً بك في NOVO',
      description: 'Start by creating a goal or planning your day.',
      descriptionAr: 'ابدأ بإنشاء هدف أو تخطيط مهام يومك في جدول المخطط.',
      actionLabel: 'Plan Your Day',
      actionLabelAr: 'خطط ليومك',
      module: 'planner',
      relatedModule: 'planner',
      createdAt,
    });
    return candidateInsights;
  }

  // 2. Detect Overdue Tasks (High Priority)
  if (productivity.overdueTasksCount > 0) {
    candidateInsights.push({
      id: 'ins-overdue-tasks',
      type: 'warning',
      priority: 'high',
      title: 'Overdue Tasks',
      titleAr: 'مهام متأخرة تحتاج للمراجعة',
      description: `You have ${productivity.overdueTasksCount} overdue tasks that need review.`,
      descriptionAr: `لديك ${productivity.overdueTasksCount} مهام متأخرة تحتاج للمراجعة وإعادة الجدولة.`,
      actionLabel: 'Reschedule Tasks',
      actionLabelAr: 'مراجعة المهام',
      module: 'planner',
      relatedModule: 'planner',
      createdAt,
    });
  }

  // 3. Detect High Task Load Today
  if (productivity.todayTasks >= 5 && productivity.pendingTasks >= 4) {
    candidateInsights.push({
      id: 'ins-high-task-load',
      type: 'warning',
      priority: 'high',
      title: 'High Task Load Today',
      titleAr: 'ضغط مهام مرتفع لليوم',
      description: `You have ${productivity.todayTasks} tasks scheduled today. Prioritize the top 3 items to avoid burnout.`,
      descriptionAr: `لديك ${productivity.todayTasks} مهام مجدولة لليوم. ركّز على أهم 3 أولويات لإنجاز هادئ وفعّال.`,
      actionLabel: 'Review Tasks',
      actionLabelAr: 'ترتيب الأولويات',
      module: 'planner',
      relatedModule: 'planner',
      createdAt,
    });
  }

  // 4. Detect Empty Planner (No tasks scheduled for today, but pending backlog exists)
  if (productivity.todayTasks === 0 && productivity.pendingTasks > 0) {
    candidateInsights.push({
      id: 'ins-empty-planner',
      type: 'suggestion',
      priority: 'medium',
      title: 'Empty Planner for Today',
      titleAr: 'جدول مهام اليوم فارغ',
      description: 'Your agenda for today is empty. Select 2-3 key tasks to focus your execution.',
      descriptionAr: 'جدول مهام اليوم فارغ. حدد أولوياتك ووزع مهامك لبدء يوم منظم.',
      actionLabel: 'Plan Today',
      actionLabelAr: 'تخطيط اليوم',
      module: 'planner',
      relatedModule: 'planner',
      createdAt,
    });
  }

  // 5. Detect Goals with No Recent Updates / Inactive Goals
  if (goals.activeGoals > 0 && goals.recentlyUpdatedGoals === 0) {
    candidateInsights.push({
      id: 'ins-goals-stagnant',
      type: 'suggestion',
      priority: 'medium',
      title: 'Goals Need Attention',
      titleAr: 'أهداف بحاجة إلى تنشيط وتحديث',
      description: 'None of your active goals were updated recently. Break them into smaller milestones.',
      descriptionAr: 'لم تسجل أي تقدم في أهدافك النشطة مؤخراً. قسّمها إلى معالم أصغر لإعادة الزخم.',
      actionLabel: 'Update Goals',
      actionLabelAr: 'تحديث مسار الأهداف',
      module: 'goals',
      relatedModule: 'goals',
      createdAt,
    });
  } else if (goals.healthStatus === 'at_risk' && goals.goalsBelow25 > 0) {
    candidateInsights.push({
      id: 'ins-goals-at-risk',
      type: 'warning',
      priority: 'medium',
      title: 'Inactive Goals',
      titleAr: 'أهداف متوقفة عن التقدم',
      description: 'Some goals have made less than 25% progress. Review and adjust your roadmap.',
      descriptionAr: 'لديك أهداف ما تزال نسبة تقدمها أقل من 25%. راجع استراتيجيتها وجدد خطتها.',
      actionLabel: 'Review Roadmap',
      actionLabelAr: 'مراجعة الأهداف',
      module: 'goals',
      relatedModule: 'goals',
      createdAt,
    });
  }

  // 6. Detect Low Focus Activity (No focus session recently)
  if (focus.todayFocusMinutes === 0 && focus.weeklyFocusMinutes < 25) {
    candidateInsights.push({
      id: 'ins-low-focus',
      type: 'suggestion',
      priority: 'medium',
      title: 'Low Focus Activity',
      titleAr: 'استمرارية جلسات التركيز',
      description: 'No focus sessions completed recently. A 25-minute deep focus block builds momentum.',
      descriptionAr: 'لم تسجل جلسة تركيز خلال آخر 3 أيام. ابدأ جلسة 25 دقيقة لبناء الزخم.',
      actionLabel: 'Start Focus',
      actionLabelAr: 'بدء جلسة تركيز',
      module: 'focus',
      relatedModule: 'focus',
      createdAt,
    });
  } else if (focus.todayFocusMinutes >= 45) {
    candidateInsights.push({
      id: 'ins-focus-success',
      type: 'success',
      priority: 'low',
      title: 'Deep Focus Flow',
      titleAr: 'تدفق ذهني وتركيز ممتاز اليوم',
      description: `You logged ${focus.todayFocusMinutes} minutes of focused work today. Keep the calm cadence!`,
      descriptionAr: `أنجزت ${focus.todayFocusMinutes} دقيقة من التركيز العميق اليوم. حافظ على هذا الإيقاع الرائع!`,
      actionLabel: 'Focus Dashboard',
      actionLabelAr: 'سجل التركيز',
      module: 'focus',
      relatedModule: 'focus',
      createdAt,
    });
  }

  // 7. Detect Recent Productivity Streak / High Completion
  if (productivity.todayTasks > 0 && productivity.completionPercentage >= 70) {
    candidateInsights.push({
      id: 'ins-productivity-streak',
      type: 'success',
      priority: 'low',
      title: 'Productivity Streak',
      titleAr: 'زخم إنتاجية متميز',
      description: `You completed ${Math.round(productivity.completionPercentage)}% of today's tasks! Outstanding momentum.`,
      descriptionAr: `أكملت ${Math.round(productivity.completionPercentage)}% من مهام اليوم. استمر في هذا الإنجاز المتزن!`,
      actionLabel: 'View Progress',
      actionLabelAr: 'عرض المهام',
      module: 'planner',
      relatedModule: 'planner',
      createdAt,
    });
  }

  // 8. Detect Spending Dominance (Expenses higher than income)
  if (finance.totalExpenses > finance.totalIncome && finance.totalExpenses > 0) {
    candidateInsights.push({
      id: 'ins-spending-dominance',
      type: 'warning',
      priority: 'high',
      title: 'Spending Dominance',
      titleAr: 'تنبيه التدفق المالي',
      description: 'Your expenses currently exceed recorded income. Monitor discretionary spending.',
      descriptionAr: 'مصروفاتك تتجاوز إيراداتك المسجلة حالياً. راقب بنود الصرف غير الأساسية.',
      actionLabel: 'Review Money',
      actionLabelAr: 'مراجعة المصاريف',
      module: 'money',
      relatedModule: 'money',
      createdAt,
    });
  }

  // 9. Knowledge capture reminder
  if (knowledge.totalNotes > 0 && knowledge.recentlyCreatedNotes === 0 && knowledge.recentlyUpdatedNotes === 0) {
    candidateInsights.push({
      id: 'ins-knowledge-cadence',
      type: 'information',
      priority: 'low',
      title: 'Document Key Learnings',
      titleAr: 'توثيق الأفكار والتعلم',
      description: 'Capture recent insights, reading takeaways, or project learnings in your knowledge vault.',
      descriptionAr: 'دوّن ملخصاتك وتجاربك الجديدة في مساحة المعرفة للحفاظ على حداثة ذاكرة NOVO.',
      actionLabel: 'Open Notes',
      actionLabelAr: 'فتح الملاحظات',
      module: 'notes',
      relatedModule: 'notes',
      createdAt,
    });
  }

  // Priority weight: high (3) > medium (2) > low (1)
  const priorityWeight: Record<InsightPriority, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };

  candidateInsights.sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);

  // Return top 2–3 important insights
  return candidateInsights.slice(0, 3);
}
