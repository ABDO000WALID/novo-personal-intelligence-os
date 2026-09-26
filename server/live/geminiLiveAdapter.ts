import { GoogleGenAI, Modality } from "@google/genai";
import { WebSocket } from 'ws';

// Testing seam
export let mockGenAIClient: any = null;
export function setMockGenAIClient(mock: any) { 
  mockGenAIClient = mock; 
}

export class GeminiLiveAdapter {
  private ai: GoogleGenAI | null = null;
  public session: any = null; // LiveConnectSession
  private clientWs: WebSocket | null = null;
  
  constructor() {
    if (mockGenAIClient) {
      this.ai = mockGenAIClient;
    } else {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        this.ai = new GoogleGenAI({ apiKey });
      }
    }
  }

  async connect(clientWs: WebSocket): Promise<void> {
    this.clientWs = clientWs;
    if (!this.ai) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    try {
      this.session = await this.ai.live.connect({
        model: "gemini-3.8-live",
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          systemInstruction: "You are a helpful assistant.",
        },
        callbacks: {
          onmessage: (message: any) => {
            if (this.clientWs && this.clientWs.readyState === WebSocket.OPEN) {
              this.clientWs.send(JSON.stringify({
                type: 'GEMINI_SERVER_MESSAGE',
                message
              }));
            }
          },
          onclose: (e: any) => {
            // If the upstream connection drops unexpectedly, close the client
            // WebSocket. This triggers the standard NOVO session cleanup.
            if (this.clientWs && this.clientWs.readyState === WebSocket.OPEN) {
              this.clientWs.close(1011, 'Upstream disconnected');
            }
          }
        }
      });
    } catch (err) {
      this.session = null;
      throw err;
    }
  }

  close() {
    if (this.session && typeof this.session.close === 'function') {
      try {
        this.session.close();
      } catch (err) {
        console.error('Error closing Gemini upstream session:', err);
      }
    }
    this.session = null;
  }

  sendRealtimeInput(input: any) {
    if (!this.session) return;
    try {
      if (input && typeof input.text === 'string') {
        if (typeof this.session.sendClientContent === 'function') {
          this.session.sendClientContent({
            turns: {
              role: 'user',
              parts: [{ text: input.text }]
            },
            turnComplete: true
          });
          return;
        }
      }
      if (typeof this.session.sendRealtimeInput === 'function') {
        this.session.sendRealtimeInput(input);
      }
    } catch (err) {
      console.error('Error forwarding input to Gemini:', err);
    }
  }
}
