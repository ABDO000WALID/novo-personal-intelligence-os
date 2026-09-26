import './test_env.ts';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { aiOrchestrator } from './src/core/ai/aiOrchestrator';
import { parseCommand } from './src/core/commands/commandParser';
import { useTaskStore } from './src/core/state/taskStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { TaskActionProposal } from './src/core/commands/commandTypes';

console.log("=== GATE 13 SAFETY & CONFIRMATION VERIFICATION ===");

const TEST_UID = 'gate13-test-user-001';

function resetStorage() {
  AuthLifecycle.reset(TEST_UID);
  (RepositoryFactory.getTaskRepository() as any)._saveAllSync([]);
  useTaskStore.setState({ tasks: [], status: 'ready', error: null });
}

// Emulates the exact TaskProposalCard execution logic & synchronous lock
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
      await useTaskStore.getState().createTask(
        this.proposal.title,
        this.proposal.priority,
        this.proposal.date
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

async function runAllSafetyTests() {
  let passed = true;

  // B. PROPOSAL SAFETY
  console.log("\n--- B. PROPOSAL SAFETY ---");
  resetStorage();

  const mockContext: any = {
    user: { id: TEST_UID, name: 'User' },
    activeTasks: [],
    goals: [],
    recentNotes: [],
    summary: 'Context'
  };

  const parsed = parseCommand('اضف مهمه مراجعه ملف الضرائب اولويه عاليه بكره');
  if (!parsed.isCommand || !parsed.command?.taskPayload) {
    console.error("FAIL: B1 - parseCommand failed to return task command");
    passed = false;
  } else {
    console.log("PASS: B1 - parseCommand creates proposal payload only");
  }

  const orchResult = await aiOrchestrator.orchestrate({
    message: 'اضف مهمه مراجعه ملف الضرائب اولويه عاليه بكره',
    context: mockContext,
    language: 'ar'
  });

  const tasksAfterOrch = useTaskStore.getState().tasks;
  const repoTasksAfterOrch = await RepositoryFactory.getTaskRepository().getAll();

  if (tasksAfterOrch.length !== 0 || repoTasksAfterOrch.length !== 0) {
    console.error("FAIL: B2 & B3 - Orchestration mutated taskStore/repo before confirmation!", tasksAfterOrch);
    passed = false;
  } else {
    console.log("PASS: B2 & B3 - Orchestration created ZERO tasks in state and repo");
  }

  if (orchResult.taskProposal?.status !== 'pending') {
    console.error("FAIL: B4 - Proposal status is not 'pending':", orchResult.taskProposal?.status);
    passed = false;
  } else {
    console.log("PASS: B4 - Proposal status starts as 'pending'");
  }

  // C. CONFIRMATION
  console.log("\n--- C. CONFIRMATION ---");
  resetStorage();

  const proposalC: TaskActionProposal = {
    id: 'prop-c-1',
    title: 'انهاء تقرير المبيعات',
    priority: 'high',
    date: '2026-09-22',
    status: 'pending'
  };

  const harnessC = new ProposalCardHarness(proposalC);
  const confirmResult1 = await harnessC.confirm();

  const tasksC = useTaskStore.getState().tasks;
  const repoTasksC = await RepositoryFactory.getTaskRepository().getAll();

  if (!confirmResult1 || tasksC.length !== 1 || repoTasksC.length !== 1) {
    console.error("FAIL: C1 - Confirm did not create exactly one task", tasksC);
    passed = false;
  } else {
    console.log("PASS: C1 - Confirm created exactly ONE task in store and repository");
  }

  const createdTask = tasksC[0];
  if (createdTask.title !== 'انهاء تقرير المبيعات') {
    console.error("FAIL: C2 - Title mismatch:", createdTask.title);
    passed = false;
  } else {
    console.log("PASS: C2 - Task title is exact ('انهاء تقرير المبيعات')");
  }

  if (createdTask.priority !== 'high') {
    console.error("FAIL: C3 - Priority mismatch:", createdTask.priority);
    passed = false;
  } else {
    console.log("PASS: C3 - Task priority is exact ('high')");
  }

  if (createdTask.date !== '2026-09-22') {
    console.error("FAIL: C4 - Date mismatch:", createdTask.date);
    passed = false;
  } else {
    console.log("PASS: C4 - Task date is exact ('2026-09-22')");
  }

  // Repeated confirm on already confirmed proposal
  const confirmResult2 = await harnessC.confirm();
  const tasksCAfterRepeat = useTaskStore.getState().tasks;
  if (confirmResult2 !== false || tasksCAfterRepeat.length !== 1) {
    console.error("FAIL: C5 & C6 - Repeated confirm allowed or created duplicate task!", tasksCAfterRepeat);
    passed = false;
  } else {
    console.log("PASS: C5 & C6 - Confirmed proposal cannot execute again; repeated confirmation returned false and created ZERO additional tasks");
  }

  // D. CANCEL
  console.log("\n--- D. CANCEL ---");
  resetStorage();

  const proposalD: TaskActionProposal = {
    id: 'prop-d-1',
    title: 'مهمة سيتم الغاؤها',
    priority: 'low',
    date: '2026-09-21',
    status: 'pending'
  };

  const harnessD = new ProposalCardHarness(proposalD);
  const cancelRes = harnessD.cancel();

  const tasksD = useTaskStore.getState().tasks;
  if (!cancelRes || tasksD.length !== 0) {
    console.error("FAIL: D1 - Cancel created tasks or failed:", tasksD);
    passed = false;
  } else {
    console.log("PASS: D1 - Cancel created ZERO tasks");
  }

  // Attempt to confirm cancelled proposal
  const confirmCancelled = await harnessD.confirm();
  const tasksDAfterConfirm = useTaskStore.getState().tasks;
  if (confirmCancelled !== false || tasksDAfterConfirm.length !== 0) {
    console.error("FAIL: D2 - Cancelled proposal was confirmed!", tasksDAfterConfirm);
    passed = false;
  } else {
    console.log("PASS: D2 - Cancelled proposal cannot later create a task");
  }

  // E. DOUBLE-SUBMISSION / CONCURRENCY
  console.log("\n--- E. DOUBLE-SUBMISSION ---");
  resetStorage();

  const proposalE: TaskActionProposal = {
    id: 'prop-e-1',
    title: 'مهمة الضغط المتزامن',
    priority: 'medium',
    date: '2026-09-21',
    status: 'pending'
  };

  const harnessE = new ProposalCardHarness(proposalE);
  // Fire 10 rapid simultaneous confirm calls
  const resultsE = await Promise.all([
    harnessE.confirm(),
    harnessE.confirm(),
    harnessE.confirm(),
    harnessE.confirm(),
    harnessE.confirm(),
    harnessE.confirm(),
    harnessE.confirm(),
    harnessE.confirm(),
    harnessE.confirm(),
    harnessE.confirm(),
  ]);

  const tasksE = useTaskStore.getState().tasks;
  const repoTasksE = await RepositoryFactory.getTaskRepository().getAll();
  const successfulConfirms = resultsE.filter(r => r === true).length;

  if (tasksE.length !== 1 || repoTasksE.length !== 1 || successfulConfirms !== 1) {
    console.error("FAIL: E - Double submission guard failed! Tasks:", tasksE.length, "Successful confirms:", successfulConfirms);
    passed = false;
  } else {
    console.log("PASS: E - 10 rapid concurrent confirm events resulted in exactly ONE task created and exactly 1 true return");
  }

  // F. STALE PROPOSAL
  console.log("\n--- F. STALE PROPOSAL & MULTI-PROPOSAL ISOLATION ---");
  resetStorage();

  const proposalA: TaskActionProposal = {
    id: 'prop-a',
    title: 'المهمة أ',
    priority: 'low',
    date: '2026-09-21',
    status: 'pending'
  };
  const proposalB: TaskActionProposal = {
    id: 'prop-b',
    title: 'المهمة ب',
    priority: 'high',
    date: '2026-09-23',
    status: 'pending'
  };

  const harnessA = new ProposalCardHarness(proposalA);
  const harnessB = new ProposalCardHarness(proposalB);

  // Confirm B first
  await harnessB.confirm();
  let tasksF = useTaskStore.getState().tasks;
  if (tasksF.length !== 1 || tasksF[0].title !== 'المهمة ب' || tasksF[0].priority !== 'high') {
    console.error("FAIL: F - Confirming B affected wrong task context", tasksF);
    passed = false;
  } else {
    console.log("PASS: F1 - Confirming B creates only B");
  }

  // Now confirm A
  await harnessA.confirm();
  tasksF = useTaskStore.getState().tasks;
  if (tasksF.length !== 2) {
    console.error("FAIL: F - Confirming A did not yield 2 tasks total", tasksF);
    passed = false;
  } else {
    const titles = tasksF.map(t => t.title).sort();
    if (titles[0] !== 'المهمة أ' || titles[1] !== 'المهمة ب') {
      console.error("FAIL: F - Task titles mismatch:", titles);
      passed = false;
    } else {
      console.log("PASS: F2 - Confirming A and B sequentially maintains exact isolated context without collisions or duplicates");
    }
  }

  if (!passed) {
    console.error("\nONE OR MORE SAFETY VERIFICATIONS FAILED!");
    process.exit(1);
  } else {
    console.log("\nALL PROPOSAL, CONFIRMATION, CANCEL, DOUBLE-SUBMISSION & STALE PROPOSAL TESTS PASSED!");
  }
}

runAllSafetyTests().catch(e => {
  console.error("Uncaught error:", e);
  process.exit(1);
});
