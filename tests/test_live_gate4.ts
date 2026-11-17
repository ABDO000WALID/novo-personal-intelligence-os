import * as React from 'react';
import TestRenderer from 'react-test-renderer';
import { useLiveTransport } from './src/core/live/useLiveTransport';
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
    // Do not auto-fire onopen in this mock, we will control it manually
    // for exact state testing.
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
  console.log('Running Gate 4 tests (Real React Lifecycle)');
  let passed = true;
  const logResult = (testId: string, result: boolean, desc: string) => {
    console.log(`[${result ? 'PASS' : 'FAIL'}] ${testId}: ${desc}`);
    if (!result) passed = false;
  };

  const client = new LiveTransportClient();
  let hookResult: any = null;
  let renderCount = 0;

  function TestComponent() {
    renderCount++;
    hookResult = useLiveTransport(client);
    return null;
  }

  // Mount
  let root: TestRenderer.ReactTestRenderer;
  TestRenderer.act(() => {
    root = TestRenderer.create(React.createElement(TestComponent));
  });

  // LIVE-GATE4-01: Hook initializes correctly from the caller-owned client.
  logResult(
    'LIVE-GATE4-01',
    hookResult !== null &&
    hookResult.connectionState === 'DISCONNECTED' &&
    hookResult.isGeminiReady === false,
    'Hook initializes with DISCONNECTED state and isGeminiReady = false'
  );

  // LIVE-GATE4-06a: Caller ownership (does not instantiate client)
  logResult(
    'LIVE-GATE4-06a',
    hookResult.client === client,
    'Hook uses caller-owned client and does not instantiate a new one'
  );

  // LIVE-GATE4-02: Client state events propagate into React state
  let connecting = false, authenticating = false, novoConnected = false;
  
  TestRenderer.act(() => {
    client.connect('ws://dummy', 'token').catch(() => {});
  });
  connecting = hookResult.connectionState === 'CONNECTING';

  TestRenderer.act(() => {
    const ws = MockWebSocket.instances[0];
    if (ws.onopen) ws.onopen();
  });
  authenticating = hookResult.connectionState === 'AUTHENTICATING';

  TestRenderer.act(() => {
    const ws = MockWebSocket.instances[0];
    ws.triggerMessage({ type: 'CONNECTED' });
  });
  novoConnected = hookResult.connectionState === 'NOVO_CONNECTED';

  logResult(
    'LIVE-GATE4-02',
    connecting && authenticating && novoConnected,
    'Client state events propagate into React state (CONNECTING -> AUTHENTICATING -> NOVO_CONNECTED)'
  );

  // LIVE-GATE4-03: Gemini readiness
  TestRenderer.act(() => {
    const ws = MockWebSocket.instances[0];
    ws.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { setupComplete: {} } });
  });
  const geminiReady = hookResult.isGeminiReady === true;

  TestRenderer.act(() => {
    client.disconnect();
  });
  const geminiNotReady = hookResult.isGeminiReady === false && hookResult.connectionState === 'DISCONNECTED';

  logResult(
    'LIVE-GATE4-03',
    geminiReady && geminiNotReady,
    'setupComplete -> isGeminiReady=true, and leaving CONNECTED -> isGeminiReady=false'
  );

  // LIVE-GATE4-04: sendText remains exposed and delegates
  let sendTextExists = typeof hookResult.sendText === 'function';
  TestRenderer.act(() => {
    client.connect('ws://dummy', 'token').catch(() => {});
  });
  TestRenderer.act(() => {
    const ws = MockWebSocket.instances[1];
    if (ws.onopen) ws.onopen();
    ws.triggerMessage({ type: 'CONNECTED' });
  });
  TestRenderer.act(() => {
    hookResult.sendText('hello');
  });
  const delegated = MockWebSocket.instances[1].sentData.some(d => d.includes('hello'));
  logResult(
    'LIVE-GATE4-04',
    sendTextExists && delegated,
    'sendText remains exposed and delegates to the caller-owned client'
  );

  // LIVE-GATE4-05 & LIVE-GATE4-06b: Unmount cleanup & Unmount disconnect behavior
  const getListenersSize = (event: string) => (client as any).listeners[event].size;
  const initialListenersCount = getListenersSize('state');

  TestRenderer.act(() => {
    root.unmount();
  });
  
  const finalListenersCount = getListenersSize('state');
  
  const clientStillConnected = client.getState() === 'CONNECTED';

  const renderCountBefore = renderCount;
  TestRenderer.act(() => {
    MockWebSocket.instances[1].triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { setupComplete: {} } });
  });
  const renderCountAfter = renderCount;

  logResult(
    'LIVE-GATE4-05',
    initialListenersCount === 1 && finalListenersCount === 0 && renderCountBefore === renderCountAfter,
    'Unmount cleanup removes exact listeners and events after unmount do not update React state'
  );
  
  logResult(
    'LIVE-GATE4-06b',
    clientStillConnected,
    'Unmount does NOT call client.disconnect()'
  );
  
  // Clean up the client explicitly
  client.disconnect();

  if (!passed) {
    process.exit(1);
  } else {
    console.log('ALL GATE 4 TESTS PASSED');
  }
}

runTests();
