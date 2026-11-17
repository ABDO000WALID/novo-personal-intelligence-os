import './test_env.ts';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { aiOrchestrator } from './src/core/ai/aiOrchestrator';
import { parseCommand, parseTaskCreationCommand, resolveGoalDeterministically } from './src/core/commands/commandParser';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { TaskActionProposal } from './src/core/commands/commandTypes';
import { Goal } from './src/types/data';

console.log('=== GATE 14.0 COMPREHENSIVE VERIFICATION SUITE ===');

const TEST_UID = 'gate14-test-user-001';

const sampleGoals: Goal[] = [
  {
    id: 'goal-eng-1',
    title: 'تعلم اللغة الإنجليزية',
    description: 'تحسين المحادثة والقراءة باللغة الإنجليزية',
    progress: 40,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'goal-fit-2',
    title: 'اللياقة البدنية والصحة',
    description: 'تمارين يومية وخسارة وزن',
    progress: 25,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'goal-book-3',
    title: 'Book Writing',
    description: 'Publish novel first draft',
    progress: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'goal-ambig-a',
    title: 'مشروع البرمجة المتقدم',
    description: 'برمجة الواجهة',
    progress: 50,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'goal-ambig-b',
    title: 'مشروع البرمجة الأساسي',
    description: 'برمجة الباك إند',
    progress: 50,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function resetStorage() {
  AuthLifecycle.reset(TEST_UID);
  (RepositoryFactory.getTaskRepository() as any)._saveAllSync([]);
  (RepositoryFactory.getGoalRepository() as any)._saveAllSync([]);
  useTaskStore.setState({ tasks: [], status: 'ready', error: null });
  useGoalStore.setState({ goals: [...sampleGoals], status: 'ready', error: null });
}

// Emulates the exact TaskProposalCard execution logic & synchronous lock & stale goal safety
class ProposalCardHarness {
  proposal: TaskActionProposal;
  status: 'pending' | 'confirmed' | 'cancelled';
  isActionLocked: boolean = false;
  isSubmitting: boolean = false;
  errorMessage: string | null = null;

  constructor(proposal: TaskActionProposal) {
    this.proposal = proposal;
    this.status = proposal.status || 'pending';
  }

  async confirm(): Promise<boolean> {
    if (this.isActionLocked || this.status !== 'pending') {
      return false;
    }
    this.isActionLocked = true;
    this.isSubmitting = true;
    this.errorMessage = null;

    try {
      // Stale Goal Safety
      let validatedGoalId: string | undefined = undefined;
      if (this.proposal.goalId) {
        const currentGoals = useGoalStore.getState().goals;
        const goalStillExists = currentGoals.some((g) => g && g.id === this.proposal.goalId);
        if (goalStillExists) {
          validatedGoalId = this.proposal.goalId;
        }
      }

      await useTaskStore.getState().createTask(
        this.proposal.title,
        this.proposal.priority,
        this.proposal.date,
        validatedGoalId
      );
      this.status = 'confirmed';
      this.proposal.status = 'confirmed';
      return true;
    } catch (err: any) {
      this.isActionLocked = false;
      this.errorMessage = err?.message || 'Error';
      return false;
    } finally {
      this.isSubmitting = false;
    }
  }

  cancel(): boolean {
    if (this.isActionLocked || this.status !== 'pending') {
      return false;
    }
    this.isActionLocked = true;
    this.status = 'cancelled';
    this.proposal.status = 'cancelled';
    return true;
  }
}

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${name} ${detail ? '- ' + detail : ''}`);
    failCount++;
  }
}

async function runTests() {
  resetStorage();

  console.log('\n--- 1. Existing Gate 13 task without goal ---');
  {
    const res = parseCommand('أضفلي مهمة مراجعة الكود اليوم أولوية عالية', sampleGoals);
    assert(res.isCommand === true, 'Parsed as command');
    assert(res.command?.action === 'create_task', 'Action is create_task');
    assert(res.command?.taskPayload?.title === 'مراجعة الكود', `Title is "مراجعة الكود" (got "${res.command?.taskPayload?.title}")`);
    assert(res.command?.taskPayload?.priority === 'high', 'Priority is high');
    assert(res.command?.taskPayload?.goalId === undefined, 'No goalId attached');
    assert(res.command?.taskPayload?.goalTitle === undefined, 'No goalTitle attached');
  }

  console.log('\n--- 2. Arabic explicit goal association ---');
  {
    const res = parseCommand('أضفلي مهمة قراءة مقال اليوم لهدف تعلم اللغة الإنجليزية أولوية عالية', sampleGoals);
    assert(res.isCommand === true, 'Parsed as command');
    assert(res.command?.action === 'create_task', 'Action is create_task');
    assert(res.command?.taskPayload?.title === 'قراءة مقال', `Title is "قراءة مقال" (got "${res.command?.taskPayload?.title}")`);
    assert(res.command?.taskPayload?.priority === 'high', 'Priority is high');
    assert(res.command?.taskPayload?.goalId === 'goal-eng-1', `goalId matches "goal-eng-1" (got "${res.command?.taskPayload?.goalId}")`);
    assert(res.command?.taskPayload?.goalTitle === 'تعلم اللغة الإنجليزية', `goalTitle is "تعلم اللغة الإنجليزية" (got "${res.command?.taskPayload?.goalTitle}")`);
  }

  console.log('\n--- 3. English explicit goal association ---');
  {
    const res = parseCommand('Add task review the draft for goal Book Writing with high priority', sampleGoals);
    assert(res.isCommand === true, 'Parsed as command');
    assert(res.command?.action === 'create_task', 'Action is create_task');
    assert(res.command?.taskPayload?.title === 'review the draft', `Title is "review the draft" (got "${res.command?.taskPayload?.title}")`);
    assert(res.command?.taskPayload?.priority === 'high', 'Priority is high');
    assert(res.command?.taskPayload?.goalId === 'goal-book-3', `goalId is "goal-book-3" (got "${res.command?.taskPayload?.goalId}")`);
    assert(res.command?.taskPayload?.goalTitle === 'Book Writing', `goalTitle is "Book Writing" (got "${res.command?.taskPayload?.goalTitle}")`);
  }

  console.log('\n--- 4. Exact / Normalized goal match ---');
  {
    // With diacritics / alternate alef
    const res = parseCommand('اضف مهمه تمرين كارديو لهدف اللياقه البدنيه والصحه', sampleGoals);
    assert(res.isCommand === true, 'Command parsed');
    assert(res.command?.taskPayload?.goalId === 'goal-fit-2', 'Resolved normalized title to goal-fit-2');
    assert(res.command?.taskPayload?.goalTitle === 'اللياقة البدنية والصحة', 'goalTitle preserved exactly from goal');
  }

  console.log('\n--- 5. Nonexistent goal reference ---');
  {
    const res = parseCommand('أضفلي مهمة تجربة جديدة لهدف السفر إلى المريخ أولوية متوسطة', sampleGoals);
    assert(res.isCommand === true, 'Command parsed as task');
    assert(res.command?.taskPayload?.goalId === undefined, 'Nonexistent goal yields undefined goalId (no guess)');
    assert(res.command?.taskPayload?.goalTitle === undefined, 'Nonexistent goal yields undefined goalTitle');
    assert(res.command?.taskPayload?.title === 'تجربة جديدة', `Task title is "تجربة جديدة" (got "${res.command?.taskPayload?.title}")`);
  }

  console.log('\n--- 6. Ambiguous goal reference (Multiple matching goals) ---');
  {
    // "مشروع البرمجة" matches both goal-ambig-a and goal-ambig-b
    const res = parseCommand('أضفلي مهمة كتابة الكود لهدف مشروع البرمجة', sampleGoals);
    assert(res.isCommand === true, 'Command parsed as task');
    assert(res.command?.taskPayload?.goalId === undefined, 'Ambiguous goal match leaves goalId undefined (never guesses or picks first)');
    assert(res.command?.taskPayload?.goalTitle === undefined, 'Ambiguous goal match leaves goalTitle undefined');
  }

  console.log('\n--- 7. AIOrchestrator context threading & proposal creation ---');
  {
    const orchRes = await aiOrchestrator.orchestrate({
      message: 'أضفلي مهمة قراءة مقال اليوم لهدف تعلم اللغة الإنجليزية أولوية عالية',
      context: { goals: sampleGoals } as any,
    });
    assert(orchRes.handledAsCommand === true, 'Handled as command');
    assert(Boolean(orchRes.taskProposal), 'taskProposal produced');
    assert(orchRes.taskProposal?.goalId === 'goal-eng-1', 'taskProposal has goalId "goal-eng-1"');
    assert(orchRes.taskProposal?.goalTitle === 'تعلم اللغة الإنجليزية', 'taskProposal has correct goalTitle');
    assert(orchRes.taskProposal?.status === 'pending', 'Proposal status is pending');
  }

  console.log('\n--- 8. Pre-confirm zero mutations ---');
  {
    resetStorage();
    const orchRes = await aiOrchestrator.orchestrate({
      message: 'أضفلي مهمة قراءة مقال اليوم لهدف تعلم اللغة الإنجليزية أولوية عالية',
      context: { goals: sampleGoals } as any,
    });
    const tasksInStore = useTaskStore.getState().tasks;
    const goalsInStore = useGoalStore.getState().goals;
    assert(tasksInStore.length === 0, 'Zero tasks in store before confirmation');
    assert(goalsInStore.length === sampleGoals.length, 'Zero goal mutations');
  }

  console.log('\n--- 9. Confirm creates exactly one task with correct goalId ---');
  {
    resetStorage();
    const orchRes = await aiOrchestrator.orchestrate({
      message: 'أضفلي مهمة قراءة مقال اليوم لهدف تعلم اللغة الإنجليزية أولوية عالية',
      context: { goals: sampleGoals } as any,
    });
    const card = new ProposalCardHarness(orchRes.taskProposal!);
    const confirmed = await card.confirm();
    assert(confirmed === true, 'Confirm succeeded');
    const tasks = useTaskStore.getState().tasks;
    assert(tasks.length === 1, `Exactly 1 task created (got ${tasks.length})`);
    assert(tasks[0].title === 'قراءة مقال', 'Task title correct');
    assert(tasks[0].priority === 'high', 'Task priority high');
    assert(tasks[0].goalId === 'goal-eng-1', `Task linked to goal-eng-1 (got "${tasks[0].goalId}")`);
    assert(card.status === 'confirmed', 'Card status transitioned to confirmed');
  }

  console.log('\n--- 10. Cancel creates zero tasks ---');
  {
    resetStorage();
    const orchRes = await aiOrchestrator.orchestrate({
      message: 'أضفلي مهمة قراءة مقال اليوم لهدف تعلم اللغة الإنجليزية أولوية عالية',
      context: { goals: sampleGoals } as any,
    });
    const card = new ProposalCardHarness(orchRes.taskProposal!);
    const cancelled = card.cancel();
    assert(cancelled === true, 'Cancel succeeded');
    assert(card.status === 'cancelled', 'Card status is cancelled');
    const tasks = useTaskStore.getState().tasks;
    assert(tasks.length === 0, 'Zero tasks created in store after cancel');
    const retryConfirm = await card.confirm();
    assert(retryConfirm === false, 'Cannot confirm after cancel');
    assert(useTaskStore.getState().tasks.length === 0, 'Still zero tasks created');
  }

  console.log('\n--- 11. Rapid double-confirm creates exactly one task ---');
  {
    resetStorage();
    const orchRes = await aiOrchestrator.orchestrate({
      message: 'أضفلي مهمة قراءة مقال اليوم لهدف تعلم اللغة الإنجليزية أولوية عالية',
      context: { goals: sampleGoals } as any,
    });
    const card = new ProposalCardHarness(orchRes.taskProposal!);
    const [res1, res2] = await Promise.all([card.confirm(), card.confirm()]);
    assert((res1 && !res2) || (!res1 && res2), 'Synchronous lock allowed exactly one confirmation');
    assert(useTaskStore.getState().tasks.length === 1, 'Store contains exactly 1 task');
  }

  console.log('\n--- 12. Stale/deleted goal safety: never persists nonexistent goalId ---');
  {
    resetStorage();
    // Start with proposal linked to goal-book-3
    const proposal: TaskActionProposal = {
      id: 'test-stale-prop',
      title: 'Draft Chapter 1',
      priority: 'high',
      date: '2026-09-21',
      goalId: 'goal-book-3',
      goalTitle: 'Book Writing',
      status: 'pending',
    };
    // Delete goal-book-3 from goalStore before confirmation
    useGoalStore.setState({
      goals: sampleGoals.filter((g) => g.id !== 'goal-book-3'),
    });

    const card = new ProposalCardHarness(proposal);
    const confirmed = await card.confirm();
    assert(confirmed === true, 'Confirmation succeeded even with deleted goal');
    const tasks = useTaskStore.getState().tasks;
    assert(tasks.length === 1, 'Task was created');
    assert(tasks[0].title === 'Draft Chapter 1', 'Task title correct');
    assert(tasks[0].goalId === undefined, `Stale goalId discarded safely (got ${tasks[0].goalId})`);
  }

  console.log('\n--- 13. Navigation commands remain navigation commands ---');
  {
    const nav1 = parseCommand('المخطط', sampleGoals);
    assert(nav1.isCommand === true && nav1.command?.action === 'navigate' && nav1.command?.targetRoute === 'planner', 'Nav to planner');
    const nav2 = parseCommand('افتح الاهداف', sampleGoals);
    assert(nav2.isCommand === true && nav2.command?.action === 'navigate' && nav2.command?.targetRoute === 'goals', 'Nav to goals');
  }

  console.log('\n--- 14. Conversational messages remain conversational ---');
  {
    const conv1 = parseCommand('صباح الخير يا نوفو', sampleGoals);
    assert(conv1.isCommand === false, 'Morning greeting is not a command');
    const conv2 = parseCommand('عندي مهام كتير ومحتاج اتكلم معاك', sampleGoals);
    assert(conv2.isCommand === false, 'Conversational task expression is not a command');
  }

  console.log(`\n========================================`);
  console.log(`TOTAL PASS: ${passCount}`);
  console.log(`TOTAL FAIL: ${failCount}`);
  console.log(`========================================\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Test run failed with error:', e);
  process.exit(1);
});
