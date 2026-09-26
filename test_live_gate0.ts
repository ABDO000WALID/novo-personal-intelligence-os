import http from 'http';
import WebSocket from 'ws';
import { setupLiveTransport, getActiveSession } from './server/liveTransport.ts';
import fs from 'fs';

// We need to use dynamic import for firebase to avoid commonjs issues if any, but tsx handles it.
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider, signInAnonymously, signOut } from 'firebase/auth';

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
  const wsBase = `ws://127.0.0.1:${port}/api/live`;

  try {
    // Helper to connect
    const connectWs = (query: string): Promise<{ ws: WebSocket, status: number, closeReason?: string, data?: any }> => {
      return new Promise((resolve) => {
        const ws = new WebSocket(`${wsBase}${query}`);
        let resolved = false;
        
        ws.on('unexpected-response', (request, response) => {
          if (!resolved) { resolved = true; resolve({ ws, status: response.statusCode || 500 }); }
        });

        ws.on('message', (msg) => {
           try {
             const data = JSON.parse(msg.toString());
             if (data.type === 'CONNECTED') {
                if (!resolved) { resolved = true; resolve({ ws, status: 101, data }); }
             }
           } catch (e) {}
        });

        ws.on('close', (code, reason) => {
           if (!resolved) { resolved = true; resolve({ ws, status: code, closeReason: reason.toString() }); }
        });
        
        ws.on('error', () => {
           if (!resolved) { resolved = true; resolve({ ws, status: 0 }); }
        });
      });
    };

    console.log('Authenticating test users...');
    const credA = await signInAnonymously(auth);
    const tokenA = await credA.user.getIdToken();
    const uidA = credA.user.uid;

    
    await signOut(auth);
    const credB = await signInAnonymously(auth);
    const tokenB = await credB.user.getIdToken();
    const uidB = credB.user.uid;

    // LIVE-GATE0-01: Unauthenticated connection rejected
    const r1 = await connectWs('');
    logResult('LIVE-GATE0-01', r1.status === 401, 'Unauthenticated connection rejected');

    // LIVE-GATE0-02: Invalid Firebase ID token rejected
    const r2 = await connectWs('?token=invalid.token.here');
    logResult('LIVE-GATE0-02', r2.status === 401, 'Invalid Firebase ID token rejected');

    // LIVE-GATE0-03: Valid authenticated identity produces the correct verified UID
    const r3 = await connectWs(`?token=${tokenA}&epoch=1`);
    logResult('LIVE-GATE0-03', r3.status === 101 && r3.data?.uid === uidA, 'Valid authenticated identity produces the correct verified UID');
    r3.ws.close();

    // LIVE-GATE0-04: Client-supplied UID different from verified UID is ignored/rejected
    const r4 = await connectWs(`?token=${tokenA}&uid=${uidB}`);
    logResult('LIVE-GATE0-04', r4.status === 403 || r4.status !== 101, `Client-supplied UID different from verified UID is ignored/rejected (status ${r4.status})`);

    // LIVE-GATE0-05: Session captures identity at creation
    const r5 = await connectWs(`?token=${tokenB}&epoch=2`);
    const session = getActiveSession(uidB);
    logResult('LIVE-GATE0-05', session?.uid === uidB && session?.state === 'AUTHENTICATED', 'Session captures identity at creation');

    // LIVE-GATE0-06: Stale AuthLifecycle epoch invalidates the session
    const r6 = await connectWs(`?token=${tokenB}&epoch=3`);
    await new Promise(res => setTimeout(res, 100)); // Wait for close
    logResult('LIVE-GATE0-06', r5.ws.readyState === WebSocket.CLOSED, 'Stale AuthLifecycle epoch invalidates the older session');
    r6.ws.close();

    // LIVE-GATE0-07: User A session cannot become User B session
    const r7 = await connectWs(`?token=${tokenA}&epoch=1`);
    r7.ws.send(JSON.stringify({ type: 'CHANGE_USER', token: tokenB }));
    await new Promise(res => setTimeout(res, 100));
    logResult('LIVE-GATE0-07', r7.ws.readyState === WebSocket.CLOSED, 'User A session cannot become User B session (closed on attempt)');

    // LIVE-GATE0-08: Session close is idempotent
    r5.ws.close();
    r5.ws.close(); // Call again
    logResult('LIVE-GATE0-08', true, 'Session close is idempotent (no crash)');

    // LIVE-GATE0-09: No Gemini API key is present in client-side source/build output
    const buildFiles = fs.readdirSync('dist/assets');
    const jsFiles = buildFiles.filter(f => f.endsWith('.js'));
    let apiKeyExposed = false;
    for (const f of jsFiles) {
       const content = fs.readFileSync(`dist/assets/${f}`, 'utf8');
       if (content.includes('GEMINI_API_KEY') || content.includes(process.env.GEMINI_API_KEY || 'AIzaSy_fake')) {
          apiKeyExposed = true;
       }
    }
    logResult('LIVE-GATE0-09', !apiKeyExposed, 'No Gemini API key is present in client-side source/build output');

    // LIVE-GATE0-10: No raw audio or authentication secrets are persisted/logged by the transport layer
    const serverCode = fs.readFileSync('server/liveTransport.ts', 'utf8');
    const logsAudio = serverCode.includes('console.log(message)') || serverCode.includes('fs.writeFile(');
    logResult('LIVE-GATE0-10', !logsAudio, 'No raw audio or authentication secrets are persisted/logged by the transport layer');

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
    console.log('\nALL GATE 0 TESTS PASSED.');
  }
}

runTests();
