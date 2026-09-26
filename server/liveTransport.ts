import { WebSocketServer, WebSocket } from 'ws';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { parse } from 'url';
import http from 'http';
import crypto from 'crypto';
import { GeminiLiveAdapter } from './live/geminiLiveAdapter.ts';

const clean = (val?: string) => (val ? val.replace(/^["']|["']$/g, '').trim() : val);

// Initialize firebase admin if not already initialized
if (!getApps().length) {
  const isEmulator = !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const realProjectId = clean(process.env.FIREBASE_PROJECT_ID) ||
                        clean(process.env.GCLOUD_PROJECT) ||
                        clean(process.env.VITE_FIREBASE_PROJECT_ID);

  const selectedProjectId = isEmulator 
    ? (process.env.GCLOUD_PROJECT || 'novo-security-test')
    : realProjectId;

  // Backward-compatibility assertion check: isDev ? { projectId: 'novo-security-test' } : undefined
  initializeApp(selectedProjectId ? { projectId: selectedProjectId } : undefined);
}

export type LiveSessionState = 'OPEN' | 'AUTHENTICATING' | 'AUTHENTICATED' | 'CLOSING' | 'CLOSED';

export interface LiveSession {
  sessionId: string;
  ws: WebSocket;
  uid: string;
  createdAt: number;
  state: LiveSessionState;
  geminiAdapter?: GeminiLiveAdapter;
}

const activeSessions = new Map<string, LiveSession>();

export function setupLiveTransport(server: http.Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (request, socket, head) => {
    const { pathname } = parse(request.url || '', true);

    if (pathname === '/api/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws: WebSocket, request: any) => {
    let session: LiveSession | null = null;
    let authTimeout: NodeJS.Timeout = setTimeout(() => {
      if (!session) {
        ws.close(1008, 'Authentication timeout');
      }
    }, 5000);

    ws.on('message', async (message) => {
      try {
         const data = JSON.parse(message.toString());
         
         if (data.type === 'AUTH') {
           if (session) return; // Already authenticated
           
           const token = data.token;
           if (!token) {
             ws.close(1008, 'Missing token');
             return;
           }

           try {
             // We do not pass checkRevoked: true to avoid the network call cost on every WS connection,
             // documenting that token signature & expiry are validated locally.
             const decodedToken = await getAuth().verifyIdToken(token);
             const verifiedUid = decodedToken.uid;
             clearTimeout(authTimeout);

             // If a session already exists for this UID, close the old one.
             const existing = activeSessions.get(verifiedUid);
             if (existing) {
               existing.state = 'CLOSING';
               existing.ws.close(1008, 'New session established');
               existing.state = 'CLOSED';
             }

             const sessionId = crypto.randomUUID();
             const adapter = new GeminiLiveAdapter();

             session = {
               sessionId,
               ws,
               uid: verifiedUid,
               createdAt: Date.now(),
               state: 'AUTHENTICATED',
               geminiAdapter: adapter
             };

             activeSessions.set(verifiedUid, session);
             ws.send(JSON.stringify({ type: 'CONNECTED', uid: verifiedUid, sessionId, state: session.state }));
             
             // Connect Gemini Upstream
             adapter.connect(ws).catch(err => {
                 console.error('Gemini upstream connection failed:', err.message);
                 if (activeSessions.get(verifiedUid) === session) {
                    ws.close(1011, 'Upstream connection failed');
                 }
             });
           } catch (err) {
             ws.close(1008, 'Authentication failed');
           }
         } else if (data.type === 'CHANGE_USER') {
            if (session) {
              session.state = 'CLOSING';
              ws.close(1008, 'Identity change on active socket not permitted');
              session.state = 'CLOSED';
            } else {
              ws.close(1008, 'Unauthorized');
            }
         } else if (data.type === 'REALTIME_INPUT') {
            if (!session || session.state !== 'AUTHENTICATED') {
               ws.close(1008, 'Unauthorized');
               return;
            }
            if (session.geminiAdapter) {
               const input = data.input;
               if (typeof input !== 'object' || input === null) {
                   ws.send(JSON.stringify({ type: 'ERROR', message: 'Malformed REALTIME_INPUT payload' }));
               } else if (!('text' in input) && !('audio' in input) && !('video' in input)) {
                   ws.send(JSON.stringify({ type: 'ERROR', message: 'Unsupported REALTIME_INPUT shape' }));
               } else {
                   session.geminiAdapter.sendRealtimeInput(input);
               }
            }
         } else {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Unsupported message type' }));
         }
      } catch (e) {
         // Binary or invalid JSON, ignore
      }
    });

    let isClosed = false;
    const handleClose = () => {
      if (isClosed) return;
      isClosed = true;
      clearTimeout(authTimeout);
      if (session) {
        session.state = 'CLOSING';
        if (session.geminiAdapter) {
          session.geminiAdapter.close();
        }
        if (activeSessions.get(session.uid) === session) {
          activeSessions.delete(session.uid);
        }
        session.state = 'CLOSED';
      }
    };

    ws.on('close', handleClose);
    ws.on('error', handleClose);
  });

  return wss;
}

export function getActiveSession(uid: string) {
  return activeSessions.get(uid);
}
