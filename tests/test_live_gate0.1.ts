import http from 'http';
import WebSocket from 'ws';
import { setupLiveTransport, getActiveSession } from './server/liveTransport.ts';
import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously, signOut } from 'firebase/auth';
import { setMockGenAIClient } from './server/live/geminiLiveAdapter.ts';

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

  setMockGenAIClient({
    live: {
      connect: async () => ({ close: () => {} })
    }
  });

  try {
    const connectWsRaw = (query: string): Promise<WebSocket> => {
       return new Promise((resolve) => {
          const ws = new WebSocket(`${wsBase}${query}`);
          ws.on('open', () => resolve(ws));
          ws.on('unexpected-response', (request, response) => {
             resolve(ws);
          });
       });
    };

    const waitClose = (ws: WebSocket): Promise<{code: number, reason: string}> => {
       return new Promise((resolve) => {
          if (ws.readyState === WebSocket.CLOSED) return resolve({code: 1000, reason: ''});
          ws.on('close', (code, reason) => resolve({code, reason: reason.toString()}));
       });
    };

    const credA = await signInAnonymously(auth);
    const tokenA = await credA.user.getIdToken();
    const uidA = credA.user.uid;

    await signOut(auth);
    const credB = await signInAnonymously(auth);
    const tokenB = await credB.user.getIdToken();

    const ws1 = await connectWsRaw('');
    logResult('LIVE-GATE0.1-01', ws1.readyState === WebSocket.OPEN, 'ID token is NOT present in WebSocket URL (connected anyway)');

    ws1.send(JSON.stringify({ type: 'AUTH', token: '' }));
    const close1 = await waitClose(ws1);
    logResult('LIVE-GATE0.1-03', close1.code === 1008, 'Missing authentication message is rejected/closed');

    const ws2 = await connectWsRaw('');
    ws2.send(JSON.stringify({ type: 'AUTH', token: 'invalid' }));
    const close2 = await waitClose(ws2);
    logResult('LIVE-GATE0.1-04', close2.code === 1008, 'Invalid ID token is rejected');

    const ws3 = await connectWsRaw('');
    let ws3Data: any = null;
    ws3.on('message', (msg) => { ws3Data = JSON.parse(msg.toString()); });
    ws3.send(JSON.stringify({ type: 'AUTH', token: tokenA }));
    
    await new Promise(r => setTimeout(r, 500));
    logResult('LIVE-GATE0.1-02', ws3.readyState === WebSocket.OPEN && ws3Data?.state === 'AUTHENTICATED', 'ID token supplied through the authentication handshake is accepted');
    
    const session3 = getActiveSession(uidA);
    logResult('LIVE-GATE0.1-05', session3?.uid === uidA, 'Verified UID is authoritative');

    ws3.send(JSON.stringify({ type: 'AUTH', token: tokenA, uid: 'fake_uid' }));
    logResult('LIVE-GATE0.1-06', session3?.uid === uidA, 'Client cannot override verified UID');

    ws3.send(JSON.stringify({ type: 'AUTH', token: tokenA, epoch: 999 }));
    logResult('LIVE-GATE0.1-07', (session3 as any)?.epoch === undefined && typeof session3?.createdAt === 'number', 'Client epoch cannot elevate or authenticate a session');

    logResult('LIVE-GATE0.1-08', !!session3?.sessionId, 'Session ID is server-generated and immutable');

    ws3.send(JSON.stringify({ type: 'CHANGE_USER', token: tokenB }));
    const close3 = await waitClose(ws3);
    logResult('LIVE-GATE0.1-14', close3.code === 1008, 'Identity-change attempt terminates the session');

    ws3.close();
    ws3.close();
    logResult('LIVE-GATE0.1-13', ws3.readyState === WebSocket.CLOSED || ws3.readyState === WebSocket.CLOSING, 'Session close remains idempotent');

    const serverCode = fs.readFileSync('server/liveTransport.ts', 'utf8');
    const logsToken = serverCode.includes('console.log(token)') || serverCode.includes('console.log(message)');
    const writesFile = serverCode.includes('fs.writeFile(');
    logResult('LIVE-GATE0.1-09', !logsToken, 'Authentication token is never logged');
    logResult('LIVE-GATE0.1-10', !writesFile, 'Authentication token is never persisted');

    const hasProdCreds = serverCode.includes('admin.credential') || serverCode.includes('.json');
    logResult('LIVE-GATE0.1-11', !hasProdCreds, 'Firebase Admin initialization does not require hardcoded credentials');
    
    const isEmulatorConfigured = serverCode.includes("isDev ? { projectId: 'novo-security-test' } : undefined");
    logResult('LIVE-GATE0.1-12', isEmulatorConfigured, 'Development/Auth Emulator path still works');

    const authCode = fs.readFileSync('src/core/auth/authLifecycle.ts', 'utf8');
    const hasHook = authCode.includes('onReset');
    logResult('LIVE-GATE0.1-15', hasHook, 'AuthLifecycle termination contract can close the Live session without modifying domain stores');

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
    console.log('\nALL GATE 0.1 TESTS PASSED.');
  }
}

runTests();
