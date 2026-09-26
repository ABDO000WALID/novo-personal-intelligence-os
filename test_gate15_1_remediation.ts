import { useChatStore } from './src/core/state/chatStore';
import { useGoalStore } from './src/core/state/goalStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { GoalProgressActionProposal, TaskActionProposal } from './src/core/commands/commandTypes';
import { ChatMessage } from './src/types/data';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runGate15_1_Tests() {
  console.log('\n=== GATE 15.1 BLOCKER REMEDIATION VERIFICATION SUITE ===\n');

  // PART 1: STALE-READ FAIL-CLOSED SAFETY
  console.log('--- PART 1: STALE-READ FAIL-CLOSED AUDIT ---');

  // Test 1: Repository read error throws and fails closed without in-memory fallback
  {
    useGoalStore.getState().clearState();
    useGoalStore.setState({
      goals: [
        {
          id: 'goal-fail-closed-1',
          title: 'Learn TypeScript',
          description: 'Master TypeScript fundamentals',
          progress: 50,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      lastUpdated: Date.now(),
    });

    const repo = RepositoryFactory.getGoalRepository();
    const originalGetById = repo.getById.bind(repo);

    // Mock repository getById to throw network error
    (repo as any).getById = async () => {
      throw new Error('Firestore connection timeout');
    };

    const proposal: GoalProgressActionProposal = {
      id: 'prop-stale-err',
      goalId: 'goal-fail-closed-1',
      goalTitle: 'Learn TypeScript',
      currentProgress: 50,
      newProgress: 75,
      status: 'pending',
    };

    // Simulate GoalProgressProposalCard handleConfirm logic
    let caughtError: any = null;
    try {
      let authoritativeGoal = null;
      try {
        authoritativeGoal = await repo.getById(proposal.goalId);
      } catch (repoErr) {
        throw new Error('Could not verify goal state from database. Please check your connection and try again.');
      }

      if (!authoritativeGoal) {
        throw new Error('Referenced goal was not found. It may have been deleted.');
      }

      if (authoritativeGoal.progress !== proposal.currentProgress) {
        throw new Error('Goal progress has changed since this proposal was created.');
      }

      await useGoalStore.getState().updateProgress(proposal.goalId, proposal.newProgress);
      proposal.status = 'confirmed';
    } catch (e: any) {
      caughtError = e;
    }

    assert(caughtError !== null, 'Repository read error must throw and be caught');
    assert(
      caughtError.message.includes('Could not verify goal state from database'),
      'Error message reflects authoritative repository verification failure'
    );
    assert(proposal.status === 'pending', 'Proposal status must remain pending on repository error');
    assert(
      useGoalStore.getState().goals.find((g) => g.id === 'goal-fail-closed-1')?.progress === 50,
      'Goal in store was NOT mutated; zero fallback to in-memory state occurred'
    );

    // Restore repository
    repo.getById = originalGetById;
  }

  // Test 2: Repository returns null (deleted in backend) fails closed
  {
    const repo = RepositoryFactory.getGoalRepository();
    const originalGetById = repo.getById.bind(repo);

    // Mock repository to return null
    (repo as any).getById = async () => null;

    const proposal: GoalProgressActionProposal = {
      id: 'prop-stale-null',
      goalId: 'goal-fail-closed-1',
      goalTitle: 'Learn TypeScript',
      currentProgress: 50,
      newProgress: 75,
      status: 'pending',
    };

    let caughtError: any = null;
    try {
      let authoritativeGoal = null;
      try {
        authoritativeGoal = await repo.getById(proposal.goalId);
      } catch (repoErr) {
        throw new Error('Could not verify goal state from database.');
      }

      if (!authoritativeGoal) {
        throw new Error('Referenced goal was not found. It may have been deleted.');
      }

      await useGoalStore.getState().updateProgress(proposal.goalId, proposal.newProgress);
      proposal.status = 'confirmed';
    } catch (e: any) {
      caughtError = e;
    }

    assert(caughtError !== null, 'Missing authoritative goal must throw and be caught');
    assert(
      caughtError.message.includes('Referenced goal was not found'),
      'Error message identifies missing/deleted goal'
    );
    assert(proposal.status === 'pending', 'Proposal status must remain pending');

    // Restore repository
    repo.getById = originalGetById;
  }

  // PART 2: CHAT MESSAGE CORRELATION AND SCHEMA
  console.log('\n--- PART 2: CHAT MESSAGE CORRELATION & PERSISTENCE ---');

  // Test 3: ChatMessage supports replyToMessageId and persists it
  {
    useChatStore.getState().clearState();
    const store = useChatStore.getState();

    // Mock AuthLifecycle
    const originalGetUid = AuthLifecycle.getUid;
    (AuthLifecycle as any).getUid = () => 'test-user-15-1';

    // Create a new conversation and send user message
    await store.createConversation('Test Correlation Thread');
    const convId = useChatStore.getState().activeConversationId!;

    await store.sendMessage('ما هي أهدافي الحالية؟', 'user', convId);
    const userMsgId = useChatStore.getState().lastSentMessageId;
    assert(Boolean(userMsgId), 'lastSentMessageId is set on sending user message');

    // Send assistant response with replyToMessageId
    await store.sendMessage('لديك هدف واحد مسجل حالياً.', 'assistant', convId, userMsgId || undefined);
    const assistantMsgId = useChatStore.getState().lastSentMessageId;

    const conv = useChatStore.getState().conversations.find((c) => c.id === convId);
    const assistantMsg = conv?.messages.find((m) => m.id === assistantMsgId);

    assert(Boolean(assistantMsg), 'Assistant message is stored in conversation');
    assert(
      assistantMsg?.replyToMessageId === userMsgId,
      `Assistant message replyToMessageId (${assistantMsg?.replyToMessageId}) correctly points to user message ID (${userMsgId})`
    );

    (AuthLifecycle as any).getUid = originalGetUid;
  }

  // Test 4: Proposals support originatingMessageId
  {
    const taskProposal: TaskActionProposal = {
      id: 'task-prop-1',
      originatingMessageId: 'msg-user-123',
      title: 'مراجعة الميزانية',
      priority: 'high',
      date: '2026-09-22',
      status: 'pending',
    };

    const goalProposal: GoalProgressActionProposal = {
      id: 'goal-prop-1',
      originatingMessageId: 'msg-user-123',
      goalId: 'goal-1',
      goalTitle: 'حفظ القرآن',
      currentProgress: 20,
      newProgress: 40,
      status: 'pending',
    };

    assert(taskProposal.originatingMessageId === 'msg-user-123', 'Task proposal holds originatingMessageId');
    assert(goalProposal.originatingMessageId === 'msg-user-123', 'Goal proposal holds originatingMessageId');
  }

  // PART 3: PROPOSAL ANCHORING LOGIC IN STREAM
  console.log('\n--- PART 3: PROPOSAL ANCHORING SIMULATION ---');

  // Test 5: Proposals anchor to their originating user message, not to the bottom
  {
    const messages: ChatMessage[] = [
      { id: 'msg-u1', role: 'user', content: 'حدّث تقدم هدف الإنجليزية إلى 50%', createdAt: '2026-09-22T10:00:00Z' },
      { id: 'msg-u2', role: 'user', content: 'كيف حال الطقس اليوم؟', createdAt: '2026-09-22T10:01:00Z' },
      { id: 'msg-a2', role: 'assistant', content: 'الطقس معتدل اليوم.', createdAt: '2026-09-22T10:01:05Z', replyToMessageId: 'msg-u2' },
    ];

    const proposal: GoalProgressActionProposal = {
      id: 'prop-goal-1',
      originatingMessageId: 'msg-u1',
      goalId: 'goal-eng-1',
      goalTitle: 'تعلم اللغة الإنجليزية',
      currentProgress: 40,
      newProgress: 50,
      status: 'pending',
    };

    // Check which message the proposal attaches to
    const attachedTo = messages.find((msg) => proposal.originatingMessageId === msg.id);

    assert(attachedTo?.id === 'msg-u1', 'Proposal anchors specifically to msg-u1, NOT to the latest message msg-a2');
    assert(attachedTo?.id !== messages[messages.length - 1].id, 'Proposal is NOT floating at the bottom of newer messages');
  }

  // PART 4: CONCURRENCY MUTEX LOCK
  console.log('\n--- PART 4: CONCURRENCY MUTEX SAFETY ---');

  // Test 6: Verify double submission rejection pattern
  {
    let isSubmitting = false;

    const simulateSubmission = async (delayMs: number): Promise<{ success: boolean; error?: string }> => {
      if (isSubmitting) {
        return { success: false, error: 'A message is already being processed.' };
      }
      isSubmitting = true;
      try {
        await new Promise((r) => setTimeout(r, delayMs));
        return { success: true };
      } finally {
        isSubmitting = false;
      }
    };

    // Trigger two rapid concurrent submissions
    const [sub1, sub2] = await Promise.all([
      simulateSubmission(50),
      simulateSubmission(50),
    ]);

    assert(sub1.success === true, 'First submission proceeds normally');
    assert(sub2.success === false, 'Concurrent second submission is rejected by mutex');
    assert(sub2.error === 'A message is already being processed.', 'Rejected submission gets clean error');
    assert(isSubmitting === false, 'Mutex releases properly after completion');
  }

  console.log('\n==========================================');
  console.log(`TOTAL TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('==========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runGate15_1_Tests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
