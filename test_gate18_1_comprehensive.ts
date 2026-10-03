import React from 'react';
import { create, act } from 'react-test-renderer';
import { parseCommand, parseTaskCreationCommand, parseGoalCreationCommand, getLocalDateString, getNextWeekdayDate } from './src/core/commands/commandParser';
import { aiOrchestrator } from './src/core/ai/aiOrchestrator';
import { useGoalStore } from './src/core/state/goalStore';
import { useTaskStore } from './src/core/state/taskStore';
import { useAuthStore } from './src/core/auth/authStore';
import { useChatStore } from './src/core/state/chatStore';
import { useChatOrchestrator, UseChatOrchestratorResult } from './src/modules/chat/hooks/useChatOrchestrator';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { NOVOContext } from './src/core/intelligence/intelligenceTypes';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  if (typeof args[0] === 'string' && (args[0].includes('react-test-renderer is deprecated') || args[0].includes('The current testing environment is not configured to support act'))) return;
  originalConsoleError(...args);
};

function createMockContext(): NOVOContext {
  return {
    tasks: [],
    goals: [],
    focusSessions: [],
    notes: [],
    knowledgeItems: [],
    transactions: [],
    userProfile: { name: 'Test User' },
    metrics: {
      completionRate: 0,
      focusMinutesToday: 0,
      goalsInProgress: 0,
      overdueTasksCount: 0,
    },
  };
}

