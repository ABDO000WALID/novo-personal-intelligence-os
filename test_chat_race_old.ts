import './test_env.ts';
import { useChatStore } from './src/core/state/chatStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { aiOrchestrator } from './src/core/ai/aiOrchestrator';
import { aiProviderRegistry, AIProvider } from './src/core/ai/aiProvider';
import { AIResponse, AIRequestOptions } from './src/core/ai/aiTypes';
import { buildNOVOContext } from './src/core/intelligence/contextEngine';

class ControlledMockProvider implements AIProvider {
  id = 'mock-provider';
  name = 'Mock Controlled Provider';
  providerType = 'local' as any;
  supportedModels = ['mock-model'];
  isAvailable() { return true; }
  async generateResponse(): Promise<AIResponse> {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ text: "Res 1" } as any), 50);
    });
  }
}
aiProviderRegistry.register(new ControlledMockProvider());

// OLD IMPLEMENTATION REPLICA (missing explicit originConvId when resolving)
async function oldHookSubmitMessage(message: string, contextMock: any) {
    const trimmed = message.trim();
    if (!trimmed) return;
    
    const state = useChatStore.getState();
    const sendMessage = state.sendMessage;

    // 1. Persist user message 
    await sendMessage(trimmed, 'user');

    // 2. Await AI Orchestrator 
    const result = await aiOrchestrator.orchestrate({
      message: trimmed,
      context: contextMock,
      language: 'en',
    });

    // 3. Resolve WITHOUT originConvId explicitly! (OLD BUG)
    if (result.aiResponse) {
        await sendMessage(result.aiResponse.text, 'assistant');
    }
}

async function startOldSubmit(message: string) {
    const ctx = buildNOVOContext({ tasks: [], goals: [], notes: [], sessions: [], transactions: [] });
    return oldHookSubmitMessage(message, ctx);
}

async function runTests() {
  console.log("=== OLD IMPLEMENTATION REGRESSION TEST ===");
  useChatStore.setState({ conversations: [], activeConversationId: null, status: 'idle', error: null, lastUpdated: null });
  RepositoryFactory.getChatRepository = () => ({
    getAll: async () => [], getActiveChatId: async () => null,
    saveActiveChatId: async () => {}, create: async () => {},
    update: async () => {}, delete: async () => {},
  } as any);
  await useChatStore.getState().initialize();

  await useChatStore.getState().createConversation('Conv A', 'Hello A');
  const convAId = useChatStore.getState().activeConversationId!;
  
  const promiseA = startOldSubmit("Req 1");
  await new Promise(r => setTimeout(r, 0));
  
  await useChatStore.getState().createConversation('Conv B', 'Hello B');
  const convBId = useChatStore.getState().activeConversationId!;
  
  await promiseA;
  
  const finalState1 = useChatStore.getState();
  const finalA1 = finalState1.conversations.find(c => c.id === convAId)!;
  const finalB1 = finalState1.conversations.find(c => c.id === convBId)!;
  
  // Under the old bug, the response gets added to Conv B!
  if (finalB1.messages.length > 1) {
    console.log("[PASS] Old implementation successfully fails the routing requirement!");
  } else {
    console.error("[FAIL] Old implementation did not misroute the message.");
  }
}
runTests();
