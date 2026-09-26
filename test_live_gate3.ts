import { LiveTransportClient } from './src/core/live/liveTransportClient';
import { AuthLifecycle } from './src/core/auth/authLifecycle';

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
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) this.onopen();
    }, 5);
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

async function runTests() {
  let passed = true;
  const logResult = (testId: string, result: boolean, desc: string) => {
    console.log(`[${result ? 'PASS' : 'FAIL'}] ${testId}: ${desc}`);
    if (!result) passed = false;
  };

  // LIVE-GATE3-01: CONNECTING → AUTHENTICATING → CONNECTED
  MockWebSocket.instances = [];
  const client1 = new LiveTransportClient();
  const states1: string[] = [];
  client1.on('state', s => states1.push(s));
  const p1 = client1.connect('ws://dummy', 'fake-token');
  
  const isConnecting = client1.getState() === 'CONNECTING';
  await new Promise(r => setTimeout(r, 10));
  const isAuthenticating = client1.getState() === 'AUTHENTICATING';
  
  const ws1 = MockWebSocket.instances[0];
  ws1.triggerMessage({ type: 'CONNECTED' });
  await p1;
  const isConnected = client1.getState() === 'CONNECTED';
  
  logResult('LIVE-GATE3-01', 
    isConnecting && isAuthenticating && isConnected && states1.join(',') === 'CONNECTING,AUTHENTICATING,CONNECTED',
    'CONNECTING → AUTHENTICATING → CONNECTED'
  );

  // LIVE-GATE3-02: setupComplete normalization
  let setupId: string | undefined = undefined;
  client1.on('setupComplete', (id) => setupId = id);
  ws1.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { setupComplete: { sessionId: 'test-session-123' } } });
  logResult('LIVE-GATE3-02', setupId === 'test-session-123', 'setupComplete normalization');

  // LIVE-GATE3-03: text extraction from modelTurn.parts
  const textChunks: string[] = [];
  client1.on('textDelta', (text) => textChunks.push(text));
  ws1.triggerMessage({
    type: 'GEMINI_SERVER_MESSAGE',
    message: {
      serverContent: {
        modelTurn: {
          parts: [{ text: 'Hello ' }, { text: 'world' }]
        }
      }
    }
  });
  logResult('LIVE-GATE3-03', textChunks.join('') === 'Hello world', 'text extraction from modelTurn.parts');

  // LIVE-GATE3-04: turn completion with and without a completion reason
  const completions: any[] = [];
  client1.on('turnComplete', (reason) => completions.push(reason));
  ws1.triggerMessage({
    type: 'GEMINI_SERVER_MESSAGE',
    message: { serverContent: { turnCompleteReason: 'END_OF_TURN' } }
  });
  // Use raw JSON to preserve the key, since JSON.stringify strips undefined properties
  if (ws1.onmessage) ws1.onmessage({ data: '{"type":"GEMINI_SERVER_MESSAGE","message":{"serverContent":{"turnCompleteReason":null}}}' } as any);
  
  logResult('LIVE-GATE3-04', completions.length === 2 && completions[0] === 'END_OF_TURN' && completions[1] === null, 'turn completion with and without a completion reason');

  // LIVE-GATE3-05: malformed/unknown Gemini messages do not crash
  let errorThrown = false;
  try {
    ws1.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: null });
    ws1.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { randomStuff: true } });
    ws1.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { serverContent: { modelTurn: { parts: {} } } } });
    ws1.triggerMessage("invalid json"); // will be caught by JSON.parse block
    if (ws1.onmessage) ws1.onmessage({ data: "invalid json" }); // coverage for JSON.parse catch
  } catch (e) {
    errorThrown = true;
  }
  logResult('LIVE-GATE3-05', !errorThrown, 'malformed/unknown Gemini messages do not crash');

  // LIVE-GATE3-06: on/off subscription behavior
  let subCalls = 0;
  const subCb = () => subCalls++;
  client1.on('setupComplete', subCb);
  ws1.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { setupComplete: {} } });
  client1.off('setupComplete', subCb);
  ws1.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { setupComplete: {} } });
  logResult('LIVE-GATE3-06', subCalls === 1, 'on/off subscription behavior');

  // LIVE-GATE3-07: sendText succeeds only when connected and validates input
  client1.disconnect();
  const sendWhenDisc = client1.sendText('hello');
  
  const client2 = new LiveTransportClient();
  client2.connect('ws://dummy', 'fake');
  const sendWhenAuth = client2.sendText('hello');
  
  await new Promise(r => setTimeout(r, 10)); // wait for open
  const ws2 = MockWebSocket.instances[1];
  ws2.triggerMessage({ type: 'CONNECTED' });
  await new Promise(r => setTimeout(r, 10)); // wait for resolution
  
  const sendEmpty = client2.sendText('   ');
  const sendValid = client2.sendText('hello');
  
  logResult('LIVE-GATE3-07', 
    !sendWhenDisc && !sendWhenAuth && !sendEmpty && sendValid && ws2.sentData.some(d => d.includes('hello')), 
    'sendText succeeds only when connected and does not send empty/invalid text');

  // LIVE-GATE3-08: AuthLifecycle.reset() causes the client to disconnect
  const client3 = new LiveTransportClient();
  client3.connect('ws://dummy', 'fake');
  await new Promise(r => setTimeout(r, 10));
  MockWebSocket.instances[2].triggerMessage({ type: 'CONNECTED' });
  await new Promise(r => setTimeout(r, 10));
  
  AuthLifecycle.reset();
  logResult('LIVE-GATE3-08', client3.getState() === 'DISCONNECTED', 'AuthLifecycle.reset() causes the client to disconnect and leaves consistent state');

  if (!passed) {
    console.error('SOME TESTS FAILED');
    process.exit(1);
  } else {
    console.log('ALL GATE 3 TESTS PASSED');
  }
}

runTests();
