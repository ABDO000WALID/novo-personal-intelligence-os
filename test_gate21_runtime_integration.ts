import { parseCommand } from './src/core/commands/commandParser';
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
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
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
      `pacing for "${context.goals[0].title}"`,
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
  console.log(`Gate 21 Integration Results: ${passed} passed, ${failed} failed.`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runGate21Tests().catch((err) => {
  console.error('Fatal error in Gate 21 test suite:', err);
  process.exit(1);
});
