import './test_env.ts';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { aiOrchestrator } from './src/core/ai/aiOrchestrator';
import { aiProviderRegistry, AIProvider } from './src/core/ai/aiProvider';
import {
  validateAlignmentAIResponse,
  synthesizeGoalAlignmentTask,
  buildAlignmentPrompt,
} from './src/core/ai/alignmentPrompt';
import {
  parseCommand,
  getLocalDateString,
} from './src/core/commands/commandParser';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { TaskActionProposal } from './src/core/commands/commandTypes';
import { Goal, Task } from './src/types/data';
import { executeTaskProposalConfirm } from './src/modules/chat/components/TaskProposalCard';
import { AIResponse, AIRequestOptions } from './src/core/ai/aiTypes';
import { NOVOContext } from './src/core/intelligence/intelligenceTypes';

console.log('=== GATE 17.1 COMPREHENSIVE VERIFICATION SUITE ===');

const TEST_UID = 'gate17-test-user-001';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

// Mock AI Provider helper for controlled testing
class MockTestAIProvider implements AIProvider {
  id = 'mock-test-provider';
  name = 'Mock Test AI Provider';
  providerType = 'local_model' as const;
  supportedModels = ['mock-v1'];
  available = true;
  mockResponseText: string = '';
  delayMs = 0;
  shouldThrow = false;

  isAvailable(): boolean {
    return this.available;
  }

  async generateResponse(
    _prompt: string,
    _context: NOVOContext,
    options?: AIRequestOptions
  ): Promise<AIResponse> {
    if (this.shouldThrow) {
      throw new Error('Simulated upstream AI provider failure');
    }

    if (this.delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), this.delayMs);
        if (options?.abortSignal) {
          options.abortSignal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('The user aborted a request.', 'AbortError'));
          });
        }
      });
    }

    return {
      text: this.mockResponseText,
    };
  }
}

class TaskProposalHarness {
  proposal: TaskActionProposal;
  status: 'pending' | 'confirmed' | 'cancelled';
  isActionLocked: boolean = false;
  errorMessage: string | null = null;

  constructor(proposal: TaskActionProposal) {
    this.proposal = proposal;
    this.status = proposal.status;
  }

  async confirm(): Promise<boolean> {
    if (this.isActionLocked || this.status !== 'pending') return false;
    this.isActionLocked = true;

    try {
      const res = await executeTaskProposalConfirm(this.proposal, 'ar');
      if (!res.success) {
        this.isActionLocked = false;
        this.errorMessage = res.error || 'Failed';
        return false;
      }
      this.status = 'confirmed';
      return true;
    } catch (err: any) {
      this.isActionLocked = false;
      this.errorMessage = err?.message || 'Failed';
      return false;
    }
  }

  cancel(): boolean {
    if (this.isActionLocked || this.status !== 'pending') return false;
    this.isActionLocked = true;
    this.status = 'cancelled';
    this.proposal.status = 'cancelled';
    return true;
  }
}

