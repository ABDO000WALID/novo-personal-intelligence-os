import './test_env.ts';
import { parseCommand, getLocalDateString } from './src/core/commands/commandParser';
import { aiOrchestrator } from './src/core/ai/aiOrchestrator';
import { aiProviderRegistry, AIProvider } from './src/core/ai/aiProvider';
import { AIResponse, AIRequestOptions } from './src/core/ai/aiTypes';
import { useGoalStore } from './src/core/state/goalStore';
import { useTaskStore } from './src/core/state/taskStore';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { NOVOContext } from './src/core/intelligence/intelligenceTypes';
import { buildNOVOContext } from './src/core/intelligence/contextEngine';
import {
  isPlausiblyActionShaped,
  validateConversationalIntentResponse,
} from './src/core/ai/conversationalIntent';

function createMockContext(): NOVOContext {
  return buildNOVOContext({
    tasks: [],
    goals: [],
    notes: [],
    sessions: [],
    transactions: [],
  });
}

// Controllable Mock AI Provider for Gate 18.2 Testing
class ControllableIntentProvider implements AIProvider {
  id = 'gate18_2_mock_provider';
  name = 'Gate 18.2 Mock Provider';
  providerType = 'local' as any;
  supportedModels = ['mock-intent-model'];

  public lastPrompt: string = '';
  public lastSystemInstruction: string = '';
  public callCount: number = 0;
  public mockResponseGenerator: ((prompt: string, systemInstruction?: string) => string | Error) | null = null;

  isAvailable() {
    return true;
  }

