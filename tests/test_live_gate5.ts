import * as React from 'react';
import TestRenderer from 'react-test-renderer';
import { useLiveChat } from './src/core/live/useLiveChat';
import { LiveTransportClient } from './src/core/live/liveTransportClient';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState: number = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sentData: any[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sentData.push(data);
  }

  close(code: number, reason: string) {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose();
  }
  
  triggerMessage(data: any) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(data) });
  }
}

(global as any).WebSocket = MockWebSocket;
(global as any).IS_REACT_ACT_ENVIRONMENT = true;

const originalConsoleError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && (args[0].includes('react-test-renderer is deprecated') || args[0].includes('The current testing environment is not configured to support act'))) return;
  originalConsoleError(...args);
};

function runTests() {
  console.log('Running Gate 5 tests (Live Chat Consumer)');
  let passed = true;
  const logResult = (testId: string, result: boolean, desc: string) => {
    console.log(`[${result ? 'PASS' : 'FAIL'}] ${testId}: ${desc}`);
    if (!result) passed = false;
  };

  const client = new LiveTransportClient();
  let hookResult: ReturnType<typeof useLiveChat> | null = null;
  let renderCount = 0;

  function TestComponent() {
    renderCount++;
    hookResult = useLiveChat(client);
    return null;
  }

  // Mount
  let root: TestRenderer.ReactTestRenderer;
  TestRenderer.act(() => {
    root = TestRenderer.create(React.createElement(TestComponent));
  });

  if (!hookResult) throw new Error('Hook failed to render');

  // LIVE-GATE5-01: Initial state
  logResult(
    'LIVE-GATE5-01',
    hookResult.messages.length === 0 &&
    hookResult.isStreaming === false &&
    hookResult.error === null &&
    hookResult.connectionState === 'DISCONNECTED',
    'Initial state is correct (empty, not streaming, no error, DISCONNECTED)'
  );

  // LIVE-GATE5-11: Empty input
  let sendResult: boolean = false;
  TestRenderer.act(() => {
    sendResult = hookResult!.sendMessage('   ');
  });
  logResult(
    'LIVE-GATE5-11',
    sendResult === false && hookResult.messages.length === 0,
    'Empty input returns false and creates no local message'
  );

  // LIVE-GATE5-03: Failed sendMessage
  TestRenderer.act(() => {
    // Client is DISCONNECTED, so sendText should fail
    sendResult = hookResult!.sendMessage('Failed message');
  });
  logResult(
    'LIVE-GATE5-03',
    sendResult === false && hookResult.messages.length === 0,
    'Failed sendMessage returns false and creates no local message'
  );

  // Connect client to allow successful send
  TestRenderer.act(() => {
    client.connect('ws://dummy', 'token').catch(() => {});
  });
  TestRenderer.act(() => {
    const ws = MockWebSocket.instances[0];
    if (ws.onopen) ws.onopen();
    ws.triggerMessage({ type: 'CONNECTED' });
  });

  // LIVE-GATE5-02: Successful sendMessage
  TestRenderer.act(() => {
    sendResult = hookResult!.sendMessage('Hello model');
  });
  logResult(
    'LIVE-GATE5-02',
    sendResult &&
    hookResult.messages.length === 1 &&
    hookResult.messages[0].role === 'user' &&
    hookResult.messages[0].content === 'Hello model',
    'Successful sendMessage returns true and creates exactly one local user message'
  );

  // LIVE-GATE5-06: turnComplete without active stream
  TestRenderer.act(() => {
    const ws = MockWebSocket.instances[0];
    ws.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { serverContent: { turnCompleteReason: 'END_OF_TURN' } } });
  });
  logResult(
    'LIVE-GATE5-06',
    hookResult.messages.length === 1 && hookResult.isStreaming === false,
    'turnComplete without active stream is safely ignored'
  );

  // LIVE-GATE5-04: Streaming accumulation
  TestRenderer.act(() => {
    const ws = MockWebSocket.instances[0];
    ws.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { serverContent: { modelTurn: { parts: [{ text: 'Hel' }] } } } });
    ws.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { serverContent: { modelTurn: { parts: [{ text: 'lo' }] } } } });
    ws.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { serverContent: { modelTurn: { parts: [{ text: ' world' }] } } } });
  });
  logResult(
    'LIVE-GATE5-04',
    hookResult.messages.length === 2 &&
    hookResult.messages[1].role === 'assistant' &&
    hookResult.messages[1].content === 'Hello world' &&
    hookResult.isStreaming === true &&
    hookResult.messages[1].isStreaming === true,
    'Streaming deltas accumulate into exactly one assistant message'
  );

  // LIVE-GATE5-05: turnComplete
  TestRenderer.act(() => {
    const ws = MockWebSocket.instances[0];
    ws.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { serverContent: { turnCompleteReason: 'END_OF_TURN' } } });
  });
  logResult(
    'LIVE-GATE5-05',
    hookResult.messages.length === 2 &&
    hookResult.messages[1].content === 'Hello world' &&
    hookResult.isStreaming === false &&
    hookResult.messages[1].isStreaming === false,
    'turnComplete finalizes the active assistant stream'
  );

  // LIVE-GATE5-10: Multiple deltas after completion
  TestRenderer.act(() => {
    const ws = MockWebSocket.instances[0];
    ws.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { serverContent: { modelTurn: { parts: [{ text: 'Second' }] } } } });
    ws.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { serverContent: { turnCompleteReason: 'END_OF_TURN' } } });
  });
  logResult(
    'LIVE-GATE5-10',
    hookResult.messages.length === 3 &&
    hookResult.messages[2].content === 'Second' &&
    hookResult.isStreaming === false,
    'New stream after completion creates a distinct second assistant message'
  );

  // LIVE-GATE5-07: Error propagation
  TestRenderer.act(() => {
    const ws = MockWebSocket.instances[0];
    ws.triggerMessage({ type: 'ERROR', message: 'Test error propagated' });
  });
  logResult(
    'LIVE-GATE5-07',
    hookResult.error !== null && hookResult.error.message === 'Test error propagated',
    'Hook exposes the exact error from the transport'
  );

  // LIVE-GATE5-08: Connection state propagation
  TestRenderer.act(() => {
    const ws = MockWebSocket.instances[0];
    ws.close(1000, 'Test closure');
  });
  logResult(
    'LIVE-GATE5-08',
    hookResult.connectionState === 'DISCONNECTED',
    'Hook reflects connection state changes (CONNECTED -> DISCONNECTED)'
  );

  // LIVE-GATE5-09: Unmount cleanup
  const getListenersSize = (event: string) => (client as any).listeners[event].size;
  const stateSizeBefore = getListenersSize('state');
  const deltaSizeBefore = getListenersSize('textDelta');

  TestRenderer.act(() => {
    root.unmount();
  });
  
  const stateSizeAfter = getListenersSize('state');
  const deltaSizeAfter = getListenersSize('textDelta');
  
  const clientStillDisconnected = client.getState() === 'DISCONNECTED';
  const renderCountBefore = renderCount;

  // Emit event after unmount
  TestRenderer.act(() => {
    (client as any).emit('error', new Error('Late error'));
  });
  const renderCountAfter = renderCount;

  logResult(
    'LIVE-GATE5-09',
    stateSizeBefore > 0 && stateSizeAfter === 0 &&
    deltaSizeBefore > 0 && deltaSizeAfter === 0 &&
    renderCountBefore === renderCountAfter &&
    clientStillDisconnected,
    'Unmount removes exact listeners, prevents stale updates, and does not alter client connection'
  );

  if (!passed) {
    process.exit(1);
  } else {
    console.log('ALL GATE 5 TESTS PASSED');
  }
}

runTests();
