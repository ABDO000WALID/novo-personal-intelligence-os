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
  let lastUpstreamInput: any = null;
  let lastClientContent: any = null;
  let lastConnectConfig: any = null;

  const mockLiveSession = {
    close: () => { upstreamClosed = true; },
    sendRealtimeInput: (input: any) => { lastUpstreamInput = input; },
    sendClientContent: (content: any) => { lastClientContent = content; }
  };

  const mockAiClient = {
    live: {
      connect: async (options: any) => {
        if (mockFailUpstream) throw new Error('Mocked upstream failure');
        upstreamClosed = false;
        lastConnectConfig = options.config;
        storedCallbacks = options.callbacks;
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
    const isConfigValid = lastConnectConfig &&
      Array.isArray(lastConnectConfig.responseModalities) &&
      lastConnectConfig.responseModalities.length === 1 &&
      lastConnectConfig.responseModalities[0] === 'AUDIO' &&
      typeof lastConnectConfig.outputAudioTranscription === 'object' &&
      lastConnectConfig.outputAudioTranscription !== null;

    logResult('LIVE-GATE1-02', session?.geminiAdapter?.session === mockLiveSession && !!isConfigValid, 'Server creates the Gemini upstream connection with responseModalities=[AUDIO] and outputAudioTranscription.');

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

    // --- GATE 2 TESTS ---
    // Wait and reset state before Gate 2 tests
    await new Promise(r => setTimeout(r, 100));
    
    // Create fresh client for Gate 2 tests
    const client5 = new LiveTransportClient();
    await client5.connect(wsBaseUrl, tokenA);
    await new Promise(r => setTimeout(r, 100));
    
    let receivedServerMessage: any = null;
    let receivedError: any = null;
    (client5 as any).ws.on('message', (data: Buffer) => {
       const msg = JSON.parse(data.toString());
       if (msg.type === 'GEMINI_SERVER_MESSAGE') {
           receivedServerMessage = msg.message;
       } else if (msg.type === 'ERROR') {
           receivedError = msg;
       }
    });

    // LIVE-GATE2-01: authenticated client message reaches Gemini adapter.
    lastUpstreamInput = null;
    const testInput = { text: "Hello Gemini" };
    (client5 as any).ws.send(JSON.stringify({ type: 'REALTIME_INPUT', input: testInput }));
    await new Promise(r => setTimeout(r, 100));
    const isCanonicalContent = lastClientContent &&
      lastClientContent.turnComplete === true &&
      lastClientContent.turns &&
      lastClientContent.turns.role === 'user' &&
      Array.isArray(lastClientContent.turns.parts) &&
      lastClientContent.turns.parts.length === 1 &&
      lastClientContent.turns.parts[0].text === "Hello Gemini";

    logResult('LIVE-GATE2-01', !!isCanonicalContent, 'authenticated text message reaches Gemini adapter via sendClientContent with canonical Content shape and turnComplete: true.');

    // LIVE-GATE2-01b: non-text media input (e.g. audio/video blob) routes to sendRealtimeInput fallback.
    lastUpstreamInput = null;
    const mediaInput = { audio: { mimeType: 'audio/pcm', data: 'BASE64AUDIO' } };
    (client5 as any).ws.send(JSON.stringify({ type: 'REALTIME_INPUT', input: mediaInput }));
    await new Promise(r => setTimeout(r, 100));
    logResult('LIVE-GATE2-01b', lastUpstreamInput && lastUpstreamInput.audio?.data === 'BASE64AUDIO', 'media input (audio/video) falls back to sendRealtimeInput.');

    // LIVE-GATE2-02: Gemini server message reaches the correct authenticated NOVO client.
    receivedServerMessage = null;
    const mockGeminiMessage = { serverContent: { text: "Hello Human" } };
    if (storedCallbacks && storedCallbacks.onmessage) {
       storedCallbacks.onmessage(mockGeminiMessage);
    }
    await new Promise(r => setTimeout(r, 100));
    logResult('LIVE-GATE2-02', receivedServerMessage && receivedServerMessage.serverContent?.text === "Hello Human", 'Gemini server message reaches the correct authenticated NOVO client.');

    // LIVE-GATE2-02b: Gemini server audio transcription delta is correctly processed without duplication
    const transcriptionDeltas: string[] = [];
    const handleDelta = (t: string) => transcriptionDeltas.push(t);
    client5.on('textDelta', handleDelta);

    // Case 1: outputTranscription only
    if (storedCallbacks && storedCallbacks.onmessage) {
      storedCallbacks.onmessage({
        serverContent: {
          outputTranscription: { text: "Streaming transcript from audio" }
        }
      });
    }
    await new Promise(r => setTimeout(r, 100));

    // Case 2: message with both modelTurn parts AND outputTranscription (should NOT duplicate)
    if (storedCallbacks && storedCallbacks.onmessage) {
      storedCallbacks.onmessage({
        serverContent: {
          modelTurn: { parts: [{ text: "Model part" }] },
          outputTranscription: { text: "Model part duplicate" }
        }
      });
    }
    await new Promise(r => setTimeout(r, 100));
    client5.off('textDelta', handleDelta);

    const isTranscriptionNormalized = transcriptionDeltas.length === 2 &&
      transcriptionDeltas[0] === "Streaming transcript from audio" &&
      transcriptionDeltas[1] === "Model part";

    logResult('LIVE-GATE2-02b', isTranscriptionNormalized, 'outputTranscription delta is extracted and not duplicated when modelTurn text exists.');

    // LIVE-GATE2-03: unauthenticated client cannot forward messages.
    lastUpstreamInput = null;
    const unauthClient = new WebSocket(wsBaseUrl);
    await new Promise(r => {
        unauthClient.on('open', r);
    });
    unauthClient.send(JSON.stringify({ type: 'REALTIME_INPUT', input: { text: "Sneaky" } }));
    await new Promise(r => setTimeout(r, 100));
    logResult('LIVE-GATE2-03', lastUpstreamInput === null, 'unauthenticated client cannot forward messages.');
    unauthClient.close();

    // LIVE-GATE2-04: malformed/unsupported message is rejected safely.
    receivedError = null;
    lastUpstreamInput = null;
    (client5 as any).ws.send(JSON.stringify({ type: 'REALTIME_INPUT', input: "invalid string" }));
    await new Promise(r => setTimeout(r, 100));
    const test4part1 = receivedError && receivedError.message === 'Malformed REALTIME_INPUT payload' && lastUpstreamInput === null;

    receivedError = null;
    lastUpstreamInput = null;
    (client5 as any).ws.send(JSON.stringify({ type: 'REALTIME_INPUT', input: { unsupported_key: "value" } }));
    await new Promise(r => setTimeout(r, 100));
    const test4part2 = receivedError && receivedError.message === 'Unsupported REALTIME_INPUT shape' && lastUpstreamInput === null;
    logResult('LIVE-GATE2-04', !!(test4part1 && test4part2), 'malformed/unsupported message is rejected safely.');

    // LIVE-GATE2-05: After the NOVO LiveSession closes, a subsequent client REALTIME_INPUT must NOT reach Gemini.
    lastUpstreamInput = null;
    client5.disconnect();
    await new Promise(r => setTimeout(r, 100)); // wait for close to propagate
    try {
        (client5 as any).ws.send(JSON.stringify({ type: 'REALTIME_INPUT', input: { text: "Should fail" } }));
    } catch(e) {
        // Might throw due to closed socket
    }
    await new Promise(r => setTimeout(r, 100));
    logResult('LIVE-GATE2-05', lastUpstreamInput === null, 'After NOVO LiveSession closes, REALTIME_INPUT must NOT reach Gemini.');

    // LIVE-GATE2-06: When the Gemini upstream closes/fails, the NOVO client/session must be cleaned up and no further bridge forwarding may occur.
    const client6 = new LiveTransportClient();
    await client6.connect(wsBaseUrl, tokenA);
    await new Promise(r => setTimeout(r, 100));
    
    lastUpstreamInput = null;
    // Simulate upstream close
    if (storedCallbacks && storedCallbacks.onclose) {
      storedCallbacks.onclose(new Event('close'));
    }
    await new Promise(r => setTimeout(r, 100));
    try {
        (client6 as any).ws.send(JSON.stringify({ type: 'REALTIME_INPUT', input: { text: "Should fail" } }));
    } catch(e) {
        // Socket closed
    }
    await new Promise(r => setTimeout(r, 100));
    const isClient6Closed = client6.getReadyState() === undefined || client6.getReadyState() === WebSocket.CLOSED;
    logResult('LIVE-GATE2-06', isClient6Closed && lastUpstreamInput === null && !getActiveSession(uidA), 'When Gemini upstream closes, no further bridge forwarding may occur.');

    // LIVE-GATE2-07: AuthLifecycle.reset() must terminate the bridge and both NOVO/Gemini resources, with no zombie forwarding remaining.
    const client7 = new LiveTransportClient();
    await client7.connect(wsBaseUrl, tokenA);
    await new Promise(r => setTimeout(r, 100));
    
    AuthLifecycle.reset();
    await new Promise(r => setTimeout(r, 100));
    
    lastUpstreamInput = null;
    try {
        (client7 as any).ws.send(JSON.stringify({ type: 'REALTIME_INPUT', input: { text: "Should fail" } }));
    } catch(e) {
        // Socket closed
    }
    await new Promise(r => setTimeout(r, 100));
    const isClient7Closed = client7.getReadyState() === undefined || client7.getReadyState() === WebSocket.CLOSED;
    logResult('LIVE-GATE2-07', isClient7Closed && upstreamClosed && lastUpstreamInput === null && !getActiveSession(uidA), 'AuthLifecycle.reset() terminates the bridge with no zombie forwarding.');

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
    console.log('\nALL GATE 1 AND 2 TESTS PASSED.');
  }
}

runTests();
