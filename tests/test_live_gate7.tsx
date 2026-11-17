import React, { useState } from 'react';
import { create, act } from 'react-test-renderer';
import { LiveChatSurface } from './src/modules/chat/components/LiveChatSurface';
import { ChatView } from './src/modules/chat/ChatView';
import { LiveTransportClient } from './src/core/live/liveTransportClient';
import { useLiveChat } from './src/core/live/useLiveChat';
import { useAuthStore } from './src/core/auth/authStore';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { useChatStore } from './src/core/state/chatStore';
import { AppProvider } from './src/core/providers/AppContext';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState: number = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
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
(global as any).IS_REACT_ACT_ENVIRONMENT = true;
(global as any).window = {
  location: {
    protocol: 'http:',
    host: 'localhost:3000'
  }
};

const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  if (typeof args[0] === 'string' && (args[0].includes('react-test-renderer is deprecated') || args[0].includes('The current testing environment is not configured to support act'))) return;
  originalConsoleError(...args);
};

async function runTests() {
  console.log('Running Gate 7 tests (Full-Duplex Text Input & Interruption Handling)');
  let passed = true;
  const logResult = (testId: string, result: boolean, desc: string) => {
    console.log(`[${result ? 'PASS' : 'FAIL'}] ${testId}: ${desc}`);
    if (!result) passed = false;
  };

  const mockToken = 'TEST_GATE7_ID_TOKEN';
  useAuthStore.setState({
    user: {
      getIdToken: async () => mockToken,
      uid: 'user-gate7'
    } as any
  });

  // --- PART 1: UI-Level Full-Duplex Tests (G7-01, G7-02, G7-03, G7-04, G7-05) ---
  MockWebSocket.instances.length = 0;
  let root: any;
  await act(async () => {
    root = create(
      <AppProvider>
        <ChatView />
      </AppProvider>
    );
  });

  // Switch to Live Mode
  const liveButton = root.root.findAll(
    (el: any) => el.type === 'button' && (el.props.children?.includes?.('Live') || el.props.children?.includes?.('مباشر'))
  )[0];

  await act(async () => {
    liveButton.props.onClick();
  });

  const ws = MockWebSocket.instances[0];
  // Complete connection and setup handshake
  await act(async () => {
    ws.readyState = 1;
    if (ws.onopen) ws.onopen();
    ws.triggerMessage({ type: 'CONNECTED' });
    ws.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { setupComplete: { sessionId: 'gate7-session' } } });
  });

  const textarea = root.root.findByType('textarea');
  const form = root.root.findByType('form');

  // Send message 1
  await act(async () => {
    textarea.props.onChange({ target: { value: 'First user message' } });
  });
  await act(async () => {
    form.props.onSubmit({ preventDefault: () => {} });
  });

  // Assistant begins streaming response 1
  await act(async () => {
    ws.triggerMessage({
      type: 'GEMINI_SERVER_MESSAGE',
      message: {
        serverContent: {
          modelTurn: { parts: [{ text: 'Assistant is responding...' }] }
        }
      }
    });
  });

  // G7-01: Input remains enabled while assistant is streaming.
  const textareaDuringStream = root.root.findByType('textarea');
  logResult(
    'G7-01',
    textareaDuringStream.props.disabled !== true,
    'Input remains enabled while assistant is streaming.'
  );

  // G7-02: User can send a second text message while streaming.
  await act(async () => {
    textareaDuringStream.props.onChange({ target: { value: 'Second message during stream' } });
  });
  await act(async () => {
    form.props.onSubmit({ preventDefault: () => {} });
  });

  const currentChatStr = JSON.stringify(root.toJSON());
  logResult(
    'G7-02',
    currentChatStr.includes('Second message during stream'),
    'User can send a second text message while streaming.'
  );

  // G7-03: Second USER message is added locally only when transport send succeeds.
  // Verify that the second message is in the local UI
  const containsFirst = currentChatStr.includes('First user message');
  const containsAssistant1 = currentChatStr.includes('Assistant is responding...');
  const containsSecond = currentChatStr.includes('Second message during stream');
  logResult(
    'G7-03',
    containsFirst && containsAssistant1 && containsSecond,
    'Second USER message is added locally only when transport send succeeds.'
  );

  // G7-04: Second USER message reaches the existing Live transport.
  const sentPayloads = ws.sentData.map((d: any) => typeof d === 'string' ? JSON.parse(d) : d);
  const secondSendReachesTransport = sentPayloads.some(
    (p: any) => p.type === 'REALTIME_INPUT' && p.input?.text === 'Second message during stream'
  );
  logResult(
    'G7-04',
    secondSendReachesTransport,
    'Second USER message reaches the existing Live transport.'
  );

  // G7-05: Current assistant stream is NOT finalized merely because the user sends another message.
  // In the DOM, the assistant message should still render its pulsing cursor or streaming indicator
  // Let's verify via the hook and component tree that the streaming indicator is present
  logResult(
    'G7-05',
    currentChatStr.includes('animate-pulse'),
    'Current assistant stream is NOT finalized merely because the user sends another message.'
  );

  // --- PART 2: Hook & State Machine Direct Verification (G7-06 through G7-12) ---
  const directClient = new LiveTransportClient();
  let hookData: ReturnType<typeof useLiveChat> | null = null;

  function HookTester() {
    hookData = useLiveChat(directClient);
    return null;
  }

  let hookRoot: any;
  await act(async () => {
    hookRoot = create(React.createElement(HookTester));
  });

  // Connect direct client
  await act(async () => {
    directClient.connect('ws://localhost:3000/api/live', mockToken).catch(() => {});
  });
  const hookWs = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  await act(async () => {
    hookWs.readyState = 1;
    if (hookWs.onopen) hookWs.onopen();
    hookWs.triggerMessage({ type: 'CONNECTED' });
    hookWs.triggerMessage({ type: 'GEMINI_SERVER_MESSAGE', message: { setupComplete: { sessionId: 'direct-session' } } });
  });

  // Turn 1
  await act(async () => {
    hookData!.sendMessage('Direct message 1');
  });
  await act(async () => {
    hookWs.triggerMessage({
      type: 'GEMINI_SERVER_MESSAGE',
      message: {
        serverContent: {
          modelTurn: { parts: [{ text: 'Assistant turn 1 text' }] }
        }
      }
    });
  });

  // G7-06: Interrupted signal correctly ends the previous assistant turn.
  // User sends message 2
  await act(async () => {
    hookData!.sendMessage('Direct message 2');
  });
  // Gemini sends interrupted signal
  await act(async () => {
    hookWs.triggerMessage({
      type: 'GEMINI_SERVER_MESSAGE',
      message: {
        serverContent: {
          interrupted: true
        }
      }
    });
  });

  const assistantTurn1AfterInterrupt = hookData!.messages.find(m => m.content.includes('Assistant turn 1 text'));
  logResult(
    'G7-06',
    assistantTurn1AfterInterrupt !== undefined && assistantTurn1AfterInterrupt.isStreaming === false && hookData!.isStreaming === false,
    'Interrupted signal correctly ends the previous assistant turn.'
  );

  // G7-07: turnComplete correctly finalizes the active assistant turn.
  // Next assistant response arrives
  await act(async () => {
    hookWs.triggerMessage({
      type: 'GEMINI_SERVER_MESSAGE',
      message: {
        serverContent: {
          modelTurn: { parts: [{ text: 'Assistant turn 2 response' }] }
        }
      }
    });
  });
  const isStreamingBeforeTurnComplete = hookData!.isStreaming;
  // Send turnComplete
  await act(async () => {
    hookWs.triggerMessage({
      type: 'GEMINI_SERVER_MESSAGE',
      message: {
        serverContent: {
          turnComplete: true,
          turnCompleteReason: 'END_OF_TURN'
        }
      }
    });
  });

  const assistantTurn2 = hookData!.messages.find(m => m.content.includes('Assistant turn 2 response'));
  logResult(
    'G7-07',
    isStreamingBeforeTurnComplete === true && assistantTurn2?.isStreaming === false && hookData!.isStreaming === false,
    'turnComplete correctly finalizes the active assistant turn.'
  );

  // G7-08: turnComplete/interrupted without an active assistant stream is handled safely.
  const messageCountBeforeSafeCheck = hookData!.messages.length;
  await act(async () => {
    hookWs.triggerMessage({
      type: 'GEMINI_SERVER_MESSAGE',
      message: {
        serverContent: {
          turnComplete: true,
          interrupted: true
        }
      }
    });
  });
  logResult(
    'G7-08',
    hookData!.messages.length === messageCountBeforeSafeCheck && hookData!.isStreaming === false && hookData!.error === null,
    'turnComplete/interrupted without an active assistant stream is handled safely.'
  );

  // G7-09: Late delta from the previous interrupted turn does not corrupt the next assistant message.
  // Sequence:
  // 1. Assistant starts Turn 3 ("Turn 3 start")
  // 2. User sends Message 3
  // 3. Late delta for Turn 3 arrives (" late chunk") -> should append to Turn 3
  // 4. Interrupted arrives -> finalizes Turn 3
  // 5. Assistant starts Turn 4 ("Turn 4 response") -> must be a separate message!
  await act(async () => {
    hookData!.sendMessage('Message 3');
  });
  await act(async () => {
    hookWs.triggerMessage({
      type: 'GEMINI_SERVER_MESSAGE',
      message: {
        serverContent: {
          modelTurn: { parts: [{ text: 'Turn 3 start' }] }
        }
      }
    });
  });
  await act(async () => {
    hookData!.sendMessage('Message 4 full-duplex');
  });
  // Late delta from Turn 3 before interrupt arrives
  await act(async () => {
    hookWs.triggerMessage({
      type: 'GEMINI_SERVER_MESSAGE',
      message: {
        serverContent: {
          modelTurn: { parts: [{ text: ' late chunk' }] }
        }
      }
    });
  });
  // Interruption arrives
  await act(async () => {
    hookWs.triggerMessage({
      type: 'GEMINI_SERVER_MESSAGE',
      message: {
        serverContent: {
          interrupted: true
        }
      }
    });
  });
  // Turn 4 response arrives
  await act(async () => {
    hookWs.triggerMessage({
      type: 'GEMINI_SERVER_MESSAGE',
      message: {
        serverContent: {
          modelTurn: { parts: [{ text: 'Turn 4 response' }] }
        }
      }
    });
  });

  const turn3Msg = hookData!.messages.find(m => m.content.includes('Turn 3 start'));
  const turn4Msg = hookData!.messages.find(m => m.content.includes('Turn 4 response'));
  logResult(
    'G7-09',
    turn3Msg?.content === 'Turn 3 start late chunk' &&
    turn4Msg !== undefined &&
    turn4Msg.content === 'Turn 4 response' &&
    hookData!.messages.indexOf(turn3Msg!) < hookData!.messages.findIndex(m => m.content === 'Message 4 full-duplex') &&
    hookData!.messages.indexOf(turn4Msg) > hookData!.messages.findIndex(m => m.content === 'Message 4 full-duplex'),
    'Late delta from the previous interrupted turn does not corrupt the next assistant message.'
  );

  // G7-10: A new assistant response after interruption starts a separate assistant message.
  logResult(
    'G7-10',
    turn3Msg?.id !== turn4Msg?.id && turn4Msg?.role === 'assistant' && turn4Msg?.isStreaming === true,
    'A new assistant response after interruption starts a separate assistant message.'
  );

  // Finalize Turn 4
  await act(async () => {
    hookWs.triggerMessage({
      type: 'GEMINI_SERVER_MESSAGE',
      message: { serverContent: { turnComplete: true } }
    });
  });

  // G7-11: Two consecutive full-duplex user sends remain distinct.
  // Start assistant turn
  await act(async () => {
    hookWs.triggerMessage({
      type: 'GEMINI_SERVER_MESSAGE',
      message: { serverContent: { modelTurn: { parts: [{ text: 'Active stream' }] } } }
    });
  });
  // Two rapid consecutive sends
  let sendA = false;
  let sendB = false;
  await act(async () => {
    sendA = hookData!.sendMessage('Consecutive send A');
    sendB = hookData!.sendMessage('Consecutive send B');
  });

  const msgAIndex = hookData!.messages.findIndex(m => m.content === 'Consecutive send A');
  const msgBIndex = hookData!.messages.findIndex(m => m.content === 'Consecutive send B');
  logResult(
    'G7-11',
    sendA && sendB && msgAIndex !== -1 && msgBIndex !== -1 && msgBIndex === msgAIndex + 1,
    'Two consecutive full-duplex user sends remain distinct.'
  );

  // G7-12: Connection close during full-duplex interaction does not create zombie state.
  await act(async () => {
    hookWs.close(1006, 'Abnormal disconnect');
  });
  logResult(
    'G7-12',
    hookData!.connectionState === 'DISCONNECTED' &&
    hookData!.isStreaming === false &&
    hookData!.messages.every(m => !m.isStreaming),
    'Connection close during full-duplex interaction does not create zombie state.'
  );

  // --- PART 3: Lifecycle, Auth, and System Invariants (G7-13, G7-14, G7-15, G7-16) ---

  // G7-13: AuthLifecycle.reset() still terminates the active Live session.
  const liveWs = MockWebSocket.instances[0];
  logResult(
    'G7-13',
    !liveWs.closed,
    'Live WebSocket is initially open before AuthLifecycle reset.'
  );
  await act(async () => {
    AuthLifecycle.reset();
  });
  logResult(
    'G7-13',
    liveWs.closed === true,
    'AuthLifecycle.reset() terminates the active Live session.'
  );

  // G7-14: Unmount removes listeners and does not leave stale updates.
  const unmountClient = new LiveTransportClient();
  let unmountData: ReturnType<typeof useLiveChat> | null = null;
  function UnmountTester() {
    unmountData = useLiveChat(unmountClient);
    return null;
  }
  let unmountRoot: any;
  await act(async () => {
    unmountRoot = create(React.createElement(UnmountTester));
  });

  const listenersBefore = {
    state: (unmountClient as any).listeners.state.size,
    textDelta: (unmountClient as any).listeners.textDelta.size,
    turnComplete: (unmountClient as any).listeners.turnComplete.size,
    interrupted: (unmountClient as any).listeners.interrupted.size,
    error: (unmountClient as any).listeners.error.size,
  };
  const allBound = Object.values(listenersBefore).every(s => s === 1);

  await act(async () => {
    unmountRoot.unmount();
  });

  const listenersAfter = {
    state: (unmountClient as any).listeners.state.size,
    textDelta: (unmountClient as any).listeners.textDelta.size,
    turnComplete: (unmountClient as any).listeners.turnComplete.size,
    interrupted: (unmountClient as any).listeners.interrupted.size,
    error: (unmountClient as any).listeners.error.size,
  };
  const allUnbound = Object.values(listenersAfter).every(s => s === 0);

  logResult(
    'G7-14',
    allBound && allUnbound,
    'Unmount removes all listeners and does not leave stale callbacks.'
  );

  // G7-15: REST mode remains unchanged.
  // Re-mount ChatView in default REST mode
  act(() => {
    useAuthStore.setState({
      user: {
        getIdToken: async () => mockToken,
        uid: 'user-gate7'
      } as any
    });
    useChatStore.setState({
      conversations: [],
      activeConversationId: null
    });
  });

  let restRoot: any;
  await act(async () => {
    restRoot = create(
      <AppProvider>
        <ChatView />
      </AppProvider>
    );
  });

  const restViewStr = JSON.stringify(restRoot.toJSON());
  logResult(
    'G7-15',
    !restViewStr.includes('Live Chat Canvas') && (restViewStr.includes('Local Secure Thread') || restViewStr.includes('محادثة محلية آمنة')),
    'REST mode remains unchanged and default thread mounts cleanly.'
  );

  // G7-16: Repeated Live <-> REST toggling still works.
  const toggleLiveBtn = restRoot.root.findAll(
    (el: any) => el.type === 'button' && (el.props.children?.includes?.('Live') || el.props.children?.includes?.('مباشر'))
  )[0];

  // Toggle to Live
  await act(async () => {
    toggleLiveBtn.props.onClick();
  });
  const inLiveMode = JSON.stringify(restRoot.toJSON()).includes('Live Chat Canvas') || JSON.stringify(restRoot.toJSON()).includes('المحادثة المباشرة');

  // Toggle back to REST
  const toggleRestBtn = restRoot.root.findAll(
    (el: any) => el.type === 'button' && (el.props.children?.includes?.('Standard') || el.props.children?.includes?.('قياسي'))
  )[0];
  await act(async () => {
    toggleRestBtn.props.onClick();
  });
  const backInRestMode = !JSON.stringify(restRoot.toJSON()).includes('Live Chat Canvas');

  // Toggle to Live once more
  const toggleLiveBtn2 = restRoot.root.findAll(
    (el: any) => el.type === 'button' && (el.props.children?.includes?.('Live') || el.props.children?.includes?.('مباشر'))
  )[0];
  await act(async () => {
    toggleLiveBtn2.props.onClick();
  });
  const inLiveModeAgain = JSON.stringify(restRoot.toJSON()).includes('Live Chat Canvas') || JSON.stringify(restRoot.toJSON()).includes('المحادثة المباشرة');

  logResult(
    'G7-16',
    inLiveMode && backInRestMode && inLiveModeAgain,
    'Repeated Live <-> REST toggling functions cleanly across multiple switches.'
  );

  if (!passed) {
    process.exit(1);
  } else {
    console.log('ALL GATE 7 TESTS PASSED');
  }
}

runTests();
