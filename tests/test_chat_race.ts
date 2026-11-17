import './test_env.ts';
import { useChatStore } from './src/core/state/chatStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { aiOrchestrator } from './src/core/ai/aiOrchestrator';
import { aiProviderRegistry, AIProvider } from './src/core/ai/aiProvider';
import { AIResponse, AIRequestOptions } from './src/core/ai/aiTypes';
import { buildNOVOContext } from './src/core/intelligence/contextEngine';

// --- TEST UTILS ---
let passedAll = true;
function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    passedAll = false;
  } else {
    console.log(`[PASS] ${msg}`);
  }
}

// --- MOCK AI PROVIDER FOR DEFERRED PROMISE CONTROL ---
let deferredResolve: ((res: AIResponse) => void) | null = null;
let deferredReject: ((err: any) => void) | null = null;
let aiIsPending = false;

class ControlledMockProvider implements AIProvider {
  id = 'mock-provider';
  name = 'Mock Controlled Provider';
  providerType = 'local' as any;
  supportedModels = ['mock-model'];

  isAvailable() { return true; }

  async generateResponse(
    prompt: string,
    context: any,
    options?: AIRequestOptions
  ): Promise<AIResponse> {
    aiIsPending = true;
    return new Promise((resolve, reject) => {
      deferredResolve = (res: AIResponse) => {
        aiIsPending = false;
        resolve(res);
      };
      deferredReject = (err: any) => {
        aiIsPending = false;
        reject(err);
      };
    });
  }
}

aiProviderRegistry.register(new ControlledMockProvider());

// --- PRODUCTION CLOSURE REPLICA ---
async function simulatedHookSubmitMessage(message: string, contextMock: any) {
    const trimmed = message.trim();
    if (!trimmed) return;
    
    const state = useChatStore.getState();
    const sendMessage = state.sendMessage;

    const originConvId = await sendMessage(trimmed, 'user');

    const result = await aiOrchestrator.orchestrate({
      message: trimmed,
      context: contextMock,
      language: 'en',
    });

    if (result.aiResponse) {
        await sendMessage(result.aiResponse.text, 'assistant', originConvId);
    }
    if (result.error) {
        await sendMessage(JSON.stringify(result.error), 'system', originConvId);
    }
    
    return result;
}

// Helper to start the promise and keep it pending
async function startSubmit(message: string) {
    const ctx = buildNOVOContext({ tasks: [], goals: [], notes: [], sessions: [], transactions: [] });
    return simulatedHookSubmitMessage(message, ctx);
}

