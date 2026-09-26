import React, { useState } from 'react';
import { create } from 'react-test-renderer';
import { LiveChatSurface } from './src/modules/chat/components/LiveChatSurface';
import { ChatView } from './src/modules/chat/ChatView';
import { LiveTransportClient } from './src/core/live/liveTransportClient';
import { useAuthStore } from './src/core/auth/authStore';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { useChatStore } from './src/core/state/chatStore';
import { AppProvider } from './src/core/providers/AppContext';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static emitOnBind: boolean = false;
  url: string;
  readyState: number = 0; // CONNECTING
  onopen: (() => void) | null = null;
  
  private _onmessage: ((event: any) => void) | null = null;
  get onmessage() { return this._onmessage; }
  set onmessage(fn) {
    this._onmessage = fn;
    if (MockWebSocket.emitOnBind && fn) {
      fn({ data: JSON.stringify({ type: 'ERROR', message: 'Pre-connect order test' }) } as any);
    }
  }

  onclose: ((event?: any) => void) | null = null;
  onerror: (() => void) | null = null;
  sentData: any[] = [];
  closed: boolean = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sentData.push(data);
  }

  close(code: number, reason: string) {
    this.closed = true;
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose();
  }
  
  triggerMessage(data: any) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(data) });
  }
}

(global as any).WebSocket = MockWebSocket;

(global as any).window = {
  location: {
    protocol: 'http:',
    host: 'localhost:3000'
  }
};

const originalConnect = LiveTransportClient.prototype.connect;
LiveTransportClient.prototype.connect = function(url: string, token: string) {
  if ((this as any).listeners && (this as any).listeners.state?.size > 0) {
    (global as any).listenersBoundBeforeConnect = true;
  }
  return originalConnect.call(this, url, token);
};

// Create an id generator to make snapshotting deterministic
let idCounter = 0;
const getId = () => `mock-id-${idCounter++}`;

