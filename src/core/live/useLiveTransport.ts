import { useState, useEffect, useCallback } from 'react';
import { LiveTransportClient, LiveConnectionState } from './liveTransportClient';

export type HookConnectionState = 'CONNECTING' | 'AUTHENTICATING' | 'NOVO_CONNECTED' | 'DISCONNECTED' | 'ERROR';

export function useLiveTransport(client: LiveTransportClient) {
  // Initialize state from the current client state
  const [connectionState, setConnectionState] = useState<HookConnectionState>(() => {
    const state = client.getState();
    return state === 'CONNECTED' ? 'NOVO_CONNECTED' : state;
  });
  
  const [isGeminiReady, setIsGeminiReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    const handleState = (newState: LiveConnectionState) => {
      if (!mounted) return;
      setConnectionState(newState === 'CONNECTED' ? 'NOVO_CONNECTED' : newState);
      if (newState !== 'CONNECTED') {
        setIsGeminiReady(false);
      }
    };

    const handleSetupComplete = () => {
      if (!mounted) return;
      setIsGeminiReady(true);
    };

    const handleError = (err: Error) => {
      if (!mounted) return;
      setError(err);
    };

    // Register listeners on mount
    client.on('state', handleState);
    client.on('setupComplete', handleSetupComplete);
    client.on('error', handleError);

    // Unregister exact same listeners on unmount
    return () => {
      mounted = false;
      client.off('state', handleState);
      client.off('setupComplete', handleSetupComplete);
      client.off('error', handleError);
    };
  }, [client]);

  const connect = useCallback((url: string, token: string) => {
    setError(null);
    return client.connect(url, token);
  }, [client]);

  const disconnect = useCallback(() => {
    client.disconnect();
  }, [client]);

  const sendText = useCallback((text: string) => {
    return client.sendText(text);
  }, [client]);

  return {
    client,
    connectionState,
    isGeminiReady,
    error,
    connect,
    disconnect,
    sendText
  };
}