async function runTests() {
  AuthLifecycle.reset('test-user-gate-18-1');
  console.log('====================================================');
  console.log('STARTING GATE 18.1 COMPREHENSIVE VERIFICATION SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let testIndex = 0;

  function assert(condition: boolean, msg: string) {
    testIndex++;
    if (!condition) {
      console.error(`  ✗ [FAIL ${testIndex}] ${msg}`);
      process.exit(1);
    }
    passed++;
    console.log(`  ✓ [PASS ${testIndex}] ${msg}`);
  }

  // --------------------------------------------------------------------------
  // SECTION 1: EXPLICIT TASK CREATION PROPOSALS (NATURAL ARABIC & ENGLISH)
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Explicit Task Intent Patterns ---');

  // Test 1: "فكرني أراجع التقرير بكرة"
  const task1 = parseCommand('فكرني أراجع التقرير بكرة');
  assert(task1.isCommand === true, '1. "فكرني أراجع التقرير بكرة" recognized as command');
  assert(task1.command?.action === 'create_task', '1b. Action is create_task');
  assert(task1.command?.taskPayload?.title.includes('أراجع التقرير'), '1c. Task title contains "أراجع التقرير"');
  assert(task1.command?.taskPayload?.date === getLocalDateString(1), '1d. Date is tomorrow');

  // Test 2: "ذكرني أكلم الدكتور الخميس"
  const task2 = parseCommand('ذكرني أكلم الدكتور الخميس');
  assert(task2.isCommand === true, '2. "ذكرني أكلم الدكتور الخميس" recognized as command');
  assert(task2.command?.action === 'create_task', '2b. Action is create_task');
  assert(task2.command?.taskPayload?.title.includes('أكلم الدكتور'), '2c. Task title contains "أكلم الدكتور"');
  assert(task2.command?.taskPayload?.date === getNextWeekdayDate(4), '2d. Date is Thursday');

  // Test 3: "حطلي مهمة أراجع الـAPI بأولوية عالية"
  const task3 = parseCommand('حطلي مهمة أراجع الـAPI بأولوية عالية');
  assert(task3.isCommand === true, '3. "حطلي مهمة أراجع الـAPI بأولوية عالية" recognized as command');
  assert(task3.command?.action === 'create_task', '3b. Action is create_task');
  assert(task3.command?.taskPayload?.title.includes('أراجع الـAPI'), '3c. Task title contains "أراجع الـAPI"');
  assert(task3.command?.taskPayload?.priority === 'high', '3d. Priority is high');

  // Test 4: "أريد إضافة مهمة لمراجعة الكود"
  const task4 = parseCommand('أريد إضافة مهمة لمراجعة الكود');
  assert(task4.isCommand === true, '4. "أريد إضافة مهمة لمراجعة الكود" recognized as command');
  assert(task4.command?.action === 'create_task', '4b. Action is create_task');
  assert(task4.command?.taskPayload?.title.includes('لمراجعة الكود'), '4c. Task title contains "لمراجعة الكود"');

  // Test 5: "Remind me to review the PR tomorrow"
  const task5 = parseCommand('Remind me to review the PR tomorrow');
  assert(task5.isCommand === true, '5. "Remind me to review the PR tomorrow" recognized as command');
  assert(task5.command?.action === 'create_task', '5b. Action is create_task');
  assert(task5.command?.taskPayload?.title === 'review the PR', '5c. Task title is clean "review the PR"');
  assert(task5.command?.taskPayload?.date === getLocalDateString(1), '5d. Date is tomorrow');

  // Test 6: "Add a high-priority task to deploy the beta on Friday"
  const task6 = parseCommand('Add a high-priority task to deploy the beta on Friday');
  assert(task6.isCommand === true, '6. "Add a high-priority task to deploy the beta on Friday" recognized as command');
  assert(task6.command?.action === 'create_task', '6b. Action is create_task');
  assert(task6.command?.taskPayload?.title === 'deploy the beta', '6c. Task title is clean "deploy the beta"');
  assert(task6.command?.taskPayload?.priority === 'high', '6d. Priority is high');
  assert(task6.command?.taskPayload?.date === getNextWeekdayDate(5), '6e. Date is Friday');

  // --------------------------------------------------------------------------
  // SECTION 2: EXPLICIT GOAL CREATION PROPOSALS (NATURAL ARABIC & ENGLISH)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Explicit Goal Intent Patterns ---');

  // Test 7: "عايز أحط هدف أتعلم React"
  const goal1 = parseCommand('عايز أحط هدف أتعلم React');
  assert(goal1.isCommand === true, '7. "عايز أحط هدف أتعلم React" recognized as command');
  assert(goal1.command?.action === 'create_goal', '7b. Action is create_goal');
  assert(goal1.command?.goalPayload?.title.includes('أتعلم React') || goal1.command?.goalPayload?.title.includes('اتعلم React'), '7c. Goal title contains "أتعلم React"');
  assert(goal1.command?.goalPayload?.initialProgress === 0, '7d. Initial progress is 0');

  // Test 8: "حطلي هدف أخلص كورس JavaScript"
  const goal2 = parseCommand('حطلي هدف أخلص كورس JavaScript');
  assert(goal2.isCommand === true, '8. "حطلي هدف أخلص كورس JavaScript" recognized as command');
  assert(goal2.command?.action === 'create_goal', '8b. Action is create_goal');
  assert(goal2.command?.goalPayload?.title.includes('أخلص كورس JavaScript') || goal2.command?.goalPayload?.title.includes('اخلص كورس JavaScript'), '8c. Goal title contains "أخلص كورس JavaScript"');
  assert(goal2.command?.goalPayload?.initialProgress === 0, '8d. Initial progress is 0');

  // Test 9: "اعمل لي هدف لقراءة 10 كتب"
  const goal3 = parseCommand('اعمل لي هدف لقراءة 10 كتب');
  assert(goal3.isCommand === true, '9. "اعمل لي هدف لقراءة 10 كتب" recognized as command');
  assert(goal3.command?.action === 'create_goal', '9b. Action is create_goal');
  assert(goal3.command?.goalPayload?.title.includes('قراءة 10 كتب'), '9c. Goal title contains "قراءة 10 كتب"');

  // Test 10: "Let's create a goal: Master TypeScript"
  const goal4 = parseCommand("Let's create a goal: Master TypeScript");
  assert(goal4.isCommand === true, '10. "Let\'s create a goal: Master TypeScript" recognized as command');
  assert(goal4.command?.action === 'create_goal', '10b. Action is create_goal');
  assert(goal4.command?.goalPayload?.title === 'Master TypeScript', '10c. Goal title is clean "Master TypeScript"');

  // Test 11: "I want to set a goal to complete the marathon preparation"
  const goal5 = parseCommand('I want to set a goal to complete the marathon preparation');
  assert(goal5.isCommand === true, '11. "I want to set a goal to complete the marathon preparation" recognized as command');
  assert(goal5.command?.action === 'create_goal', '11b. Action is create_goal');
  assert(goal5.command?.goalPayload?.title === 'complete the marathon preparation', '11c. Goal title is clean');

  // --------------------------------------------------------------------------
  // SECTION 3: CONVERSATIONAL NEGATIVE CASES (MUST NOT MUTATE OR PROPOSE)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Conversational Protection (Fail-Closed) ---');

  const conversationalCases = [
    'إزاي أضيف مهمة؟',
    'إزاي اضيف مهمة',
    'هل الأفضل أعمل هدف لتعلم React؟',
    'هل الافضل اعمل هدف لتعلم React',
    'أنا خلصت المهمة دي امبارح',
    'أنا مش عارف أبدأ المذاكرة منين',
    'كيف اضيف هدف؟',
    'how to add a task?',
    'how can I create a goal?',
    'Should I set a goal to learn React?',
    'I finished my task yesterday',
    'I do not know where to start studying',
  ];

  for (const c of conversationalCases) {
    const res = parseCommand(c);
    assert(res.isCommand === false, `Conversational message NOT intercepted: "${c}"`);
  }

  // --------------------------------------------------------------------------
  // SECTION 4: AI ORCHESTRATOR INTEGRATION & ZERO PROMPT POLLUTION
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: AI Orchestrator Execution ---');

  const context = createMockContext();

  // Test Task proposal in Orchestrator
  const orchTask = await aiOrchestrator.orchestrate({
    message: 'فكرني أراجع التقرير بكرة',
    context,
    language: 'ar',
  });
  assert(orchTask.handledAsCommand === true, 'Orchestrator handled task command');
  assert(!!orchTask.taskProposal, 'Orchestrator emitted taskProposal');
  assert(orchTask.taskProposal?.status === 'pending', 'Task proposal is pending');
  assert(orchTask.taskProposal?.date === getLocalDateString(1), 'Task proposal date is tomorrow');
  assert(orchTask.taskProposal?.title.includes('أراجع التقرير'), 'Task proposal title matches');

  // Test Goal proposal in Orchestrator
  const orchGoal = await aiOrchestrator.orchestrate({
    message: 'عايز أحط هدف أتعلم React',
    context,
    language: 'ar',
  });
  assert(orchGoal.handledAsCommand === true, 'Orchestrator handled goal command');
  assert(!!orchGoal.goalProposal, 'Orchestrator emitted goalProposal');
  assert(orchGoal.goalProposal?.status === 'pending', 'Goal proposal is pending');
  assert(orchGoal.goalProposal?.initialProgress === 0, 'Goal proposal initialProgress is 0');
  assert(orchGoal.goalProposal?.title.includes('أتعلم React') || orchGoal.goalProposal?.title.includes('اتعلم React'), 'Goal proposal title matches');

  // Test Goal confirmation in goalStore
  console.log('\n--- Section 5: Goal Confirmation Execution ---');
  const initialGoalsCount = useGoalStore.getState().goals.length;
  await useGoalStore.getState().createGoal(orchGoal.goalProposal!.title, orchGoal.goalProposal!.description || '', orchGoal.goalProposal!.initialProgress || 0);
  const updatedGoals = useGoalStore.getState().goals;
  assert(updatedGoals.length === initialGoalsCount + 1, 'Confirming goal adds exactly 1 goal to goalStore');
  const createdGoal = updatedGoals[0];
  assert(createdGoal.title.includes('React'), 'Created goal title is preserved');
  assert(createdGoal.progress === 0, 'Created goal progress starts at 0');

  // --------------------------------------------------------------------------
  // SECTION 6: CHAT ORCHESTRATOR HOOK (RETRY RESILIENCE & COMMAND PROPOSALS)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 6: useChatOrchestrator Resilience & Retry Guarantees ---');

  useAuthStore.setState({ user: { uid: 'test-user-gate-18-1', email: 'test@example.com' } as any, loading: false });
  const testConv = await useChatStore.getState().createConversation('Test Orchestrator');
  await useChatStore.getState().selectConversation(testConv.id);

  let hookRef: UseChatOrchestratorResult = null as any;
  function TestHookComponent() {
    hookRef = useChatOrchestrator({
      getContext: createMockContext,
      language: 'ar',
    });
    return null;
  }

  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(TestHookComponent));
  });

  const originalOrchestrate = aiOrchestrator.orchestrate.bind(aiOrchestrator);

  try {
    // 6.1: Existing command proposal behavior is unchanged (submitMessage)
    await act(async () => {
      await hookRef.submitMessage('عايز أحط هدف أتعلم React');
    });
    assert(hookRef.executionState === 'idle', '6.1a. submitMessage: executionState returns to "idle"');
    assert(!!hookRef.activeGoalProposal, '6.1b. submitMessage: produces activeGoalProposal');
    assert(hookRef.activeGoalProposal?.status === 'pending', '6.1c. submitMessage: proposal status is "pending"');
    assert(!!hookRef.activeGoalProposal?.originatingMessageId, '6.1d. submitMessage: originatingMessageId is preserved');

    // 6.2: Retry command result produces corresponding proposal state
    act(() => {
      hookRef.clearGoalProposal();
    });
    assert(hookRef.activeGoalProposal === null, '6.2a. Goal proposal cleared before retry test');

    await act(async () => {
      const retryCmdRes = await hookRef.retryLastMessage();
      assert(retryCmdRes?.handledAsCommand === true, '6.2b. retryLastMessage command: handledAsCommand is true');
    });
    assert(hookRef.executionState === 'idle', '6.2c. retryLastMessage command: executionState returns to "idle"');
    assert(!!hookRef.activeGoalProposal, '6.2d. retryLastMessage command: produces activeGoalProposal');
    assert(hookRef.activeGoalProposal?.status === 'pending', '6.2e. retryLastMessage command: proposal status is "pending"');
    assert(!!hookRef.activeGoalProposal?.originatingMessageId, '6.2f. retryLastMessage command: originatingMessageId is preserved');

    // 6.3: Retry unexpected rejection returns executionState to "idle" (no zombie generating state)
    aiOrchestrator.orchestrate = async () => {
      throw new Error('Simulated upstream network/provider crash');
    };

    await act(async () => {
      const failRes = await hookRef.retryLastMessage();
      assert(failRes !== null && failRes.handledAsCommand === false, '6.3a. retryLastMessage rejection: returns error result');
      assert(failRes?.error?.code === 'REQUEST_FAILED', '6.3b. retryLastMessage rejection: error code is REQUEST_FAILED');
    });
    assert(hookRef.executionState === 'idle', '6.3c. retryLastMessage rejection: executionState is returned to "idle" (no zombie "NOVO يقوم بالمعالجة...")');
    assert(hookRef.error !== null && hookRef.error.code === 'REQUEST_FAILED', '6.3d. retryLastMessage rejection: error state is exposed to UI');

    // Prove isSubmitting mutex was unlocked by executing subsequent submit
    aiOrchestrator.orchestrate = originalOrchestrate;
    await act(async () => {
      const nextSubmit = await hookRef.submitMessage('عايز أحط هدف أتعلم React');
      assert(nextSubmit.handledAsCommand === true, '6.3e. Subsequent submission succeeds without mutex blockage');
    });

    // 6.4: Retry normal AI response still works
    aiOrchestrator.orchestrate = async () => ({
      handledAsCommand: false,
      aiResponse: { text: 'رد تجريبي من المساعد الذكي' },
    });

    await act(async () => {
      const normalRes = await hookRef.retryLastMessage();
      assert(normalRes?.aiResponse?.text === 'رد تجريبي من المساعد الذكي', '6.4a. retryLastMessage normal AI: returned aiResponse');
    });
    assert(hookRef.executionState === 'idle', '6.4b. retryLastMessage normal AI: executionState is "idle"');
    assert(hookRef.error === null, '6.4c. retryLastMessage normal AI: error is null');

    // 6.5: Retry error still exposes existing error behavior
    aiOrchestrator.orchestrate = async () => ({
      handledAsCommand: false,
      error: {
        code: 'AI_TIMEOUT',
        message: 'Request timed out.',
        messageAr: 'انتهى وقت الطلب.',
        retryable: true,
      },
    });

    await act(async () => {
      const errorRes = await hookRef.retryLastMessage();
      assert(errorRes?.error?.code === 'AI_TIMEOUT', '6.5a. retryLastMessage handled error: returned error matches');
    });
    assert(hookRef.executionState === 'idle', '6.5b. retryLastMessage handled error: executionState is "idle"');

  } finally {
    aiOrchestrator.orchestrate = originalOrchestrate;
    if (renderer) {
      act(() => {
        renderer.unmount();
      });
    }
  }

  console.log('\n====================================================');
  console.log(`ALL ${passed} GATE 18.1 TESTS PASSED PERFECTLY!`);
  console.log('====================================================\n');
}

runTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
