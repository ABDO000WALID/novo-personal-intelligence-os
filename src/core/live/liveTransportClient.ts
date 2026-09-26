import { AuthLifecycle } from '../auth/authLifecycle';

export type LiveConnectionState = 'CONNECTING' | 'AUTHENTICATING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

export interface LiveEventMap {
  state: (state: LiveConnectionState) => void;
  setupComplete: (sessionId?: string) => void;
  textDelta: (text: string) => void;
  turnComplete: (reason?: string) => void;
  interrupted: () => void;
  error: (error: Error) => void;
}

export class LiveTransportClient {
  private ws: WebSocket | null = null;
  private cleanupReset: (() => void) | null = null;
  private connectionPromise: Promise<void> | null = null;
  private state: LiveConnectionState = 'DISCONNECTED';

  private listeners = {
    state: new Set<LiveEventMap['state']>(),
    setupComplete: new Set<LiveEventMap['setupComplete']>(),
    textDelta: new Set<LiveEventMap['textDelta']>(),
    turnComplete: new Set<LiveEventMap['turnComplete']>(),
    interrupted: new Set<LiveEventMap['interrupted']>(),
    error: new Set<LiveEventMap['error']>(),
  };

  public on<K extends keyof LiveEventMap>(event: K, listener: LiveEventMap[K]): void {
    this.listeners[event].add(listener as any);
  }

  public off<K extends keyof LiveEventMap>(event: K, listener: LiveEventMap[K]): void {
    this.listeners[event].delete(listener as any);
  }

  private emit<K extends keyof LiveEventMap>(event: K, ...args: Parameters<LiveEventMap[K]>): void {
    for (const listener of this.listeners[event]) {
      try {
        (listener as any)(...args);
      } catch (e) {
        console.error(`Error in listener for event ${event}:`, e);
      }
    }
  }

  private setState(newState: LiveConnectionState) {
    if (this.state !== newState) {
      this.state = newState;
      this.emit('state', newState);
    }
  }

  public getState(): LiveConnectionState {
    return this.state;
  }

  connect(url: string, token: string): Promise<void> {
    if (this.ws) {
      return this.connectionPromise || Promise.resolve();
    }

    this.setState('CONNECTING');
    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        const socket = new WebSocket(url);
        this.ws = socket;
        
        socket.onopen = () => {
          if (this.ws !== socket) return;
          this.setState('AUTHENTICATING');
          socket.send(JSON.stringify({ type: 'AUTH', token }));
        };

        socket.onmessage = (event) => {
          if (this.ws !== socket) return;
          try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'CONNECTED') {
              this.setState('CONNECTED');
              resolve();
            } else if (data.type === 'ERROR') {
              this.emit('error', new Error(data.message || 'Server error'));
            } else if (data.type === 'GEMINI_SERVER_MESSAGE') {
              this.normalizeGeminiMessage(data.message);
            }
          } catch (e) {
            // Ignore malformed JSON envelopes silently without crashing
          }
        };

        socket.onclose = () => {
          if (this.ws !== socket) return;
          this.disconnect();
          reject(new Error('WebSocket closed during connection'));
        };

        socket.onerror = () => {
          if (this.ws !== socket) return;
          this.setState('ERROR');
          reject(new Error('WebSocket error during connection'));
        };

        // Wire up AuthLifecycle termination contract
        this.cleanupReset = AuthLifecycle.onReset(() => {
          this.disconnect();
        });
      } catch (err) {
        this.setState('ERROR');
        reject(err);
      }
    });

    return this.connectionPromise;
  }

  public sendText(text: string): boolean {
    if (this.state !== 'CONNECTED' || !this.ws) {
      return false; // Connection not ready
    }
    
    if (!text || text.trim().length === 0) {
      return false; // Do not send empty/invalid text
    }

    try {
      this.ws.send(JSON.stringify({
        type: 'REALTIME_INPUT',
        input: { text }
      }));
      return true;
    } catch (err) {
      return false;
    }
  }

  private normalizeGeminiMessage(message: any) {
    if (!message || typeof message !== 'object') return;

    // setupComplete
    if (message.setupComplete) {
      this.emit('setupComplete', message.setupComplete.sessionId);
    }

    // serverContent / modelTurn text parts or output transcription
    if (message.serverContent && typeof message.serverContent === 'object') {
      let emittedModelTurnText = false;
      const modelTurn = message.serverContent.modelTurn;
      if (modelTurn && Array.isArray(modelTurn.parts)) {
        for (const part of modelTurn.parts) {
          if (part && typeof part.text === 'string') {
            this.emit('textDelta', part.text);
            emittedModelTurnText = true;
          }
        }
      }

      // Output audio transcription text (used when streaming audio responses with outputAudioTranscription enabled)
      // Do not duplicate if modelTurn text parts were already emitted from this same message
      if (!emittedModelTurnText) {
        const outputTranscription = message.serverContent.outputTranscription;
        if (outputTranscription && typeof outputTranscription.text === 'string' && outputTranscription.text.length > 0) {
          this.emit('textDelta', outputTranscription.text);
        }
      }

      // Interrupted signal: upstream model was interrupted by client input
      if (message.serverContent.interrupted) {
        this.emit('interrupted');
      }

      // turn complete - allow optional reason or turnComplete boolean flag
      if ('turnCompleteReason' in message.serverContent || message.serverContent.turnComplete) {
        this.emit('turnComplete', message.serverContent.turnCompleteReason);
      }
    }
  }

  disconnect() {
    const ws = this.ws;
    if (ws) {
      this.ws = null;
      ws.close(1000, 'Client terminated session');
    }
    
    if (this.cleanupReset) {
      this.cleanupReset();
      this.cleanupReset = null;
    }
    
    this.connectionPromise = null;
    this.setState('DISCONNECTED');
  }

  // Internal test helper
  getReadyState(): number | undefined {
    return this.ws?.readyState;
  }
}
