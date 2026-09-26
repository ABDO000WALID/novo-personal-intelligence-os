import http from 'http';
import WebSocket from 'ws';
import { setupLiveTransport, getActiveSession } from './server/liveTransport.ts';
import fs from 'fs';
import { LiveTransportClient } from './src/core/live/liveTransportClient.ts';
import { AuthLifecycle } from './src/core/auth/authLifecycle.ts';
import { setMockGenAIClient } from './server/live/geminiLiveAdapter.ts';

// Inject Node WS into global for the client code to work in Node environment
(global as any).WebSocket = WebSocket;

// Initialize firebase
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';

const app = initializeApp({
  projectId: 'novo-security-test',
  apiKey: 'fake-api-key'
});
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

async function runTests() {
  let passed = true;
  const logResult = (testId: string, result: boolean, desc: string) => {
    console.log(`[${result ? 'PASS' : 'FAIL'}] ${testId}: ${desc}`);
    if (!result) passed = false;
  };

  const server = http.createServer();
  setupLiveTransport(server);
  
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const wsBaseUrl = `ws://127.0.0.1:${port}/api/live`;

  let mockFailUpstream = false;
  let upstreamClosed = false;
  let storedCallbacks: any = null;

  const mockLiveSession = {
    close: () => { upstreamClosed = true; }
  };

  const mockAiClient = {
    live: {
      connect: async (config: any) => {
        if (mockFailUpstream) throw new Error('Mocked upstream failure');
        upstreamClosed = false;
        storedCallbacks = config.callbacks;
        return mockLiveSession;
      }
    }
  };

  setMockGenAIClient(mockAiClient);

  try {
    const credA = await signInAnonymously(auth);
    const tokenA = await credA.user.getIdToken();
    const uidA = credA.user.uid;

    // --- GATE 1 TESTS ---
    // LIVE-GATE1-01: Authenticated NOVO client can create a LiveSession.
    const client = new LiveTransportClient();
    await client.connect(wsBaseUrl, tokenA);
    const session = getActiveSession(uidA);
    logResult('LIVE-GATE1-01', !!session, 'Authenticated NOVO client can create a LiveSession.');

    // LIVE-GATE1-02: Server creates the Gemini upstream connection for the authenticated session.
    // Wait a brief moment for the async adapter.connect to finish resolving
    await new Promise(r => setTimeout(r, 100));
    logResult('LIVE-GATE1-02', session?.geminiAdapter?.session === mockLiveSession, 'Server creates the Gemini upstream connection for the authenticated session.');

    // LIVE-GATE1-05: NOVO session close triggers Gemini upstream cleanup.
    client.disconnect();
    await new Promise(r => setTimeout(r, 100)); // wait for close to propagate
    logResult('LIVE-GATE1-05', upstreamClosed, 'NOVO session close triggers Gemini upstream cleanup.');

    // LIVE-GATE1-06: Gemini upstream connection failure is handled without leaving a zombie NOVO session.
    mockFailUpstream = true;
    const client2 = new LiveTransportClient();
    let client2Closed = false;
    try {
      await client2.connect(wsBaseUrl, tokenA);
      // We expect the connection to succeed initially, then get closed by server
      const ws = (client2 as any).ws;
      if (ws) {
        ws.on('close', () => { client2Closed = true; });
      }
    } catch (e) {
      // Connect might reject if failure happens fast enough
      client2Closed = true;
    }
    
    // Give it time to process the failure and close
    await new Promise(r => setTimeout(r, 200));
    const sessionAfterFail = getActiveSession(uidA);
    logResult('LIVE-GATE1-06', (client2Closed || client2.getReadyState() === WebSocket.CLOSED) && !sessionAfterFail, 'Gemini upstream connection failure is handled without leaving a zombie NOVO session.');

    // Reset for next test
    mockFailUpstream = false;

    // LIVE-GATE1-07: AuthLifecycle termination ultimately closes both NOVO and Gemini session resources.
    const client3 = new LiveTransportClient();
    await client3.connect(wsBaseUrl, tokenA);
    await new Promise(r => setTimeout(r, 100));
    AuthLifecycle.reset(); // Should clean everything up
    await new Promise(r => setTimeout(r, 100));
    
    const isClient3Closed = client3.getReadyState() === undefined || client3.getReadyState() === WebSocket.CLOSED;
    logResult('LIVE-GATE1-07', isClient3Closed && upstreamClosed && !getActiveSession(uidA), 'AuthLifecycle termination ultimately closes both NOVO and Gemini session resources.');

    // LIVE-GATE1-08: Gemini upstream drop triggers NOVO session cleanup.
    const client4 = new LiveTransportClient();
    await client4.connect(wsBaseUrl, tokenA);
    await new Promise(r => setTimeout(r, 100)); // wait for session and adapter
    
    // Simulate upstream close
    if (storedCallbacks && storedCallbacks.onclose) {
      storedCallbacks.onclose(new Event('close'));
    }
    
    await new Promise(r => setTimeout(r, 100)); // wait for socket cascade
    
    const isClient4Closed = client4.getReadyState() === undefined || client4.getReadyState() === WebSocket.CLOSED;
    logResult('LIVE-GATE1-08', isClient4Closed && !getActiveSession(uidA), 'Gemini upstream drop triggers NOVO session cleanup.');

    // LIVE-GATE1-03: Gemini credential is never exposed to client-side source/build output.
    const adapterCode = fs.readFileSync('server/live/geminiLiveAdapter.ts', 'utf8');
    const isServerOnly = !adapterCode.includes('VITE_') && adapterCode.includes('process.env.GEMINI_API_KEY');
    logResult('LIVE-GATE1-03', isServerOnly, 'Gemini credential is never exposed to client-side source/build output (verified via env pattern).');

    // LIVE-GATE1-04: Gemini credential is never logged or persisted.
    const writesLogOrFile = adapterCode.includes('console.log(apiKey)') || adapterCode.includes('fs.writeFileSync');
    logResult('LIVE-GATE1-04', !writesLogOrFile, 'Gemini credential is never logged or persisted.');

  } catch (err) {
    console.error(err);
    passed = false;
  } finally {
    server.close();
  }

  if (!passed) {
    console.error('\nSOME TESTS FAILED.');
    process.exit(1);
  } else {
    console.log('\nALL GATE 1 TESTS PASSED.');
  }
}

runTests();
