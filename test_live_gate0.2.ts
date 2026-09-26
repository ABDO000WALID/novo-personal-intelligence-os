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

  setMockGenAIClient({
    live: {
      connect: async () => ({ close: () => {} })
    }
  });

  try {
    console.log('Authenticating test user...');
    const credA = await signInAnonymously(auth);
    const tokenA = await credA.user.getIdToken();
    const uidA = credA.user.uid;

    // --- Gate 0.2: Authentication Lifecycle Proof ---

    // 1. Authenticates a Firebase emulator user (done above)
    // 2. Opens /api/live & 3. Sends the AUTH message
    const client = new LiveTransportClient();
    await client.connect(wsBaseUrl, tokenA);

    // 4. Verifies an authenticated session exists
    let serverSession = getActiveSession(uidA);
    const isSessionActiveBeforeReset = !!serverSession && serverSession.state === 'AUTHENTICATED';
    
    // 5. Triggers the actual AuthLifecycle reset/termination path used by the client
    AuthLifecycle.reset();

    // 6. Verifies the WebSocket closes
    // Wait a brief moment for the close event to propagate over TCP/local socket
    await new Promise(r => setTimeout(r, 100));
    
    // Check client state
    const isClientClosed = client.getReadyState() === undefined || client.getReadyState() === WebSocket.CLOSED;
    
    // 7. Verifies getActiveSession(uid) becomes undefined
    const isServerSessionCleanedUp = getActiveSession(uidA) === undefined;

    logResult(
      'LIVE-GATE0.2-01', 
      isSessionActiveBeforeReset && isClientClosed && isServerSessionCleanedUp, 
      'AuthLifecycle.reset() terminates the active Live WebSocket and cleans up server state'
    );

    // 8. Verifies the close path is idempotent
    client.disconnect(); // call it again
    logResult('LIVE-GATE0.2-02', true, 'Client disconnect is idempotent without throwing');

    // Re-verify production Firebase Admin initialization constraints
    const serverCode = fs.readFileSync('server/liveTransport.ts', 'utf8');
    const hasHardcodedProdCredentials = serverCode.includes('credential: admin.credential');
    logResult('LIVE-GATE0.2-03', !hasHardcodedProdCredentials, 'Production Firebase Admin initialization does not contain hardcoded credentials');

    // Token not in URL check
    const usesTokenInUrl = serverCode.includes('query.token');
    logResult('LIVE-GATE0.2-04', !usesTokenInUrl, 'Firebase ID tokens are NOT present in the NOVO /api/live WebSocket URL');

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
    console.log('\nALL GATE 0.2 TESTS PASSED.');
  }
}

runTests();