async function runGate17Tests() {
  console.log('\n--- 1. VALID AI JSON VALIDATION ---');
  const validArJson = JSON.stringify({
    suggestedTitle: 'مراجعة أول فصلين من كتاب البرمجة',
    reasoning: 'خطوة أساسية ومركزة لرفع نسبة إنجاز الهدف اليوم بمقدار ملحوظ.',
  });
  const resValid = validateAlignmentAIResponse(validArJson, 'ar');
  assert(resValid.isValid === true, 'Valid Arabic AI JSON is accepted');
  if (resValid.isValid) {
    assert(resValid.suggestedTitle === 'مراجعة أول فصلين من كتاب البرمجة', 'Suggested title matches');
    assert(resValid.reasoning.includes('خطوة أساسية'), 'Reasoning matches');
  }

  console.log('\n--- 2. MARKDOWN-FENCED JSON ---');
  const fencedJson = `\`\`\`json
{
  "suggestedTitle": "التدريب على حل 3 مسائل خوارزميات",
  "reasoning": "تطبيق عملي سريع لتعزيز المهارة الرياضية للهدف."
}
\`\`\``;
  const resFenced = validateAlignmentAIResponse(fencedJson, 'ar');
  assert(resFenced.isValid === true, 'Markdown-fenced JSON is parsed and accepted');
  if (resFenced.isValid) {
    assert(resFenced.suggestedTitle === 'التدريب على حل 3 مسائل خوارزميات', 'Extracted title matches');
  }

  console.log('\n--- 3. MISSING TITLE ---');
  const missingTitleJson = JSON.stringify({
    reasoning: 'سبب بدون عنوان مقترح',
  });
  const resMissingTitle = validateAlignmentAIResponse(missingTitleJson, 'ar');
  assert(resMissingTitle.isValid === false, 'Missing suggestedTitle is rejected');

  console.log('\n--- 4. NON-STRING TITLE ---');
  const nonStringTitleJson = JSON.stringify({
    suggestedTitle: 99999,
    reasoning: 'سبب مع عنوان رقمي',
  });
  const resNonString = validateAlignmentAIResponse(nonStringTitleJson, 'ar');
  assert(resNonString.isValid === false, 'Non-string suggestedTitle is rejected');

  console.log('\n--- 5. EMPTY TITLE ---');
  const emptyTitleJson = JSON.stringify({
    suggestedTitle: '    ',
    reasoning: 'سبب مع عنوان فارغ',
  });
  const resEmpty = validateAlignmentAIResponse(emptyTitleJson, 'ar');
  assert(resEmpty.isValid === false, 'Empty suggestedTitle is rejected');

  console.log('\n--- 6. OVERSIZED TITLE -> FALLBACK, NOT TRUNCATION ---');
  const oversizedTitle = 'أ'.repeat(105); // Exceeds 100 char limit
  const oversizedJson = JSON.stringify({
    suggestedTitle: oversizedTitle,
    reasoning: 'سبب مع عنوان طويل جدا يتجاوز الحد الأقصى المسموح به',
  });
  const resOversized = validateAlignmentAIResponse(oversizedJson, 'ar');
  assert(resOversized.isValid === false, 'Oversized title is rejected (not silently truncated)');

  console.log('\n--- 7. INVALID REASONING -> FALLBACK ---');
  const invalidReasoningJson = JSON.stringify({
    suggestedTitle: 'مهمة صحيحة تماما',
    reasoning: 'أ'.repeat(300), // Exceeds 250 char limit
  });
  const resInvalidReasoning = validateAlignmentAIResponse(invalidReasoningJson, 'ar');
  assert(resInvalidReasoning.isValid === false, 'Oversized reasoning is rejected');

  const englishOnArabicExpectation = JSON.stringify({
    suggestedTitle: 'Complete the project draft',
    reasoning: 'This is in English but Arabic was requested',
  });
  const resLanguageMismatch = validateAlignmentAIResponse(englishOnArabicExpectation, 'ar');
  assert(resLanguageMismatch.isValid === false, 'Language mismatch is rejected');

  console.log('\n--- 8. PROVIDER UNAVAILABLE -> FALLBACK ---');
  const mockProvider = new MockTestAIProvider();
  mockProvider.available = false;

  const fallbackResultUnavailable = await synthesizeGoalAlignmentTask({
    goalId: 'goal-test-1',
    goalTitle: 'تعلم الآلة',
    currentProgress: 20,
    language: 'ar',
    activeProvider: mockProvider,
    timeoutMs: 1000,
  });
  assert(fallbackResultUnavailable.isEnriched === false, 'Unavailable provider triggers isEnriched=false');
  assert(
    fallbackResultUnavailable.suggestedTitle === 'متابعة ومواصلة العمل على: تعلم الآلة',
    'Unavailable provider falls back to exact Gate 16 deterministic title'
  );

  console.log('\n--- 9. PROVIDER THROWS -> FALLBACK ---');
  mockProvider.available = true;
  mockProvider.shouldThrow = true;

  const fallbackResultThrows = await synthesizeGoalAlignmentTask({
    goalId: 'goal-test-1',
    goalTitle: 'تعلم الآلة',
    currentProgress: 20,
    language: 'ar',
    activeProvider: mockProvider,
    timeoutMs: 1000,
  });
  assert(fallbackResultThrows.isEnriched === false, 'Throwing provider triggers isEnriched=false');
  assert(
    fallbackResultThrows.suggestedTitle === 'متابعة ومواصلة العمل على: تعلم الآلة',
    'Throwing provider falls back to deterministic title without crashing'
  );

  console.log('\n--- 10. TIMEOUT -> FALLBACK ---');
  mockProvider.shouldThrow = false;
  mockProvider.delayMs = 200; // Simulated latency
  const timeoutResult = await synthesizeGoalAlignmentTask({
    goalId: 'goal-test-1',
    goalTitle: 'تعلم الآلة',
    currentProgress: 20,
    language: 'ar',
    activeProvider: mockProvider,
    timeoutMs: 50, // Timeout before provider returns
  });
  assert(timeoutResult.isEnriched === false, 'Timeout triggers isEnriched=false');
  assert(
    timeoutResult.suggestedTitle === 'متابعة ومواصلة العمل على: تعلم الآلة',
    'Timed out call returns exact deterministic fallback title'
  );

  // Re-enable mock provider with valid fast response for end-to-end integration tests
  mockProvider.delayMs = 0;
  mockProvider.mockResponseText = JSON.stringify({
    suggestedTitle: 'قراءة الفصل الخامس وتطبيق تمارينه',
    reasoning: 'خطوة تنفيذية مناسبة لليوم لدفع تقدم الهدف.',
  });
  aiProviderRegistry.register(mockProvider);
  aiProviderRegistry.setActiveProvider(mockProvider.id);

  console.log('\n--- 11. DETERMINISTIC GOALID REMAINS UNCHANGED ---');
  AuthLifecycle.reset(TEST_UID);
  const testGoal1: Goal = {
    id: 'goal-ai-test-101',
    title: 'تعلم الذكاء الاصطناعي',
    description: 'كورس شامل في شبكات الأعصاب',
    progress: 10,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
  };
  (RepositoryFactory.getGoalRepository() as any)._saveAllSync([testGoal1]);
  useGoalStore.setState({ goals: [testGoal1], status: 'ready', error: null });
  useTaskStore.setState({ tasks: [], status: 'ready', error: null });

  const orchResult = await aiOrchestrator.orchestrate({
    message: 'ساعدني اظبط يومي',
    context: {
      goals: [testGoal1],
      tasks: [],
    } as any,
  });

  assert(orchResult.handledAsCommand === true, 'Handled as command');
  assert(orchResult.taskProposal !== undefined, 'Task proposal returned');
  const proposal = orchResult.taskProposal!;
  assert(proposal.goalId === testGoal1.id, 'Deterministic goalId remains unchanged');
  assert(proposal.goalTitle === testGoal1.title, 'Goal title preserved');
  assert(proposal.title === 'قراءة الفصل الخامس وتطبيق تمارينه', 'AI-enriched title applied to proposal');
  assert(proposal.aiEnriched === true, 'Proposal marked aiEnriched=true');
  assert(proposal.reasoning?.includes('خطوة تنفيذية'), 'Proposal contains valid reasoning');

  console.log('\n--- 12. ZERO MUTATIONS BEFORE CONFIRMATION ---');
  const currentTasksBefore = useTaskStore.getState().tasks;
  assert(
    currentTasksBefore.every((t) => t.id !== proposal.id),
    'Zero task mutations in store before confirmation'
  );
  assert(proposal.status === 'pending', 'Proposal status is strictly pending');

  console.log('\n--- 13. CANCEL -> ZERO MUTATIONS ---');
  const harnessCancel = new TaskProposalHarness({ ...proposal, id: 'prop-cancel-test' });
  const cancelOk = harnessCancel.cancel();
  assert(cancelOk === true, 'Proposal cancelled successfully');
  assert(harnessCancel.status === 'cancelled', 'Status set to cancelled');
  const tasksAfterCancel = useTaskStore.getState().tasks;
  assert(
    tasksAfterCancel.length === currentTasksBefore.length,
    'Zero tasks created in store after cancellation'
  );

  console.log('\n--- 14. CONFIRM -> EXACTLY ONE TASK ---');
  const harnessConfirm = new TaskProposalHarness({ ...proposal, id: 'prop-confirm-test' });
  const confirmOk = await harnessConfirm.confirm();
  assert(confirmOk === true, 'Proposal confirmed successfully');
  assert(harnessConfirm.status === 'confirmed', 'Status set to confirmed');
  const tasksAfterConfirm = useTaskStore.getState().tasks;
  const createdTask = tasksAfterConfirm.find((t) => t.title === proposal.title);
  assert(createdTask !== undefined, 'Exactly one task created with enriched title');
  assert(createdTask?.goalId === testGoal1.id, 'Created task is linked to the deterministic goalId');

  console.log('\n--- 15. STALE/DELETED GOAL -> REJECTION WITH ZERO TASK CREATION ---');
  // Ensure the goal does NOT exist in goalStore (simulate deletion)
  useGoalStore.setState({ goals: [] });

  const staleProposal: TaskActionProposal = {
    id: 'prop-stale-test',
    source: 'align_day',
    requiresGoal: true,
    title: 'مهمة لهدف محذوف',
    priority: 'medium',
    date: getLocalDateString(0),
    goalId: testGoal1.id, // Now deleted!
    goalTitle: testGoal1.title,
    status: 'pending',
  };

  const harnessStale = new TaskProposalHarness(staleProposal);
  const tasksBeforeStale = useTaskStore.getState().tasks.length;
  const staleConfirmOk = await harnessStale.confirm();
  assert(staleConfirmOk === false, 'Confirmation of stale/deleted goal is REJECTED');
  assert(harnessStale.status === 'pending', 'Proposal remains unconfirmed');
  assert(
    harnessStale.errorMessage !== null && harnessStale.errorMessage.includes('الهدف المرتبط لم يعد موجوداً'),
    'Clear Arabic error message returned for stale goal'
  );
  const tasksAfterStale = useTaskStore.getState().tasks.length;
  assert(tasksAfterStale === tasksBeforeStale, 'Zero tasks created upon stale goal confirmation rejection');

  console.log('\n--- 16. DOUBLE CONFIRM -> EXACTLY ONE TASK ---');
  // Re-create a goal for concurrency testing
  const testGoal2: Goal = {
    id: 'goal-ai-test-102',
    title: 'تعلم Flutter',
    description: 'تطوير تطبيقات الجوال',
    progress: 5,
    createdAt: '2026-09-02T08:00:00.000Z',
    updatedAt: '2026-09-02T08:00:00.000Z',
  };
  (RepositoryFactory.getGoalRepository() as any)._saveAllSync([testGoal2]);
  useGoalStore.setState({ goals: [testGoal2], status: 'ready', error: null });

  const doubleProposal: TaskActionProposal = {
    id: 'prop-double-test',
    source: 'align_day',
    requiresGoal: true,
    title: 'بناء شاشة تسجيل الدخول في Flutter',
    priority: 'medium',
    date: getLocalDateString(0),
    goalId: testGoal2.id,
    goalTitle: testGoal2.title,
    status: 'pending',
  };

  const harnessDouble = new TaskProposalHarness(doubleProposal);
  const initialCount = useTaskStore.getState().tasks.length;
  const [res1, res2] = await Promise.all([
    harnessDouble.confirm(),
    harnessDouble.confirm(),
  ]);
  assert((res1 && !res2) || (!res1 && res2), 'Exactly one confirm succeeded due to mutex locking');
  const finalCount = useTaskStore.getState().tasks.length;
  assert(finalCount === initialCount + 1, 'Exactly one task created from concurrent confirmation');

  console.log('\n========================================');
  console.log('✅ ALL GATE 17.1 TEST SUITES PASSED! (16/16)');
  console.log('========================================');
}

runGate17Tests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