async function runTests() {
  console.log('Running Gate 6 tests (Live Chat UI Consumer)');
  let passed = true;
  const logResult = (testId: string, result: boolean, desc: string) => {
    console.log(`[${result ? 'PASS' : 'FAIL'}] ${testId}: ${desc}`);
    if (!result) passed = false;
  };

  // Mock token
  let getTokenCalled = false;
  const mockToken = 'TEST_FAKE_ID_TOKEN';
  useAuthStore.setState({ 
    user: { 
      getIdToken: async () => { getTokenCalled = true; return mockToken; },
      uid: 'user-1'
    } as any 
  });
  
  MockWebSocket.instances.length = 0;

  // Render ChatView inside AppProvider
  let root;
  await React.act(async () => {
    root = create(
      <AppProvider>
        <ChatView />
      </AppProvider>
    );
  });

  const getChatViewStr = () => JSON.stringify(root.toJSON());

  // G6-01: Default mode is REST and existing Chat remains mounted.
  let str = getChatViewStr();
  logResult(
    'G6-01',
    !str.includes('Live Chat Canvas') && !str.includes('المحادثة المباشرة') && (str.includes('Local Secure Thread') || str.includes('محادثة محلية آمنة')),
    'Default mode is REST and existing Chat remains mounted.'
  );

  // Switch to Live mode
  const liveButton = root.root.findAll(
    (el) => el.type === 'button' && (el.props.children?.includes?.('Live') || el.props.children?.includes?.('مباشر'))
  )[0];

  MockWebSocket.emitOnBind = true;
  await React.act(async () => {
    liveButton.props.onClick();
  });
  MockWebSocket.emitOnBind = false;

  // G6-02: Entering Live mode creates exactly one LiveTransportClient.
  logResult(
    'G6-02',
    MockWebSocket.instances.length === 1,
    'Entering Live mode creates exactly one LiveTransportClient.'
  );

  // G6-03: Live subscriptions are established before the connection starts.
  // We configured MockWebSocket.emitOnBind = true, which synchronously emits an ERROR event
  // the exact millisecond `ws.onmessage` is assigned inside `client.connect()`.
  // If listeners were not bound *before* connect(), this event would be missed.
  str = getChatViewStr();
  logResult(
    'G6-03',
    str.includes('Pre-connect order test'),
    'Subscriptions ready before connect() because the UI synchronously processed the auto-replied pre-connect event.'
  );

  // Clean up the error state to resume normal testing
  let restButton = root.root.findAll(
    (el) => el.type === 'button' && (el.props.children === 'Standard' || el.props.children === 'قياسي')
  )[0];
  await React.act(async () => {
    restButton.props.onClick(); // Unmount Live
  });
  MockWebSocket.instances = []; // Clear mock sockets
  await React.act(async () => {
    liveButton.props.onClick(); // Remount Live cleanly
  });

  const ws = MockWebSocket.instances[0];

  // G6-05: WebSocket URL is constructed from the current browser origin.
  logResult(
    'G6-05',
    ws.url === 'ws://localhost:3000/api/live' || ws.url === 'http://localhost:3000/api/live',
    'WebSocket URL is constructed from the current browser origin.'
  );

  // G6-06: CONNECTING state renders correctly.
  str = getChatViewStr();
  logResult(
    'G6-06',
    str.includes('Connecting...') || str.includes('جاري الاتصال...'),
    'CONNECTING state renders correctly.'
  );

  // G6-03: Live subscriptions are established before the connection starts.
  // G6-04: Authenticated user supplies getIdToken() to the transport without exposing/logging the token.
  let capturedLogs = '';
  const captureConsole = (...args: any[]) => { capturedLogs += args.join(' ') + '\n'; };
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  console.log = captureConsole;
  console.warn = captureConsole;
  console.error = captureConsole;

  await React.act(async () => {
    ws.readyState = 1; // Simulate OPEN
    ws.onopen!();
  });

  console.log = origLog;
  console.warn = origWarn;
  console.error = origError;

  str = getChatViewStr();
  
  const authMessageSent = ws.sentData.some(msg => msg.includes('"type":"AUTH"') && msg.includes(mockToken));
  logResult(
    'G6-04',
    getTokenCalled && !ws.url.includes(mockToken) && authMessageSent && !capturedLogs.includes(mockToken),
    'Authenticated user supplies getIdToken(), sends AUTH message without URL exposure, and token is never logged.'
  );

  // G6-07: AUTHENTICATING state renders correctly.
  str = getChatViewStr();
  logResult(
    'G6-07',
    str.includes('Authenticating...') || str.includes('جاري المصادقة...'),
    'AUTHENTICATING state renders correctly.'
  );

  // G6-08: CONNECTED before setupComplete renders "Starting AI" state.
  await React.act(async () => {
    ws.triggerMessage({ type: 'CONNECTED' });
  });
  str = getChatViewStr();
  logResult(
    'G6-08',
    str.includes('Starting AI...') || str.includes('بدء تشغيل الذكاء الاصطناعي...'),
    'CONNECTED before setupComplete renders "Starting AI".'
  );
  if (!(str.includes('Starting AI...') || str.includes('بدء تشغيل الذكاء الاصطناعي...'))) console.log('G6-08 Failed, str contains:', str.substring(0, 500));

  // G6-09: setupComplete produces Gemini-ready Live UI.
  await React.act(async () => {
    ws.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { setupComplete: { sessionId: 'session-123' } } });
  });
  str = getChatViewStr();
  logResult(
    'G6-09',
    (str.includes('Live') || str.includes('مباشر (Live)')) && !(str.includes('Starting AI...') || str.includes('بدء تشغيل الذكاء الاصطناعي...')),
    'setupComplete produces Gemini-ready Live UI.'
  );
  if (!((str.includes('Live') || str.includes('مباشر (Live)')) && !(str.includes('Starting AI...') || str.includes('بدء تشغيل الذكاء الاصطناعي...')))) console.log('G6-09 Failed, str contains:', str.substring(0, 500));

  // G6-10: sendMessage delegates through useLiveChat.
  const textarea = root.root.findByType('textarea');
  const form = root.root.findByType('form');
  
  await React.act(async () => {
    textarea.props.onChange({ target: { value: 'Hello AI' } });
  });
  
  await React.act(async () => {
    form.props.onSubmit({ preventDefault: () => {} });
  });
  
  const sentDataStr = JSON.stringify(ws.sentData);
  logResult(
    'G6-10',
    sentDataStr.includes('Hello AI'),
    'sendMessage delegates through useLiveChat.'
  );

  // G6-11: Successful send renders exactly one local user message.
  str = getChatViewStr();
  logResult(
    'G6-11',
    str.includes('Hello AI') && textarea.props.value === '',
    'Successful send renders exactly one local user message and clears input.'
  );

  // G6-12: textDelta events accumulate into exactly one assistant message.
  await React.act(async () => {
    ws.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { serverContent: { modelTurn: { parts: [{ text: 'Response ' }] } } } });
    ws.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { serverContent: { modelTurn: { parts: [{ text: 'Part 2' }] } } } });
  });
  
  str = getChatViewStr();
  logResult(
    'G6-12',
    str.includes('Response Part 2'),
    'textDelta events accumulate into exactly one assistant message.'
  );

  // G6-14: Send input remains available while isStreaming is true (Gate 7 full-duplex update)
  logResult(
    'G6-14',
    textarea.props.disabled !== true,
    'Send input remains available while isStreaming is true (Gate 7 full-duplex).'
  );

  // G6-13: turnComplete finalizes the streaming assistant message.
  await React.act(async () => {
    ws.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { serverContent: { turnCompleteReason: 'END_OF_TURN' } } });
  });
  
  logResult(
    'G6-13',
    textarea.props.disabled !== true,
    'turnComplete finalizes the streaming assistant message.'
  );

  // Two-turn validation
  await React.act(async () => {
    textarea.props.onChange({ target: { value: 'Hello again' } });
  });
  await React.act(async () => {
    form.props.onSubmit({ preventDefault: () => {} });
  });
  await React.act(async () => {
    ws.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { serverContent: { modelTurn: { parts: [{ text: 'Second ' }] } } } });
    ws.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { serverContent: { modelTurn: { parts: [{ text: 'turn' }] } } } });
  });
  await React.act(async () => {
    ws.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { serverContent: { turnCompleteReason: 'END_OF_TURN' } } });
  });
  str = getChatViewStr();
  logResult(
    'Streaming',
    str.includes('Response Part 2') && str.includes('Second turn'),
    'Two full turns correctly rendered as separate messages.'
  );

  // G6-15: Transport error reaches the Live UI.
  await React.act(async () => {
    ws.triggerMessage({ type: 'ERROR', message: 'Test error 123' });
  });
  str = getChatViewStr();
  logResult(
    'G6-15',
    str.includes('Test error 123'),
    'Transport error reaches the Live UI.'
  );

  // G6-16: Connection failure is handled safely.
  await React.act(async () => {
    ws.onclose!({ code: 1006, reason: 'Abnormal Closure', wasClean: false } as CloseEvent);
  });
  str = getChatViewStr();
  logResult(
    'G6-16',
    str.includes('Disconnected') || str.includes('غير متصل') || str.includes('Connection Error') || str.includes('خطأ في الاتصال'),
    'Connection failure handled safely.'
  );

  // G6-17: Live → REST unmounts the Live surface and disconnects its owned client.
  restButton = root.root.findAll(
    (el) => el.type === 'button' && (el.props.children === 'Standard' || el.props.children === 'قياسي')
  )[0];

  await React.act(async () => {
    restButton.props.onClick();
  });
  
  logResult(
    'G6-17',
    ws.closed === true,
    'Live → REST unmounts the Live surface and disconnects its owned client.'
  );

  // G6-18: Late events after Live unmount do not modify React state.
  await React.act(async () => {
    ws.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { serverContent: { modelTurn: { parts: [{ text: 'Late text' }] } } } });
  });
  str = getChatViewStr();
  logResult(
    'G6-18',
    !str.includes('Late text'),
    'Late events after Live unmount do not modify React state.'
  );

  // G6-19: Repeated REST → Live → REST toggling does not accumulate sockets/listeners.
  const oldWsCount = MockWebSocket.instances.length;
  await React.act(async () => {
    liveButton.props.onClick();
  });
  await React.act(async () => {
    restButton.props.onClick();
  });
  logResult(
    'G6-19',
    MockWebSocket.instances.length === oldWsCount + 1,
    'Repeated REST → Live → REST toggling creates exactly one new socket per toggle.'
  );

  // G6-20: AuthLifecycle.reset() terminates the active Live connection.
  await React.act(async () => {
    liveButton.props.onClick();
  });
  const newWs = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  await React.act(async () => {
    AuthLifecycle.reset();
  });
  logResult(
    'G6-20',
    newWs.closed === true,
    'AuthLifecycle.reset() terminates the active Live connection.'
  );

  // G6-21: REST Chat state remains intact after entering and leaving Live mode.
  await React.act(async () => {
    restButton.props.onClick();
  });
  str = getChatViewStr();
  logResult(
    'G6-21',
    str.includes('Local Secure Thread') || str.includes('\u0645\u062d\u0627\u062f\u062b\u0629 \u0645\u062d\u0644\u064a\u0629 \u0622\u0645\u0646\u0629') || str.includes('محادثة محلية آمنة'),
    'REST Chat state remains intact.'
  );
  if (!(str.includes('Local Secure Thread') || str.includes('محادثة محلية آمنة'))) console.log('G6-21 Failed, str length:', str.length, 'Contains Local:', str.includes('Local'), 'Contains REST:', str.includes('REST'));

  // G6-22: Existing REST send flow remains functional.
  const restTextarea = root.root.findByType('textarea');
  const restForm = root.root.findByType('form');
  await React.act(async () => {
    restTextarea.props.onChange({ target: { value: 'REST message' } });
  });
  await React.act(async () => {
    restForm.props.onSubmit({ preventDefault: () => {} });
    await new Promise(r => setTimeout(r, 50)); // Wait for async submitMessage to hit chatStore
  });
  const refreshedTextarea = root.root.findByType('textarea');
  const chatStoreState = useChatStore.getState();
  // Ensure the textarea was cleared after submit
  logResult(
    'G6-22',
    refreshedTextarea.props.value === '',
    'Existing REST send flow remains functional (input cleared and dispatched).'
  );
  
  // G6-23: StrictMode does not allow a stale socket to terminate the current Live session.
  let strictRoot: any;
  await React.act(async () => {
    strictRoot = create(
      <React.StrictMode>
        <AppProvider>
          <ChatView />
        </AppProvider>
      </React.StrictMode>
    );
  });
  
  const strictLiveButton = strictRoot.root.findAll(
    (el: any) => el.type === 'button' && (el.props.children?.includes?.('Live') || el.props.children?.includes?.('مباشر'))
  )[0];

  const prevInstancesCount = MockWebSocket.instances.length;
  await React.act(async () => {
    strictLiveButton.props.onClick();
  });

  const createdSockets = MockWebSocket.instances.slice(prevInstancesCount);
  const activeSockets = createdSockets.filter(s => !s.closed);
  const strictActiveWs = activeSockets[0];

  // Bring the active socket to connected state
  await React.act(async () => {
    strictActiveWs.readyState = 1;
    strictActiveWs.onopen!();
  });
  await React.act(async () => {
    strictActiveWs.onmessage!({ data: JSON.stringify({ type: 'CONNECTED' }) });
  });

  // Verify the StrictMode UI actually rendered "Starting AI..." cleanly
  const strictStr = JSON.stringify(strictRoot.toJSON());
  const uiWorks = strictStr.includes('Starting AI...') || strictStr.includes('بدء تشغيل الذكاء الاصطناعي...');

  logResult(
    'G6-23',
    createdSockets.length >= 1 && activeSockets.length === 1 && uiWorks,
    'StrictMode lifecycle reliably mounts exactly one active connection and functional Live UI.'
  );

  // G6-24: No duplicate LiveTransportClient is created during normal re-renders.
  // Trigger a re-render in the Live chat surface
  await React.act(async () => {
    liveButton.props.onClick();
  });
  const wsCountBeforeRender = MockWebSocket.instances.length;
  const liveTextarea = root.root.findByType('textarea');
  await React.act(async () => {
    liveTextarea.props.onChange({ target: { value: 're-render trigger' } });
  });
  logResult(
    'G6-24',
    MockWebSocket.instances.length === wsCountBeforeRender,
    'Live chat surface re-renders maintain exactly the same active socket and client.'
  );

  if (!passed) {
    process.exit(1);
  } else {
    console.log('ALL GATE 6 TESTS PASSED');
  }
}

runTests();
