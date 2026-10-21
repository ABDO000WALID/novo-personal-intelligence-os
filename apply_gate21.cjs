/**
 * NOVO Gate 21 Application Script
 * Applies Intelligence Runtime Integration & Consumer Convergence to:
 * - src/modules/goals/GoalsView.tsx
 * - src/core/commands/commandParser.ts
 * - src/core/ai/aiOrchestrator.ts
 * - src/core/intelligence/contextBuilder.ts
 * - test_gate21_runtime_integration.ts
 *
 * Usage: node apply_gate21.cjs
 */
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('Applying NOVO Gate 21 Runtime Convergence');
console.log('====================================================');

// 1. Update src/modules/goals/GoalsView.tsx
const goalsViewPath = path.join(process.cwd(), 'src/modules/goals/GoalsView.tsx');
if (fs.existsSync(goalsViewPath)) {
  let gv = fs.readFileSync(goalsViewPath, 'utf8');

  // Ensure import of useIntelligence
  if (!gv.includes('useIntelligence')) {
    gv = gv.replace(
      /import\s*\{[^}]*\}\s*from\s*['"]\.\.\/\.\.\/core\/intelligence['"];?/,
      "import { useIntelligence } from '../../core/intelligence';"
    );
    if (!gv.includes('useIntelligence')) {
      gv = gv.replace(
        /(import\s*\{[^}]*\}\s*from\s*['"]\.\.\/\.\.\/core\/state\/focusStore['"];?)/,
        "$1\nimport { useIntelligence } from '../../core/intelligence';"
      );
    }
  }

  // Ensure hook invocation
  if (!gv.includes('const { goalPacing } = useIntelligence();')) {
    gv = gv.replace(
      /(export function GoalsView\(\)\s*\{)/,
      "$1\n  const { goalPacing } = useIntelligence();"
    );
  }

  // Replace calculateGoalPacing call inside map
  if (!gv.includes('goalPacing.find')) {
    const oldPacingPattern = /const\s+pacing\s*=\s*calculateGoalPacing\(goal,\s*tasks,\s*focusSessions,\s*new\s+Date\(\)\);\s*const\s+activity\s*=\\s*getGoalTaskActivity\(goal\.id,\s*tasks\);/;
    if (oldPacingPattern.test(gv)) {
      gv = gv.replace(
        oldPacingPattern,
        "const pacing = goalPacing.find((p) => p.goalId === goal.id);\n            const activity = {\n              total: pacing?.linkedTaskCount ?? 0,\n              completed: pacing?.completedLinkedTaskCount ?? 0,\n            };"
      );
    } else {
      gv = gv.replace(
        /(const\s+isCompleted\s*=\s*goal\.progress\s*>=\s*100;)/,
        "$1\n            const pacing = goalPacing.find((p) => p.goalId === goal.id);\n            const activity = {\n              total: pacing?.linkedTaskCount ?? 0,\n              completed: pacing?.completedLinkedTaskCount ?? 0,\n            };"
      );
    }
  }

  fs.writeFileSync(goalsViewPath, gv, 'utf8');
  console.log('✓ Updated src/modules/goals/GoalsView.tsx');
} else {
  console.warn('! File not found: src/modules/goals/GoalsView.tsx');
}

// 2. Update src/core/commands/commandParser.ts
const cmdParserPath = path.join(process.cwd(), 'src/core/commands/commandParser.ts');
if (fs.existsSync(cmdParserPath)) {
  let cp = fs.readFileSync(cmdParserPath, 'utf8');

  // Ensure NOVOContext import
  if (!cp.includes('NOVOContext')) {
    cp = cp.replace(
      /from\s*['"]\.\/commandTypes['"];/,
      "from './commandTypes';\nimport { NOVOContext } from '../intelligence/intelligenceTypes';"
    );
  }

  // Update parseCommand signature
  if (!cp.includes('context?: NOVOContext')) {
    cp = cp.replace(
      /export function parseCommand\(\s*input:\s*string,\s*availableGoals\?:\s*Goal\[\],\s*availableTasks\?:\s*Task\[\],\s*targetDate\?:\s*string\s*\|\s*Date\s*\):\s*CommandParseResult/,
      "export function parseCommand(\n  input: string,\n  availableGoals?: Goal[],\n  availableTasks?: Task[],\n  targetDate?: string | Date,\n  context?: NOVOContext\n): CommandParseResult"
    );
  }

  // Update Daily Briefing trigger block
  if (!cp.includes('if (context?.briefing) {')) {
    const oldBriefingSnippet = /const\s+productivity\s*=\s*analyzeProductivity\(safeTasks,\s*now\);[\s\S]*?briefing\s*=\\s*generateDailyBriefing\([\s\S]*?\);/;
    if (oldBriefingSnippet.test(cp)) {
      cp = cp.replace(
        oldBriefingSnippet,
        "let briefing: DailyBriefing;\n    let alignment: any;\n    if (context?.briefing) {\n      briefing = context.briefing;\n      alignment = context.briefing.goalAlignment ?? analyzeDailyGoalAlignment(safeTasks, safeGoals, now);\n    } else {\n      const productivity = context?.productivitySummary || analyzeProductivity(safeTasks, now);\n      const goalHealth = context?.goalHealth || analyzeGoals(safeGoals, now);\n      const focus = context?.focusSummary || context?.focusStats || analyzeFocus(context?.focusSessions || [], now);\n      const finance = context?.financeSummary || context?.moneySummary || analyzeFinance([], now);\n      const knowledge = context?.knowledgeSummary || analyzeNotesAndKnowledge(context?.recentNotes || [], context?.recentKnowledge || [], now);\n      alignment = analyzeDailyGoalAlignment(safeTasks, safeGoals, now);\n      briefing = generateDailyBriefing(\n        {\n          productivity,\n          goals: goalHealth,\n          focus,\n          finance,\n          knowledge,\n          goalAlignment: alignment,\n        },\n        now\n      );\n    }"
      );
    }
  }

  // Update Next Action trigger block
  if (!cp.includes('context?.nextAction')) {
    cp = cp.replace(
      /const\s+nextActionResult\s*=\\s*determineNextAction\(safeTasks,\s*safeGoals,\s*today\);/,
      "const nextActionResult = context?.nextAction ?? determineNextAction(safeTasks, safeGoals, today);"
    );
  }

  // Update Attention Radar trigger block
  if (!cp.includes('context?.attentionRadar')) {
    cp = cp.replace(
      /const\s+radarResult\s*=\\s*evaluateAttentionRadar\(\\{[\s\S]*?\\}\);/,
      "const radarResult = context?.attentionRadar ?? evaluateAttentionRadar({\n      tasks: safeTasks,\n      goals: safeGoals,\n      focusSessions: context?.focusSessions || [],\n      todayFocusMinutes: context?.focusStats?.todayFocusMinutes,\n      todayStr: today,\n    });"
    );
  }

  // Update Single Goal Pacing block
  if (!cp.includes('context?.goalPacing?.find')) {
    cp = cp.replace(
      /const\s+analysis\s*=\\s*calculateGoalPacing\(resolution\\.goal,\s*safeTasks,\s*\[\],\s*now\);/,
      "const existingAnalysis = context?.goalPacing?.find((p) => p.goalId === resolution.goal!.id);\n      const analysis = existingAnalysis ?? calculateGoalPacing(resolution.goal, safeTasks, context?.focusSessions || [], now);"
    );
  }

  // Update Portfolio Goal Pacing block
  if (!cp.includes('context?.goalPacing &&')) {
    cp = cp.replace(
      /const\s+analyses\s*=\\s*analyzeAllGoalsPacing\(activeGoals,\s*safeTasks,\s*\[\],\s*now\);/,
      "const analyses = (context?.goalPacing && context.goalPacing.length > 0)\n      ? context.goalPacing.filter((p) => activeGoals.some((g) => g.id === p.goalId))\n      : analyzeAllGoalsPacing(activeGoals, safeTasks, context?.focusSessions || [], now);"
    );
  }

  fs.writeFileSync(cmdParserPath, cp, 'utf8');
  console.log('✓ Updated src/core/commands/commandParser.ts');
} else {
  console.warn('! File not found: src/core/commands/commandParser.ts');
}

// 3. Update src/core/ai/aiOrchestrator.ts
const aiOrchPath = path.join(process.cwd(), 'src/core/ai/aiOrchestrator.ts');
if (fs.existsSync(aiOrchPath)) {
  let ao = fs.readFileSync(aiOrchPath, 'utf8');

  // Remove unused engine imports
  ao = ao.replace(/import\s*\{[^}]*generateDailyBriefing[^}]*\}\s*from\s*['"]\.\.\/intelligence\/briefingEngine['"];?\n?/, "");
  ao = ao.replace(/import\s*\{[^}]*determineNextAction[^}]*\}\s*from\s*['"]\.\.\/intelligence\/nextActionEngine['"];?\n?/, "");
  ao = ao.replace(/import\s*\{[^}]*evaluateAttentionRadar[^}]*\}\s*from\s*['"]\.\.\/intelligence\/attentionEngine['"];?\n?/, "");
  ao = ao.replace(/import\s*\{[^}]*calculateGoalPacing[^}]*\}\s*from\s*['"]\.\.\/intelligence\/goalVelocityEngine['"];?\n?/, "");

  // Update parseCommand call to pass request.context
  if (!ao.includes('request.context);')) {
    ao = ao.replace(
      /const\s+parseResult\s*=\\s*parseCommand\(trimmed,\s*availableGoals,\s*availableTasks\);/,
      "const parseResult = parseCommand(trimmed, availableGoals, availableTasks, undefined, request.context);"
    );
  }

  // In daily_briefing: consume canonical briefing
  if (!ao.includes('const canonicalBriefing = request.context?.briefing')) {
    ao = ao.replace(
      /(\/\/ If "Daily Briefing" command:[\s\S]*?let feedbackEn = parseResult\.command\.feedbackEn;)/,
      "$1\n        // Strictly consume canonical briefing from request.context or parsed payload\n        const canonicalBriefing = request.context?.briefing ?? payload.briefing;\n        if (canonicalBriefing) {\n          payload.briefing = canonicalBriefing;\n          feedbackAr = formatDailyBriefingFeedback(canonicalBriefing, 'ar');\n          feedbackEn = formatDailyBriefingFeedback(canonicalBriefing, 'en');\n        }"
    );
  }

  // In next_action: consume canonical nextAction
  if (!ao.includes('request.context?.nextAction')) {
    ao = ao.replace(
      /const\s+actionResult\s*=\\s*determineNextAction\(liveTasks,\s*liveGoals,\s*today\);/,
      "const actionResult = request.context?.nextAction ?? payload.nextActionResult;"
    );
  }

  // In attention_radar: consume canonical attentionRadar
  if (!ao.includes('const radarResult = request.context?.attentionRadar')) {
    ao = ao.replace(
      /const\s+radarResult\s*=\\s*evaluateAttentionRadar\(\\{[\s\S]*?\\}\);/,
      "const radarResult = request.context?.attentionRadar ?? payload.radarResult;\n        payload.radarResult = radarResult;"
    );
  }

  fs.writeFileSync(aiOrchPath, ao, 'utf8');
  console.log('✓ Updated src/core/ai/aiOrchestrator.ts');
} else {
  console.warn('! File not found: src/core/ai/aiOrchestrator.ts');
}

// 4. Update src/core/intelligence/contextBuilder.ts
const ctxBuilderPath = path.join(process.cwd(), 'src/core/intelligence/contextBuilder.ts');
const contextBuilderCode = `import { NOVOContext } from './intelligenceTypes';

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
    \`# NOVO Workspace Context Snapshot\\n- Date: \${context.date}\\n- Generated: \${context.generatedAt}\\n- NOVO Velocity Score: \${context.productivityScore}/100\`
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
                goalTag = \` [Supports Goal: "\${matchedGoal.title}"]\`;
              }
            }
            return \`  * [\${t.completed ? 'x' : ' '}] \${t.title} (\${t.priority} priority)\${context.overdueTasks.includes(t) ? ' [OVERDUE]' : ''}\${goalTag}\`;
          })
          .join('\\n')
      : (context.tasks.length === 0 ? '  * INSUFFICIENT DATA: No tasks exist in the database.' : '  * No pending critical tasks.');

  sections.push(
    \`## Daily Planner\\n- Total Tasks: \${context.tasks.length}\\n- Completed: \${context.completedTasks.length}\\n- Pending: \${pendingTasks.length}\\n- High Priority Pending: \${highPriority.length}\\n- Overdue: \${context.overdueTasks.length}\\n\\nCritical/Active Tasks List:\\n\${taskLines}\`
  );

  // 2. Active Goals
  const active = context.activeGoals.slice(0, 15);
  const goalLines =
    active.length > 0
      ? active.map((g) => \`  * \${g.title}: \${g.progress}% progress\`).join('\\n')
      : (context.goals.length === 0 ? '  * INSUFFICIENT DATA: No goals exist in the database.' : '  * No active goals');

  sections.push(
    \`## Goals (\${context.goals.length} total, \${context.activeGoals.length} active)\\n\${goalLines}\`
  );

  // 3. Focus Metrics
  sections.push(
    \`## Focus & Deep Work\\n- Today's Focus: \${context.focusStats.todayFocusMinutes} minutes\\n- Weekly Focus: \${context.focusStats.weeklyFocusMinutes} minutes\\n- Total Sessions: \${context.focusStats.totalSessions}\`
  );

  // 4. Financial Status
  sections.push(
    \`## Finances & Budget\\n- Balance: $\${context.moneySummary.currentBalance.toLocaleString()}\\n- Recent Spending (7d): $\${context.moneySummary.recentSpending.toLocaleString()}\`
  );

  // 5. Knowledge & Notes
  const notesList = context.recentNotes.slice(0, 10);
  const knowledgeList = context.recentKnowledge ? context.recentKnowledge.slice(0, 5) : [];

  const noteLines =
    notesList.length > 0
      ? notesList.map((n) => \`  * \${n.title}\`).join('\\n')
      : '  * INSUFFICIENT DATA: No notes exist in the database.';
      
  const knowledgeLines =
    knowledgeList.length > 0
      ? knowledgeList.map((k) => \`  * [\${k.category.toUpperCase()}] \${k.title}\`).join('\\n')
      : '  * INSUFFICIENT DATA: No curated knowledge items.';
      
  sections.push(
    \`## Knowledge Vault & Notes\\n- Total Notes: \${context.notesCount}\\n\\nRecent Notes:\\n\${noteLines}\\n\\nRecent Curated Knowledge:\\n\${knowledgeLines}\`
  );

  // 6. Active Insights
  if (context.insights.length > 0) {
    const insightLines = context.insights
      .slice(0, 5)
      .map((ins) => \`  * [\${ins.priority.toUpperCase()}] \${ins.title}: \${ins.description}\`)
      .join('\\n');
    sections.push(\`## Active Insights\\n\${insightLines}\`);
  }

  // 7. Recommended Next Action (Gate 20-C / 21 Parity)
  if (context.nextAction) {
    const na = context.nextAction;
    let naDesc = 'None';
    if (na.type === 'existing_task') {
      naDesc = \`Existing task "\${na.selectedTask.title}" (\${na.selectedTask.priority} priority\${na.tier === 1 ? ', OVERDUE' : ''})\`;
    } else if (na.type === 'new_task_required') {
      naDesc = \`New task required for goal "\${na.selectedGoal.title}" (\${na.selectedGoal.progress}% progress)\`;
    } else if (na.type === 'all_clear') {
      naDesc = 'All clear (no pending critical actions)';
    }
    sections.push(\`## Recommended Next Action\\n- Type: \${na.type}\\n- Action: \${naDesc}\`);
  }

  // 8. Attention Radar (Gate 20-C / 21 Parity)
  if (context.attentionRadar) {
    const ar = context.attentionRadar;
    let arDesc = 'Workspace in equilibrium';
    if (ar.type === 'overdue_task') {
      arDesc = \`Overdue task: "\${ar.selectedTaskTitle}" (\${ar.daysOverdue} days overdue, \${ar.taskPriority} priority)\`;
    } else if (ar.type === 'stalled_goal') {
      arDesc = \`Stalled goal: "\${ar.selectedGoalTitle}" (\${ar.daysInactive} days inactive, \${ar.currentProgress}% progress)\`;
    } else if (ar.type === 'urgent_today_task') {
      arDesc = \`High priority task today: "\${ar.selectedTaskTitle}"\`;
    } else if (ar.type === 'focus_deficit') {
      arDesc = \`Focus deficit: \${ar.pendingTasksTodayCount} pending tasks with only \${ar.todayFocusMinutes}m focus logged\`;
    }
    sections.push(\`## Attention Radar\\n- Alert Type: \${ar.type}\\n- Detail: \${arDesc}\`);
  }

  // 9. Goal Pacing & Velocity (Gate 20-C / 21 Parity)
  if (context.goalPacing && context.goalPacing.length > 0) {
    const pacingLines = context.goalPacing
      .slice(0, 10)
      .map(
        (p) =>
          \`  * \${p.goalTitle}: \${p.activityState} (Lifetime Pace: \${p.lifetimePace}%/d, Exec Ratio: \${p.executionCompletionRatio}%, Focus: \${p.focusMinutes}m)\`
      )
      .join('\\n');
    sections.push(\`## Goal Pacing & Velocity\\n\${pacingLines}\`);
  }

  return sections.join('\\n\\n');
}

export function buildAISystemContext(context: NOVOContext, userIntent?: string): string {
  const groundedContext = buildAIGroundedContext(context, { userIntent });
  return \`You are NOVO, an executive personal intelligence operating system.
You provide thoughtful, concise, and structured guidance in Arabic or English based on the user's current state.

CRITICAL INSTRUCTION:
- You must ONLY use the data provided in the "Current User Workspace State" section below.
- Do NOT fabricate, assume, or make up placeholder statistics (e.g. do not invent numbers for tasks, balances, or goals).
- If a section says "INSUFFICIENT DATA" or has 0 items, you MUST explicitly tell the user that there is no data available for that metric, and encourage them to add some.

Current User Workspace State:
\${groundedContext}\`;
}

export function formatContextSummaryAr(context: NOVOContext): string {
  const parts: string[] = [
    \`مؤشر أداء NOVO: \${context.productivityScore}/100\`,
    \`مهام اليوم: \${context.todayTasks.length} (المكتملة: \${context.completedTasks.length})\`,
    \`الأهداف النشطة: \${context.activeGoals.length}\`,
    \`دقائق التركيز اليوم: \${context.focusStats.todayFocusMinutes} دقيقة\`,
    \`رصيد المحفظة: $\${context.moneySummary.currentBalance.toLocaleString()}\`,
  ];
  return parts.join(' | ');
}

export {
  buildNOVOContext,
  getNOVOContext,
  getNOVOSummary,
  type ContextSourceData,
} from './contextEngine';
`;

fs.writeFileSync(ctxBuilderPath, contextBuilderCode, 'utf8');
console.log('✓ Updated src/core/intelligence/contextBuilder.ts');

// 5. Create test_gate21_runtime_integration.ts
const testPath = path.join(process.cwd(), 'test_gate21_runtime_integration.ts');
const testCode = `import { parseCommand } from './src/core/commands/commandParser';
import { aiOrchestrator } from './src/core/ai/aiOrchestrator';
import { buildAIGroundedContext } from './src/core/intelligence/contextBuilder';
import { toNOVOContext } from './src/core/intelligence/contextBridge';
import { evaluateWorkspaceIntelligence } from './src/core/intelligence/intelligenceCoordinator';
import { NOVOContext } from './src/core/intelligence/intelligenceTypes';
import { Task, Goal, FocusSession, MoneyState, Note, KnowledgeItem } from './src/types/data';

function makeMockContext(): NOVOContext {
  const dateStr = '2026-10-21';
  const dummyTask: Task = {
    id: 't-1',
    title: 'Urgent System Review',
    completed: false,
    date: dateStr,
    priority: 'high',
    createdAt: dateStr,
    updatedAt: dateStr,
  };

  const dummyGoal: Goal = {
    id: 'g-1',
    title: 'Achieve Q4 Operational Excellence',
    progress: 45,
    createdAt: dateStr,
    updatedAt: dateStr,
  };

  return {
    date: dateStr,
    generatedAt: new Date().toISOString(),
    productivityScore: 88,
    tasks: [dummyTask],
    todayTasks: [dummyTask],
    completedTasks: [],
    overdueTasks: [],
    goals: [dummyGoal],
    activeGoals: [dummyGoal],
    focusStats: {
      todayFocusMinutes: 45,
      weeklyFocusMinutes: 240,
      totalSessions: 6,
    },
    moneySummary: {
      currentBalance: 12500,
      recentSpending: 420,
    },
    recentNotes: [
      {
        id: 'n-1',
        title: 'Architecture Review Notes',
        content: 'System integration verified',
        tags: ['arch'],
        createdAt: dateStr,
        updatedAt: dateStr,
      },
    ],
    recentKnowledge: [
      {
        id: 'k-1',
        title: 'TypeScript Performance Guide',
        content: 'Compilation best practices',
        category: 'engineering',
        tags: ['ts'],
        createdAt: dateStr,
        updatedAt: dateStr,
      },
    ],
    notesCount: 1,
    knowledgeCount: 1,
    insights: [
      {
        id: 'ins-1',
        title: 'Strong Morning Velocity',
        description: 'You completed your highest priority task early.',
        priority: 'high',
      },
    ],
    briefing: {
      statusSummary: 'Your workspace is in top shape today with 88% velocity score.',
      productivitySummary: '1 pending high priority task.',
      focusRecommendation: 'Maintain steady 25m focus blocks.',
      financeAlert: 'Spend pacing within 7-day budget.',
      knowledgeHighlight: 'Review Architecture Review Notes.',
      motivationalClosing: 'Keep up the executive cadence.',
    },
    nextAction: {
      type: 'existing_task',
      tier: 2,
      selectedTask: dummyTask,
    },
    attentionRadar: {
      tier: 3,
      type: 'urgent_today_task',
      selectedTaskId: dummyTask.id,
      selectedTaskTitle: dummyTask.title,
      taskPriority: dummyTask.priority,
    },
    goalPacing: [
      {
        goalId: dummyGoal.id,
        goalTitle: dummyGoal.title,
        linkedTaskCount: 3,
        completedLinkedTaskCount: 2,
        lifetimePace: 1.5,
        targetPace: 1.0,
        activityState: 'Steady',
        focusMinutes: 90,
        executionCompletionRatio: 66,
      },
    ],
  };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(\`  ✓ \${message}\`);
    passed++;
  } else {
    console.error(\`  ✗ FAIL: \${message}\`);
    failed++;
  }
}

async function runGate21Tests() {
  console.log('====================================================');
  console.log('GATE 21: Intelligence Runtime Integration & Parity');
  console.log('====================================================');

  const context = makeMockContext();

  console.log('Test Group 1: commandParser Canonical Field Consumption');
  {
    const resBriefing = parseCommand('daily briefing', undefined, undefined, undefined, context);
    assert(resBriefing.isCommand, 'parseCommand recognizes daily briefing trigger');
    assert(resBriefing.command?.action === 'daily_briefing', 'action is daily_briefing');
    assert(
      resBriefing.command?.dailyBriefingPayload?.briefing === context.briefing,
      'command consumed context.briefing directly without recalculating with incomplete data'
    );

    const resNextAction = parseCommand('next action', undefined, undefined, undefined, context);
    assert(resNextAction.isCommand, 'parseCommand recognizes next action trigger');
    assert(resNextAction.command?.action === 'next_action', 'action is next_action');
    assert(
      resNextAction.command?.nextActionPayload?.selectedTaskId === context.nextAction?.selectedTask.id,
      'command consumed context.nextAction directly'
    );
    assert(
      resNextAction.command?.nextActionPayload?.nextActionResult === context.nextAction,
      'nextActionResult references canonical context instance'
    );

    const resRadar = parseCommand('attention radar', undefined, undefined, undefined, context);
    assert(resRadar.isCommand, 'parseCommand recognizes attention radar trigger');
    assert(resRadar.command?.action === 'attention_radar', 'action is attention_radar');
    assert(
      resRadar.command?.attentionRadarPayload?.radarResult === context.attentionRadar,
      'command consumed context.attentionRadar directly'
    );

    const resGoalPacingSingle = parseCommand(
      \`pacing for "\${context.goals[0].title}"\`,
      undefined,
      undefined,
      undefined,
      context
    );
    assert(resGoalPacingSingle.isCommand, 'parseCommand recognizes single goal pacing query');
    assert(resGoalPacingSingle.command?.action === 'goal_pacing', 'action is goal_pacing');
    assert(
      resGoalPacingSingle.command?.goalPacingPayload?.status === 'success',
      'single goal pacing status is success'
    );
    assert(
      resGoalPacingSingle.command?.goalPacingPayload?.analyses[0] === context.goalPacing![0],
      'single goal pacing consumed context.goalPacing directly'
    );

    const resGoalPacingPortfolio = parseCommand('portfolio pacing', undefined, undefined, undefined, context);
    assert(resGoalPacingPortfolio.isCommand, 'parseCommand recognizes portfolio pacing query');
    assert(resGoalPacingPortfolio.command?.action === 'goal_pacing', 'action is goal_pacing');
    assert(
      resGoalPacingPortfolio.command?.goalPacingPayload?.mode === 'portfolio',
      'portfolio mode resolved'
    );
    assert(
      resGoalPacingPortfolio.command?.goalPacingPayload?.analyses[0] === context.goalPacing![0],
      'portfolio goal pacing consumed context.goalPacing directly'
    );
  }

  console.log('Test Group 2: commandParser Backward-Compatible Fallback');
  {
    const resBriefingNoContext = parseCommand('daily briefing');
    assert(resBriefingNoContext.isCommand, 'fallback works without context for briefing');
    assert(!!resBriefingNoContext.command?.dailyBriefingPayload?.briefing, 'briefing generated via fallback');

    const resNextActionNoContext = parseCommand('next action');
    assert(resNextActionNoContext.isCommand, 'fallback works without context for next action');

    const resRadarNoContext = parseCommand('attention radar');
    assert(resRadarNoContext.isCommand, 'fallback works without context for radar');
  }

  console.log('Test Group 3: AIOrchestrator Canonical Consumer Parity');
  {
    const orchBriefing = await aiOrchestrator.orchestrate({
      prompt: 'daily briefing',
      messages: [],
      context,
    });
    assert(orchBriefing.handledAsCommand, 'orchestrate handled daily briefing as command');
    assert(
      orchBriefing.command?.dailyBriefingPayload?.briefing === context.briefing,
      'AI orchestrator consumed canonical briefing without double-evaluation'
    );

    const orchNextAction = await aiOrchestrator.orchestrate({
      prompt: 'next action',
      messages: [],
      context,
    });
    assert(orchNextAction.handledAsCommand, 'orchestrate handled next action as command');
    assert(
      orchNextAction.command?.nextActionPayload?.nextActionResult === context.nextAction,
      'AI orchestrator consumed canonical nextAction without double-evaluation'
    );

    const orchRadar = await aiOrchestrator.orchestrate({
      prompt: 'attention radar',
      messages: [],
      context,
    });
    assert(orchRadar.handledAsCommand, 'orchestrate handled attention radar as command');
    assert(
      orchRadar.command?.attentionRadarPayload?.radarResult === context.attentionRadar,
      'AI orchestrator consumed canonical attentionRadar without double-evaluation'
    );

    const orchPacing = await aiOrchestrator.orchestrate({
      prompt: 'portfolio pacing',
      messages: [],
      context,
    });
    assert(orchPacing.handledAsCommand, 'orchestrate handled goal pacing as command');
    assert(
      orchPacing.command?.goalPacingPayload?.analyses[0] === context.goalPacing![0],
      'AI orchestrator consumed canonical goalPacing without double-evaluation'
    );
  }

  console.log('Test Group 4: buildAIGroundedContext LLM Prompt Alignment');
  {
    const promptContext = buildAIGroundedContext(context);

    assert(promptContext.includes('## Recommended Next Action'), 'Prompt includes ## Recommended Next Action');
    assert(
      promptContext.includes(context.nextAction!.selectedTask.title),
      'Prompt includes next action task title'
    );

    assert(promptContext.includes('## Attention Radar'), 'Prompt includes ## Attention Radar');
    assert(
      promptContext.includes(context.attentionRadar!.type),
      'Prompt includes radar alert type'
    );

    assert(promptContext.includes('## Goal Pacing & Velocity'), 'Prompt includes ## Goal Pacing & Velocity');
    assert(
      promptContext.includes(context.goalPacing![0].goalTitle),
      'Prompt includes goal pacing metrics'
    );

    const partialContext: NOVOContext = {
      ...context,
      nextAction: undefined,
      attentionRadar: undefined,
      goalPacing: undefined,
    };
    const cleanPrompt = buildAIGroundedContext(partialContext);
    assert(!cleanPrompt.includes('## Recommended Next Action'), 'Gracefully omits Next Action when undefined');
    assert(!cleanPrompt.includes('## Attention Radar'), 'Gracefully omits Attention Radar when undefined');
    assert(!cleanPrompt.includes('## Goal Pacing & Velocity'), 'Gracefully omits Goal Pacing when undefined');
  }

  console.log('Test Group 5: End-to-End Intelligence Pipeline Consumer Parity');
  {
    const tasks: Task[] = [
      {
        id: 't-e2e',
        title: 'Review E2E Deployment',
        completed: false,
        date: '2026-10-21',
        priority: 'high',
        createdAt: '2026-10-21',
        updatedAt: '2026-10-21',
      },
    ];
    const goals: Goal[] = [
      {
        id: 'g-e2e',
        title: 'Ship Gate 21 Runtime',
        progress: 80,
        createdAt: '2026-10-21',
        updatedAt: '2026-10-21',
      },
    ];
    const focusSessions: FocusSession[] = [];
    const moneyState: MoneyState = { balance: 5000, transactions: [] };
    const notes: Note[] = [];
    const knowledge: KnowledgeItem[] = [];

    const snapshot = evaluateWorkspaceIntelligence(
      tasks,
      goals,
      focusSessions,
      moneyState,
      notes,
      knowledge,
      new Date('2026-10-21')
    );

    const canonicalContext = toNOVOContext(
      snapshot,
      tasks,
      goals,
      focusSessions,
      moneyState,
      notes,
      knowledge
    );

    assert(!!canonicalContext.briefing, 'toNOVOContext populated briefing');
    assert(!!canonicalContext.nextAction, 'toNOVOContext populated nextAction');
    assert(!!canonicalContext.attentionRadar, 'toNOVOContext populated attentionRadar');
    assert(!!canonicalContext.goalPacing, 'toNOVOContext populated goalPacing');

    const cmdBriefing = parseCommand('daily briefing', undefined, undefined, undefined, canonicalContext);
    assert(
      cmdBriefing.command?.dailyBriefingPayload?.briefing === snapshot.briefing,
      'End-to-End: command briefing strictly matches evaluateWorkspaceIntelligence briefing'
    );

    const cmdNext = parseCommand('next action', undefined, undefined, undefined, canonicalContext);
    assert(
      cmdNext.command?.nextActionPayload?.nextActionResult === snapshot.nextAction,
      'End-to-End: command nextAction strictly matches evaluateWorkspaceIntelligence nextAction'
    );

    const cmdRadar = parseCommand('attention radar', undefined, undefined, undefined, canonicalContext);
    assert(
      cmdRadar.command?.attentionRadarPayload?.radarResult === snapshot.attentionRadar,
      'End-to-End: command attentionRadar strictly matches evaluateWorkspaceIntelligence attentionRadar'
    );

    const cmdPacing = parseCommand('portfolio pacing', undefined, undefined, undefined, canonicalContext);
    assert(
      cmdPacing.command?.goalPacingPayload?.analyses === snapshot.goalPacing,
      'End-to-End: command goalPacing strictly matches evaluateWorkspaceIntelligence goalPacing'
    );

    const aiResult = await aiOrchestrator.orchestrate({
      prompt: 'daily briefing',
      messages: [],
      context: canonicalContext,
    });
    assert(
      aiResult.command?.dailyBriefingPayload?.briefing === snapshot.briefing,
      'End-to-End: AI Orchestrator briefing strictly matches canonical intelligence snapshot'
    );
  }

  console.log('----------------------------------------------------');
  console.log(\`Gate 21 Integration Results: \${passed} passed, \${failed} failed.\`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runGate21Tests().catch((err) => {
  console.error('Fatal error in Gate 21 test suite:', err);
  process.exit(1);
});
`;

fs.writeFileSync(testPath, testCode, 'utf8');
console.log('✓ Created test_gate21_runtime_integration.ts');

console.log('====================================================');
console.log('Gate 21 changes successfully applied!');
console.log('Run tests with: npx tsx test_gate21_runtime_integration.ts');
console.log('====================================================');