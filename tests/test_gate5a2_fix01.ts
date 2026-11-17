import { LocalAsyncRepository } from './src/core/data/repositories/local/LocalAsyncRepository';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { storageService } from './src/core/storage/storageService';
import { useChatStore } from './src/core/state/chatStore';
import { aiOrchestrator, ChatOrchestrationResult } from './src/core/ai';
import { useChatOrchestrator } from './src/modules/chat/hooks/useChatOrchestrator';

import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

function getHookResult(getContext: any) {
  let result: any = null;
  function TestComponent() {
    result = useChatOrchestrator({ getContext });
    return React.createElement('div');
  }
  ReactDOMServer.renderToString(React.createElement(TestComponent));
  return result;
}

async function runTests() {
  let passed = true;

  console.log('--- AUTH-FIX-01 ---');
  console.log('NOT PROVEN: browser/DOM environment unavailable for AppShell rendering test.\n');

  console.log('--- AUTH-FIX-02 ---');
  // Unauthenticated LocalAsyncRepository
  AuthLifecycle.reset(null); // No authenticated user
  const repo = new LocalAsyncRepository('test_items', () => []);
  
  let rejected = 0;
  try { await repo.create({ id: '1' }); } catch (e: any) { if (e.message.includes('authenticated user')) rejected++; }
  try { await repo.update('1', { }); } catch (e: any) { if (e.message.includes('authenticated user')) rejected++; }
  try { await repo.delete('1'); } catch (e: any) { if (e.message.includes('authenticated user')) rejected++; }
  try { await repo.saveAll([]); } catch (e: any) { if (e.message.includes('authenticated user')) rejected++; }
  
  if (rejected === 4) {
    console.log('PASS: Unauthenticated LocalAsyncRepository rejects all mutations.');
  } else {
    console.log(`FAIL: Only ${rejected}/4 unauthenticated mutations rejected.`);
    passed = false;
  }

  console.log('\n--- AUTH-FIX-03 ---');
  AuthLifecycle.reset('user_A');
  if (typeof localStorage !== 'undefined') localStorage.clear();
  try {
    await repo.create({ id: '1' });
    const items = await repo.getAll();
    if (items.length !== 1) throw new Error('Create failed to persist');
    await repo.update('1', { updated: true } as any);
    const updated = await repo.getById('1');
    if (!(updated as any).updated) throw new Error('Update failed');
    await repo.delete('1');
    const afterDelete = await repo.getAll();
    if (afterDelete.length !== 0) throw new Error('Delete failed');
    await repo.saveAll([{ id: '2' }]);
    
    // Check namespace
    const rawData = storageService.getItem('novo:user_A:test_items', null);
    if (!rawData) throw new Error('Namespace novo:user_A:test_items not used');
    console.log('PASS: Authenticated LocalAsyncRepository mutations work and are scoped.');
  } catch (e: any) {
    console.log('FAIL:', e.message);
    passed = false;
  }

  console.log('\n--- CHAT-FIX-01 ---');
  AuthLifecycle.reset(null);
  useChatStore.getState().conversations = [];
  useChatStore.getState().activeConversationId = null;
  
  let aiCalled = false;
  aiOrchestrator.orchestrate = async () => {
    aiCalled = true;
    return { handledAsCommand: false, aiResponse: { text: 'test' } };
  };

  const getContext = () => ({} as any);
  
  let chatOrch: ReturnType<typeof useChatOrchestrator>;
  try {
    chatOrch = getHookResult(getContext);
    const res = await chatOrch.submitMessage('hello');
    
    if (aiCalled) {
      console.log('FAIL: AI orchestrator was called despite persistence failure.');
      passed = false;
    } else if (res.error?.code === 'REQUEST_FAILED') {
      console.log('PASS: Unauthenticated Chat send returns controlled REQUEST_FAILED and halts.');
    } else {
      console.log('FAIL: Unexpected result:', res);
      passed = false;
    }
  } catch (e: any) {
    console.log('FAIL: submitMessage threw unhandled promise rejection:', e.message);
    passed = false;
  }

  console.log('\n--- CHAT-FIX-02 ---');
  AuthLifecycle.reset('user_A');
  aiCalled = false;
  try {
    chatOrch = getHookResult(getContext);
    const res = await chatOrch.submitMessage('hello again');
    
    if (aiCalled && res.aiResponse?.text === 'test') {
      console.log('PASS: Authenticated Chat send works and completes orchestration.');
    } else {
      console.log('FAIL: Orchestration did not complete normally.');
      passed = false;
    }
  } catch (e: any) {
    console.log('FAIL:', e.message);
    passed = false;
  }

  console.log('\n--- CHAT-FIX-03 ---');
  AuthLifecycle.reset('user_A');
  
  const originalSendMessage = useChatStore.getState().sendMessage;
  // Mock sendMessage to fail only on assistant message
  useChatStore.getState().sendMessage = async (content, role, convId) => {
    if (role === 'assistant') throw new Error('Simulated assistant persistence failure');
    return originalSendMessage(content, role, convId);
  };

  try {
    chatOrch = getHookResult(getContext);
    const res = await chatOrch.submitMessage('trigger assistant fail');
    
    if (res.error?.code === 'REQUEST_FAILED') {
      console.log('PASS: Assistant persistence failure is caught and returns controlled error.');
    } else {
      console.log('FAIL: Expected controlled error but got:', res);
      passed = false;
    }
  } catch (e: any) {
    console.log('FAIL: submitMessage threw unhandled promise rejection for assistant message:', e.message);
    passed = false;
  }
  
  useChatStore.getState().sendMessage = originalSendMessage;

  console.log('\n--- CHAT-FIX-04 ---');
  // Auth race regression: A->B, A->null, A->B->A
  try {
    AuthLifecycle.reset('user_A');
    const slowRepo = new LocalAsyncRepository('race_test', () => []);
    let A_created = false;
    let promise = slowRepo.create({ id: 'race1' }).then(() => { A_created = true; }).catch((e) => e);
    
    // Simulate identity change before microtasks drain
    AuthLifecycle.reset('user_B');
    const result = await promise;
    
    const bItems = storageService.getItem('novo:user_B:race_test', []);
    if (bItems.length > 0) {
      console.log('FAIL: Stale operation redirected to user_B namespace');
      passed = false;
    } else if (result instanceof Error && result.message.includes('aborted')) {
      console.log('PASS: A->B race was safely aborted.');
    } else {
      console.log('FAIL: Race was not aborted properly:', result);
      passed = false;
    }
  } catch (e) {
    console.log('FAIL:', e);
    passed = false;
  }

  if (!passed) {
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
