import { NOVOContext } from './intelligenceTypes';

export interface AIContextBuilderOptions {
  userIntent?: string;
}

export function buildAIGroundedContext(
  context: NOVOContext,
  options: AIContextBuilderOptions = {}
): string {
  const sections: string[] = [];

  // Header & Score
  sections.push(
    `# NOVO Workspace Context Snapshot\n- Date: ${context.date}\n- Generated: ${context.generatedAt}\n- NOVO Velocity Score: ${context.productivityScore}/100`
  );

  // 1. Planner & Tasks
  const pendingTasks = context.tasks.filter(t => !t.completed);
  const highPriority = pendingTasks.filter(t => t.priority === 'high');
  
  const criticalTasks = Array.from(new Set([
    ...context.overdueTasks,
    ...highPriority,
    ...context.todayTasks.filter(t => !t.completed)
  ])).slice(0, 30);

  const taskLines =
    criticalTasks.length > 0
      ? criticalTasks
          .map((t) => {
            let goalTag = '';
            if (t.goalId) {
              const matchedGoal = (context.goals || []).find((g) => g && g.id === t.goalId);
              if (matchedGoal && matchedGoal.title) {
                goalTag = ` [Supports Goal: "${matchedGoal.title}"]`;
              }
            }
            return `  * [${t.completed ? 'x' : ' '}] ${t.title} (${t.priority} priority)${context.overdueTasks.includes(t) ? ' [OVERDUE]' : ''}${goalTag}`;
          })
          .join('\n')
      : (context.tasks.length === 0 ? '  * INSUFFICIENT DATA: No tasks exist in the database.' : '  * No pending critical tasks.');

  sections.push(
    `## Daily Planner\n- Total Tasks: ${context.tasks.length}\n- Completed: ${context.completedTasks.length}\n- Pending: ${pendingTasks.length}\n- High Priority Pending: ${highPriority.length}\n- Overdue: ${context.overdueTasks.length}\n\nCritical/Active Tasks List:\n${taskLines}`
  );

  // 2. Active Goals
  const active = context.activeGoals.slice(0, 15);
  const goalLines =
    active.length > 0
      ? active.map((g) => `  * ${g.title}: ${g.progress}% progress`).join('\n')
      : (context.goals.length === 0 ? '  * INSUFFICIENT DATA: No goals exist in the database.' : '  * No active goals');

  sections.push(
    `## Goals (${context.goals.length} total, ${context.activeGoals.length} active)\n${goalLines}`
  );

  // 3. Focus Metrics
  sections.push(
    `## Focus & Deep Work\n- Today's Focus: ${context.focusStats.todayFocusMinutes} minutes\n- Weekly Focus: ${context.focusStats.weeklyFocusMinutes} minutes\n- Total Sessions: ${context.focusStats.totalSessions}`
  );

  // 4. Financial Status
  sections.push(
    `## Finances & Budget\n- Balance: $${context.moneySummary.currentBalance.toLocaleString()}\n- Recent Spending (7d): $${context.moneySummary.recentSpending.toLocaleString()}`
  );

  // 5. Knowledge & Notes
  const notesList = context.recentNotes.slice(0, 10);
  const knowledgeList = context.recentKnowledge ? context.recentKnowledge.slice(0, 5) : [];

  const noteLines =
    notesList.length > 0
      ? notesList.map((n) => `  * ${n.title}`).join('\n')
      : '  * INSUFFICIENT DATA: No notes exist in the database.';
      
  const knowledgeLines =
    knowledgeList.length > 0
      ? knowledgeList.map((k) => `  * [${k.category.toUpperCase()}] ${k.title}`).join('\n')
      : '  * INSUFFICIENT DATA: No curated knowledge items.';
      
  sections.push(
    `## Knowledge Vault & Notes\n- Total Notes: ${context.notesCount}\n\nRecent Notes:\n${noteLines}\n\nRecent Curated Knowledge:\n${knowledgeLines}`
  );

  // 6. Active Insights
  if (context.insights.length > 0) {
    const insightLines = context.insights
      .slice(0, 5)
      .map((ins) => `  * [${ins.priority.toUpperCase()}] ${ins.title}: ${ins.description}`)
      .join('\n');
    sections.push(`## Active Insights\n${insightLines}`);
  }

  // 7. Recommended Next Action (Gate 20-C / 21 Parity)
  if (context.nextAction) {
    const na = context.nextAction;
    let naDesc = 'None';
    if (na.type === 'existing_task') {
      naDesc = `Existing task "${na.selectedTask.title}" (${na.selectedTask.priority} priority${na.tier === 1 ? ', OVERDUE' : ''})`;
    } else if (na.type === 'new_task_required') {
      naDesc = `New task required for goal "${na.selectedGoal.title}" (${na.selectedGoal.progress}% progress)`;
    } else if (na.type === 'all_clear') {
      naDesc = 'All clear (no pending critical actions)';
    }
    sections.push(`## Recommended Next Action\n- Type: ${na.type}\n- Action: ${naDesc}`);
  }

  // 8. Attention Radar (Gate 20-C / 21 Parity)
  if (context.attentionRadar) {
    const ar = context.attentionRadar;
    let arDesc = 'Workspace in equilibrium';
    if (ar.type === 'overdue_task') {
      arDesc = `Overdue task: "${ar.selectedTaskTitle}" (${ar.daysOverdue} days overdue, ${ar.taskPriority} priority)`;
    } else if (ar.type === 'stalled_goal') {
      arDesc = `Stalled goal: "${ar.selectedGoalTitle}" (${ar.daysInactive} days inactive, ${ar.currentProgress}% progress)`;
    } else if (ar.type === 'urgent_today_task') {
      arDesc = `High priority task today: "${ar.selectedTaskTitle}"`;
    } else if (ar.type === 'focus_deficit') {
      arDesc = `Focus deficit: ${ar.pendingTasksTodayCount} pending tasks with only ${ar.todayFocusMinutes}m focus logged`;
    }
    sections.push(`## Attention Radar\n- Alert Type: ${ar.type}\n- Detail: ${arDesc}`);
  }

  // 9. Goal Pacing & Velocity (Gate 20-C / 21 Parity)
  if (context.goalPacing && context.goalPacing.length > 0) {
    const pacingLines = context.goalPacing
      .slice(0, 10)
      .map(
        (p) =>
          `  * ${p.goalTitle}: ${p.activityState} (Lifetime Pace: ${p.lifetimePace}%/d, Exec Ratio: ${p.executionCompletionRatio}%, Focus: ${p.focusMinutes}m)`
      )
      .join('\n');
    sections.push(`## Goal Pacing & Velocity\n${pacingLines}`);
  }

  return sections.join('\n\n');
}