async function runTests() {
  console.log("=== CHAT TAB SWITCH RACE TEST HARDENING ===");

  // Reset store
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    status: 'idle',
    error: null,
    lastUpdated: null,
  });

  RepositoryFactory.getChatRepository = () => ({
    getAll: async () => [], getActiveChatId: async () => null,
    saveActiveChatId: async () => {}, create: async () => {},
    update: async () => {}, delete: async () => {},
  } as any);

  await useChatStore.getState().initialize();

  // ---------------------------------------------------------
  // CHAT-RACE-01: A -> switch B -> resolve AI -> remains in A
  // ---------------------------------------------------------
  await useChatStore.getState().createConversation('Conv A', 'Hello A');
  const convAId = useChatStore.getState().activeConversationId!;
  
  const promiseA = startSubmit("Req 1");
  await new Promise(r => setTimeout(r, 0));
  assert(aiIsPending, "CHAT-RACE-01: AI Promise is pending");
  
  await useChatStore.getState().createConversation('Conv B', 'Hello B');
  const convBId = useChatStore.getState().activeConversationId!;
  assert(convAId !== convBId, "CHAT-RACE-01: activeConversationId switched to B");
  
  deferredResolve!({ text: "Res 1" });
  await promiseA;
  
  const finalState1 = useChatStore.getState();
  const finalA1 = finalState1.conversations.find(c => c.id === convAId)!;
  const finalB1 = finalState1.conversations.find(c => c.id === convBId)!;
  
  assert(finalA1.messages.length === 3, "CHAT-RACE-01: Conv A has 3 messages (init + req + res)");
  assert(finalA1.messages[2].content === "Res 1", "CHAT-RACE-01: Response routed correctly to A");
  assert(finalB1.messages.length === 1, "CHAT-RACE-01: Conv B has 1 message (init only)");

  // ---------------------------------------------------------
  // CHAT-RACE-02: A -> switch B -> switch C -> resolve -> remains in A
  // ---------------------------------------------------------
  await useChatStore.getState().selectConversation(convAId);
  const promiseA2 = startSubmit("Req 2");
  await new Promise(r => setTimeout(r, 0));
  assert(aiIsPending, "CHAT-RACE-02: AI Promise pending");
  
  await useChatStore.getState().selectConversation(convBId);
  await useChatStore.getState().createConversation('Conv C', 'Hello C');
  const convCId = useChatStore.getState().activeConversationId!;
  
  deferredResolve!({ text: "Res 2" });
  await promiseA2;
  
  const finalState2 = useChatStore.getState();
  const finalA2 = finalState2.conversations.find(c => c.id === convAId)!;
  const finalC2 = finalState2.conversations.find(c => c.id === convCId)!;
  
  assert(finalA2.messages.length === 5, "CHAT-RACE-02: Response routed correctly to A despite multiple switches");
  assert(finalC2.messages.length === 1, "CHAT-RACE-02: Conv C unaffected");

  // ---------------------------------------------------------
  // CHAT-RACE-03: Overlapping async requests
  // ---------------------------------------------------------
  await useChatStore.getState().selectConversation(convAId);
  const promiseA3 = startSubmit("Overlap A");
  await new Promise(r => setTimeout(r, 0));
  const resolveA3 = deferredResolve!;
  
  await useChatStore.getState().selectConversation(convBId);
  const promiseB3 = startSubmit("Overlap B");
  await new Promise(r => setTimeout(r, 0));
  const resolveB3 = deferredResolve!;
  
  resolveB3({ text: "Res Overlap B" });
  await promiseB3;
  
  resolveA3({ text: "Res Overlap A" });
  await promiseA3;
  
  const finalState3 = useChatStore.getState();
  const finalA3 = finalState3.conversations.find(c => c.id === convAId)!;
  const finalB3 = finalState3.conversations.find(c => c.id === convBId)!;
  
  assert(finalA3.messages[finalA3.messages.length-1].content === "Res Overlap A", "CHAT-RACE-03: Overlap A routed to A");
  assert(finalB3.messages[finalB3.messages.length-1].content === "Res Overlap B", "CHAT-RACE-03: Overlap B routed to B");

  // ---------------------------------------------------------
  // CHAT-RACE-04: Deleted before resolve
  // ---------------------------------------------------------
  await useChatStore.getState().selectConversation(convBId);
  const promiseB4 = startSubmit("Req 4");
  await new Promise(r => setTimeout(r, 0));
  
  await useChatStore.getState().deleteConversation(convBId);
  
  deferredResolve!({ text: "Res 4" });
  await promiseB4;
  
  const finalState4 = useChatStore.getState();
  assert(!finalState4.conversations.some(c => c.id === convBId), "CHAT-RACE-04: Conv B was not resurrected");

  // ---------------------------------------------------------
  // CHAT-RACE-05: Asynchronous failure
  // ---------------------------------------------------------
  await useChatStore.getState().createConversation('Conv D', 'Hello D');
  const convDId = useChatStore.getState().activeConversationId!;
  
  const promiseD = startSubmit("Req 5 (fail)");
  await new Promise(r => setTimeout(r, 0));
  
  await useChatStore.getState().createConversation('Conv E', 'Hello E');
  
  deferredReject!(new Error("Async Error"));
  await promiseD;
  
  const finalState5 = useChatStore.getState();
  const finalD = finalState5.conversations.find(c => c.id === convDId)!;
  
  assert(finalD.messages[finalD.messages.length-1].role === 'system', "CHAT-RACE-05: Error routed correctly to originating conv");
  assert(finalD.messages[finalD.messages.length-1].content.includes('REQUEST_FAILED'), "CHAT-RACE-05: Error message contains exact error");

  if (passedAll) {
    console.log("=== ALL ASYNC RACE TESTS PASSED ===");
    process.exit(0);
  } else {
    console.log("=== SOME TESTS FAILED ===");
    process.exit(1);
  }
}

runTests();