  async generateResponse(
    prompt: string,
    context: any,
    options?: AIRequestOptions
  ): Promise<AIResponse> {
    this.callCount++;
    this.lastPrompt = prompt;
    this.lastSystemInstruction = options?.systemInstruction || '';

    if (this.mockResponseGenerator) {
      const res = this.mockResponseGenerator(prompt, options?.systemInstruction);
      if (res instanceof Error) {
        throw res;
      }
      return { text: res };
    }

    return { text: 'مرحباً، أنا المساعد الذكي NOVO.' };
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING GATE 18.2 COMPREHENSIVE VERIFICATION SUITE');
  console.log('====================================================\n');

  AuthLifecycle.reset('test-user-gate-18-2');
  useTaskStore.setState({ tasks: [], status: 'ready', error: null });
  useGoalStore.setState({ goals: [], status: 'ready', error: null });

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

  const mockProvider = new ControllableIntentProvider();
  aiProviderRegistry.register(mockProvider);
  aiProviderRegistry.setActiveProvider(mockProvider.id);

  const context = createMockContext();

  // --------------------------------------------------------------------------
  // SECTION 1: DETERMINISTIC COMMANDS (GATE 18.1) BYPASS CLASSIFIER COMPLETELY
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Deterministic Command Precedence ---');

  mockProvider.callCount = 0;
  const detGoal = await aiOrchestrator.orchestrate({
    message: 'عايز أحط هدف أتعلم React',
    context,
    language: 'ar',
  });
  assert(detGoal.handledAsCommand === true, '1.1a. "عايز أحط هدف أتعلم React" is handled as command');
  assert(!!detGoal.goalProposal, '1.1b. Emits goalProposal deterministically');
  assert(mockProvider.callCount === 0, '1.1c. AI Provider call count is strictly ZERO (deterministic fast path)');

  mockProvider.callCount = 0;
  const detTask = await aiOrchestrator.orchestrate({
    message: 'فكرني أراجع التقرير بكرة',
    context,
    language: 'ar',
  });
  assert(detTask.handledAsCommand === true, '1.2a. "فكرني أراجع التقرير بكرة" is handled as command');
  assert(!!detTask.taskProposal, '1.2b. Emits taskProposal deterministically');
  assert(mockProvider.callCount === 0, '1.2c. AI Provider call count is strictly ZERO');

  mockProvider.callCount = 0;
  const detEn = await aiOrchestrator.orchestrate({
    message: 'Let\'s create a goal: Master TypeScript',
    context,
    language: 'en',
  });
  assert(detEn.handledAsCommand === true, '1.3a. English deterministic command handled');
  assert(!!detEn.goalProposal, '1.3b. Emits goalProposal');
  assert(mockProvider.callCount === 0, '1.3c. AI Provider call count is strictly ZERO');

  // --------------------------------------------------------------------------
  // SECTION 2: NARROW LOCAL HEURISTIC (isPlausiblyActionShaped)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Narrow Local Heuristic Validation ---');

  const falseCases = [
    'إزاي أضيف مهمة؟',
    'إزاي اضيف مهمة',
    'كيف اضيف هدف؟',
    'هل الأفضل أعمل هدف لتعلم React؟',
    'أنا خلصت المهمة دي امبارح',
    'أنا مش عارف أبدأ المذاكرة منين',
    'how to add a task?',
    'how can I create a goal?',
    'Should I set a goal to learn React?',
    'I finished my task yesterday',
    'I do not know where to start studying',
    'صباح الخير',
    'شكراً لك',
    'What do you think of React?',
    'ما رأيك في الإنتاجية؟',
    'محتاج',
    'i need to',
  ];

  for (const c of falseCases) {
    const res = isPlausiblyActionShaped(c);
    assert(res === false, `2.1. Conversational query NOT action-shaped: "${c}"`);
  }

  const trueCases = [
    'محتاج أراجع كود الـ Auth قبل ما نعمل Deploy',
    'لازم أكلم المحامي بخصوص العقد الجديد بكرة',
    'المفروض أخلص السلايدز للاجتماع',
    'ناوي أبدأ اتعلم برمجة بايثون',
    'نفسي أعمل مشروع تطبيق موبايل جديد',
    'I need to review the Q3 budget deck by tomorrow',
    'I have to finish writing the unit tests',
    'I should call the doctor about the test results',
    'I plan to start learning Docker this month',
    'Gotta fix the bug in the payment gateway',
  ];

  for (const c of trueCases) {
    const res = isPlausiblyActionShaped(c);
    assert(res === true, `2.2. Plausibly action-shaped recognized: "${c}"`);
  }

  // --------------------------------------------------------------------------
  // SECTION 3: NORMAL CONVERSATION BYPASSES INTENT CLASSIFIER
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Normal Conversation Does Not Invoke Intent Classifier ---');

  for (const convMsg of ['إزاي أضيف مهمة؟', 'how to add a task?', 'صباح الخير']) {
    mockProvider.callCount = 0;
    mockProvider.mockResponseGenerator = () => 'هذا رد استشاري عادي للمستخدم.';

    const orchRes = await aiOrchestrator.orchestrate({
      message: convMsg,
      context,
      language: 'ar',
    });

    assert(orchRes.handledAsCommand === false, `3.1a. "${convMsg}" is not handled as command`);
    assert(!!orchRes.aiResponse, `3.1b. "${convMsg}" returns normal conversational aiResponse`);
    assert(mockProvider.callCount === 1, `3.1c. Only 1 general chat AI call was made (intent classifier was NOT invoked)`);
    assert(!mockProvider.lastSystemInstruction.includes('intent classifier'), `3.1d. Intent classifier prompt was NOT used`);
  }

  // --------------------------------------------------------------------------
  // SECTION 4: AI-ASSISTED INTENT CLASSIFICATION (TASK & GOAL PROPOSALS)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: AI Intent Classification (Task & Goal) ---');

  // 4.1: Task Intent
  mockProvider.callCount = 0;
  mockProvider.mockResponseGenerator = () => JSON.stringify({
    intent: 'create_task',
    confidence: 0.94,
    extractedTitle: 'مراجعة كود الـ Auth قبل ما نعمل Deploy',
    suggestedPriority: 'high',
    suggestedDate: 'tomorrow',
  });

  const taskRes = await aiOrchestrator.orchestrate({
    message: 'محتاج أراجع كود الـ Auth قبل ما نعمل Deploy بكرة',
    messageId: 'msg-task-1',
    context,
    language: 'ar',
  });

  assert(taskRes.handledAsCommand === true, '4.1a. Plausibly action-shaped message classified as command');
  assert(!!taskRes.taskProposal, '4.1b. Emits taskProposal');
  assert(taskRes.taskProposal?.status === 'pending', '4.1c. Proposal status is "pending"');
  assert(taskRes.taskProposal?.source === 'conversational_ai', '4.1d. Proposal source is "conversational_ai"');
  assert(taskRes.taskProposal?.priority === 'high', '4.1e. Task priority is "high"');
  assert(taskRes.taskProposal?.date === getLocalDateString(1), '4.1f. Date correctly parsed as tomorrow');
  assert(taskRes.taskProposal?.originatingMessageId === 'msg-task-1', '4.1g. originatingMessageId preserved');
  assert(taskRes.taskProposal?.title.includes('مراجعة كود الـ Auth'), '4.1h. Task title matches cleaned title');

  // 4.2: Goal Intent
  mockProvider.callCount = 0;
  mockProvider.mockResponseGenerator = () => JSON.stringify({
    intent: 'create_goal',
    confidence: 0.91,
    extractedTitle: 'تعلم لغة البرمجة Rust',
    suggestedPriority: 'medium',
  });

  const goalRes = await aiOrchestrator.orchestrate({
    message: 'ناوي أبدأ اتعلم لغة البرمجة Rust',
    messageId: 'msg-goal-1',
    context,
    language: 'ar',
  });

  assert(goalRes.handledAsCommand === true, '4.2a. Plausibly action-shaped goal classified as command');
  assert(!!goalRes.goalProposal, '4.2b. Emits goalProposal');
  assert(goalRes.goalProposal?.status === 'pending', '4.2c. Goal proposal status is "pending"');
  assert(goalRes.goalProposal?.initialProgress === 0, '4.2d. Goal proposal initialProgress is strictly 0');
  assert(goalRes.goalProposal?.originatingMessageId === 'msg-goal-1', '4.2e. originatingMessageId preserved');
  assert(goalRes.goalProposal?.title === 'تعلم لغة البرمجة Rust', '4.2f. Goal title matches clean title');

  // --------------------------------------------------------------------------
  // SECTION 5: FAIL-CLOSED BEHAVIOR ON MALFORMED / LOW-CONFIDENCE AI OUTPUT
  // --------------------------------------------------------------------------
  console.log('\n--- Section 5: Fail-Closed Protection ---');

  // 5.1: Low Confidence (< 0.75) -> Fail closed to normal conversation
  mockProvider.callCount = 0;
  let callIndex = 0;
  mockProvider.mockResponseGenerator = () => {
    callIndex++;
    if (callIndex === 1) {
      // Intent classification response: low confidence
      return JSON.stringify({
        intent: 'create_task',
        confidence: 0.55,
        extractedTitle: 'Something ambiguous',
      });
    }
    // Normal chat response fallback
    return 'هذا رد محادثة عام لأن النية غير مؤكدة.';
  };

  const lowConfRes = await aiOrchestrator.orchestrate({
    message: 'محتاج يمكن أعمل حاجة بعدين',
    context,
    language: 'ar',
  });

  assert(lowConfRes.handledAsCommand === false, '5.1a. Low-confidence output does NOT create command');
  assert(lowConfRes.taskProposal === undefined, '5.1b. ZERO taskProposal emitted');
  assert(lowConfRes.aiResponse?.text === 'هذا رد محادثة عام لأن النية غير مؤكدة.', '5.1c. Seamlessly fell back to standard conversational response');

  // 5.2: Intent = "none" -> Fail closed to normal conversation
  callIndex = 0;
  mockProvider.mockResponseGenerator = () => {
    callIndex++;
    if (callIndex === 1) {
      return JSON.stringify({
        intent: 'none',
        confidence: 0.95,
        extractedTitle: '',
      });
    }
    return 'سعيد بالتحدث معك!';
  };

  const noneRes = await aiOrchestrator.orchestrate({
    message: 'خطتي للمستقبل جميلة ومبهرة',
    context,
    language: 'ar',
  });

  assert(noneRes.handledAsCommand === false, '5.2a. Intent "none" does NOT create command');
  assert(noneRes.taskProposal === undefined && noneRes.goalProposal === undefined, '5.2b. ZERO proposals emitted');
  assert(noneRes.aiResponse?.text === 'سعيد بالتحدث معك!', '5.2c. Fell back to conversational response');

  // 5.3: Malformed JSON -> Fail closed
  callIndex = 0;
  mockProvider.mockResponseGenerator = () => {
    callIndex++;
    if (callIndex === 1) {
      return 'Definitely a task: do something!'; // Non-JSON
    }
    return 'رد بديل سليم.';
  };

  const malformedRes = await aiOrchestrator.orchestrate({
    message: 'لازم أسلم المشروع الأسبوع الجاي',
    context,
    language: 'ar',
  });

  assert(malformedRes.handledAsCommand === false, '5.3a. Malformed JSON does NOT create command');
  assert(malformedRes.taskProposal === undefined, '5.3b. ZERO proposals emitted on malformed JSON');
  assert(malformedRes.aiResponse?.text === 'رد بديل سليم.', '5.3c. Fell back to conversational response');

  // 5.4: AI Timeout -> Fail closed
  callIndex = 0;
  mockProvider.mockResponseGenerator = () => {
    callIndex++;
    if (callIndex === 1) {
      throw new Error('Classification call timed out');
    }
    return 'رد المحادثة بعد انتهاء وقت المصنف.';
  };

  const timeoutRes = await aiOrchestrator.orchestrate({
    message: 'المفروض أراجع الكود مع الفريق',
    context,
    language: 'ar',
  });

  assert(timeoutRes.handledAsCommand === false, '5.4a. Classifier timeout does NOT crash or create command');
  assert(timeoutRes.taskProposal === undefined, '5.4b. ZERO proposals emitted on timeout');
  assert(timeoutRes.aiResponse?.text === 'رد المحادثة بعد انتهاء وقت المصنف.', '5.4c. Fell back to standard response');

  // --------------------------------------------------------------------------
  // SECTION 6: CODE AUTHORITY & ZERO DIRECT MUTATION GUARANTEES
  // --------------------------------------------------------------------------
  console.log('\n--- Section 6: Code Authority & Zero Mutation Guarantees ---');

  const initialTasksCount = useTaskStore.getState().tasks.length;
  const initialGoalsCount = useGoalStore.getState().goals.length;

  mockProvider.mockResponseGenerator = () => JSON.stringify({
    intent: 'create_goal',
    confidence: 0.99,
    extractedTitle: 'قراءة 50 كتاب',
    initialProgress: 80, // Prohibited attempt by AI to alter initialProgress!
  });

  const codeAuthRes = await aiOrchestrator.orchestrate({
    message: 'هدفي قراءة 50 كتاب هذا العام',
    context,
    language: 'ar',
  });

  // Verify code authority overrides any AI-claimed progress
  assert(codeAuthRes.goalProposal?.initialProgress === 0, '6.1. Code enforces initialProgress === 0 (AI claim rejected)');

  // Verify ZERO store mutations took place upon proposal generation
  assert(useTaskStore.getState().tasks.length === initialTasksCount, '6.2a. Task store count is untouched (0 mutations)');
  assert(useGoalStore.getState().goals.length === initialGoalsCount, '6.2b. Goal store count is untouched (0 mutations)');

  // Verify that ONLY explicit user confirmation creates the item
  await useGoalStore.getState().createGoal(
    codeAuthRes.goalProposal!.title,
    codeAuthRes.goalProposal!.description || '',
    codeAuthRes.goalProposal!.initialProgress || 0
  );
  assert(useGoalStore.getState().goals.length === initialGoalsCount + 1, '6.3. User confirmation successfully creates exactly 1 goal');

  console.log('\n====================================================');
  console.log(`ALL ${passed} GATE 18.2 TESTS PASSED PERFECTLY!`);
  console.log('====================================================\n');
}

runTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