export function buildAISystemContext(context: NOVOContext, userIntent?: string): string {
  const groundedContext = buildAIGroundedContext(context, { userIntent });
  return `You are NOVO, an executive personal intelligence operating system.
You provide thoughtful, concise, and structured guidance in Arabic or English based on the user's current state.

CRITICAL INSTRUCTION:
- You must ONLY use the data provided in the "Current User Workspace State" section below.
- Do NOT fabricate, assume, or make up placeholder statistics (e.g. do not invent numbers for tasks, balances, or goals).
- If a section says "INSUFFICIENT DATA" or has 0 items, you MUST explicitly tell the user that there is no data available for that metric, and encourage them to add some.

Current User Workspace State:
${groundedContext}`;
}

export function formatContextSummaryAr(context: NOVOContext): string {
  const parts: string[] = [
    `مؤشر أداء NOVO: ${context.productivityScore}/100`,
    `مهام اليوم: ${context.todayTasks.length} (المكتملة: ${context.completedTasks.length})`,
    `الأهداف النشطة: ${context.activeGoals.length}`,
    `دقائق التركيز اليوم: ${context.focusStats.todayFocusMinutes} دقيقة`,
    `رصيد المحفظة: $${context.moneySummary.currentBalance.toLocaleString()}`,
  ];
  return parts.join(' | ');
}

export {
  buildNOVOContext,
  getNOVOContext,
  getNOVOSummary,
  type ContextSourceData,
} from './contextEngine';
