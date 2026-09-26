import express from 'express';
import { setupLiveTransport } from './server/liveTransport.ts';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

let cachedAvailableModels = [];
let modelDiscoveryPromise = null;

const MODEL_STATE_HEALTHY = 'HEALTHY';
const MODEL_STATE_COOLDOWN = 'COOLDOWN';
const MODEL_STATE_PROBING = 'PROBING';

// Record<string, { state: string, consecutiveFailures: number, cooldownUntil: number, activeProbes: number }>
const modelHealth = {}; 

async function discoverAvailableModels(apiKey) {
  if (cachedAvailableModels.length > 0) return cachedAvailableModels;
  if (!modelDiscoveryPromise) {
    modelDiscoveryPromise = (async () => {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.list();
        const available = [];
        
        for await (const model of response) {
           if (model.supportedActions && model.supportedActions.includes('generateContent')) {
             const name = model.name.replace('models/', '');
             
             // Capability filter: standard chat / text reasoning
             if (
               !name.includes('vision') && 
               !name.includes('embedding') && 
               !name.includes('tts') &&
               (name.includes('flash') || name.includes('pro'))
             ) {
               available.push(name);
             }
           }
        }
        
        cachedAvailableModels = available;
        console.log('[MODEL DISCOVERY] Eligible models:', available.join(', '));
        return available;
      } catch (err) {
        console.error('[MODEL DISCOVERY ERROR]', err);
        return [];
      }
    })();
  }
  return modelDiscoveryPromise;
}

function getHealthyModels(availableModels, envModel) {
  const now = Date.now();
  const healthy = [];
  
  for (const m of availableModels) {
    let health = modelHealth[m];
    if (!health) {
       healthy.push(m);
       continue;
    }
    
    if (health.state === MODEL_STATE_HEALTHY) {
       healthy.push(m);
    } else if (health.state === MODEL_STATE_COOLDOWN) {
       if (now >= health.cooldownUntil) {
           health.state = MODEL_STATE_PROBING;
           health.activeProbes = 0;
           healthy.push(m);
       }
    } else if (health.state === MODEL_STATE_PROBING) {
       if (health.activeProbes < 1) { // strict concurrency for probes
           healthy.push(m);
       }
    }
  }

  const fallbacks = [];
  if (envModel && healthy.includes(envModel)) {
    fallbacks.push(envModel);
  }
  
  const preferences = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-2.0-flash'];
  
  for (const pref of preferences) {
    if (healthy.includes(pref) && !fallbacks.includes(pref)) {
      fallbacks.push(pref);
    }
  }
  
  for (const model of healthy) {
    if (!fallbacks.includes(model)) {
      fallbacks.push(model);
    }
  }
  
  // If no healthy verified models, emergency fallback
  if (fallbacks.length === 0 && availableModels.length > 0) {
    if (envModel && availableModels.includes(envModel)) return [envModel];
    for (const pref of preferences) {
      if (availableModels.includes(pref)) return [pref];
    }
    return [availableModels[0]];
  }
  
  return fallbacks;
}

function markModelProbing(modelName) {
  const health = modelHealth[modelName];
  if (health && health.state === MODEL_STATE_PROBING) {
    health.activeProbes++;
  }
}

function unmarkModelProbing(modelName) {
  const health = modelHealth[modelName];
  if (health && health.state === MODEL_STATE_PROBING) {
    health.activeProbes = Math.max(0, health.activeProbes - 1);
  }
}

function reportModelFailure(modelName, statusCode, errStr) {
  if (statusCode === 404 || (statusCode === 400 && (errStr.includes('interactions api') || errStr.includes('not support')))) {
    // Model incompatibility or doesn't exist
    cachedAvailableModels = cachedAvailableModels.filter(m => m !== modelName);
    console.log(`[MODEL HEALTH] model=${modelName} action=removed reason=${statusCode}`);
    return;
  }
  
  // For 400 bad request (e.g. invalid json), do not penalize model globally
  if (statusCode === 400) {
    console.log(`[MODEL HEALTH] model=${modelName} action=ignored reason=400_BAD_REQUEST`);
    return;
  }

  // 429, 503, 500, network timeouts
  if ([429, 503, 500].includes(statusCode)) {
    const health = modelHealth[modelName] || { state: MODEL_STATE_HEALTHY, consecutiveFailures: 0, cooldownUntil: 0, activeProbes: 0 };
    health.consecutiveFailures++;
    // Exponential backoff
    const cooldownMs = health.consecutiveFailures === 1 ? 10000 : (health.consecutiveFailures === 2 ? 30000 : 60000);
    health.state = MODEL_STATE_COOLDOWN;
    health.cooldownUntil = Date.now() + cooldownMs;
    health.activeProbes = 0;
    modelHealth[modelName] = health;
    console.log(`[MODEL HEALTH] model=${modelName} action=cooldown reason=${statusCode} duration=${cooldownMs}ms consecutive=${health.consecutiveFailures}`);
  }
}

function reportModelSuccess(modelName) {
  const health = modelHealth[modelName];
  if (health && health.state !== MODEL_STATE_HEALTHY) {
    console.log(`[MODEL HEALTH] model=${modelName} action=recovered`);
  }
  // Clear failures and mark healthy
  modelHealth[modelName] = { state: MODEL_STATE_HEALTHY, consecutiveFailures: 0, cooldownUntil: 0, activeProbes: 0 };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '2mb' }));

  app.post('/api/ai/chat', async (req, res) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    const startTime = Date.now();
    
    try {
      const { prompt, context, history } = req.body;

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Prompt is required and must be a non-empty string.' }
        });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: { code: 'AI_AUTH_ERROR', message: 'GEMINI_API_KEY is not configured on the server.' }
        });
      }

      const availableModels = await discoverAvailableModels(apiKey);
      const envModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
      
      const modelsToTry = getHealthyModels(availableModels, envModel);
      console.log(`[MODEL ROUTER] req=${requestId} available=${availableModels.length} healthy=${modelsToTry.length} preferred=${modelsToTry[0] || 'none'}`);

      if (modelsToTry.length === 0) {
        return res.status(503).json({
          error: { 
            code: 'PROVIDER_UNAVAILABLE', 
            message: 'All AI models are currently on cooldown due to high demand. Please try again.',
            retryable: true
          }
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction = context || 'You are NOVO, a productivity AI assistant.';
      
      let formattedHistory = [];
      if (Array.isArray(history)) {
        formattedHistory = history
          .filter(msg => msg && (msg.role === 'user' || msg.role === 'model' || msg.role === 'assistant'))
          .map(msg => ({
            role: msg.role === 'assistant' ? 'model' : msg.role,
            parts: [{ text: msg.content || '' }]
          }));
      }

      const contents = [
        ...formattedHistory,
        { role: 'user', parts: [{ text: prompt.trim() }] }
      ];

      const maxAttempts = Math.min(6, modelsToTry.length); // Max attempts bounded by healthy models list length
      let attempt = 1;
      let fallbackIndex = 0;
      let finalError = null;

      while (attempt <= maxAttempts && fallbackIndex < modelsToTry.length) {
        const currentModel = modelsToTry[fallbackIndex];
        markModelProbing(currentModel);
        
        try {
          if (req.socket.destroyed) {
            console.log(`[AI REQUEST] id=${requestId} status=ABORTED duration=${Date.now() - startTime}ms`);
            unmarkModelProbing(currentModel);
            return;
          }

          console.log(`[AI ATTEMPT] requestId=${requestId} model=${currentModel} attempt=${attempt}`);
          
          // Basic abort controller
          const abortController = new AbortController();
          const reqCloseHandler = () => abortController.abort();
          req.on('close', reqCloseHandler);
          const timeoutId = setTimeout(() => abortController.abort(), 60000); // 60s max per request

          const response = await ai.models.generateContent({
            model: currentModel,
            contents,
            config: {
              systemInstruction: systemInstruction,
              temperature: 0.7,
            }
            // SDK v0.1+ might support abort signal in future/current depending on version.
            // If not, it will be silently ignored which is safe.
          });
          
          clearTimeout(timeoutId);
          req.removeListener('close', reqCloseHandler);

          if (!response || !response.text) {
             throw new Error('INVALID_RESPONSE');
          }

          unmarkModelProbing(currentModel);
          reportModelSuccess(currentModel);
          console.log(`[AI SUCCESS] requestId=${requestId} model=${currentModel} duration=${Date.now() - startTime}ms`);
          return res.json({
            text: response.text
          });
          
        } catch (err) {
          unmarkModelProbing(currentModel);
          const errStr = String(err).toLowerCase();
          const duration = Date.now() - startTime;
          
          let isTransient = false;
          let statusCode = 500;
          let errorCode = 'AI_PROVIDER_ERROR';
          let errorMessage = 'An internal error occurred with the AI provider.';
          
          if (err.status === 400 || errStr.includes('invalid_argument') || errStr.includes('400')) {
             statusCode = 400; errorCode = 'INVALID_ARGUMENT'; errorMessage = 'Model is incompatible or request is malformed.';
          } else if (err.status === 404 || errStr.includes('404') || errStr.includes('not found') || errStr.includes('is no longer available')) {
             statusCode = 404; errorCode = 'MODEL_NOT_AVAILABLE'; errorMessage = 'The configured AI model is currently unavailable.';
          } else if (err.status === 401 || err.status === 403 || errStr.includes('401') || errStr.includes('403') || errStr.includes('auth')) {
             statusCode = 401; errorCode = 'AI_AUTH_ERROR'; errorMessage = 'AI provider authentication failed.';
          } else if (err.status === 503 || errStr.includes('503') || errStr.includes('high demand') || errStr.includes('unavailable') || errStr.includes('overloaded')) {
             isTransient = true;
             statusCode = 503; errorCode = 'PROVIDER_UNAVAILABLE'; errorMessage = 'The AI model is currently experiencing high demand. Please try again later.';
          } else if (err.status === 429 || errStr.includes('429') || errStr.includes('quota') || errStr.includes('rate')) {
             isTransient = true; 
             statusCode = 429; errorCode = 'RATE_LIMITED'; errorMessage = 'Rate limit exceeded.';
          } else if (err.name === 'AbortError' || errStr.includes('abort') || errStr.includes('fetch') || errStr.includes('network') || errStr.includes('econnrefused') || errStr.includes('etimedout') || errStr.includes('timeout')) {
             isTransient = true;
             statusCode = 503; errorCode = 'NETWORK_ERROR'; errorMessage = 'Network or timeout error contacting AI provider.';
          } else if (errStr.includes('invalid_response')) {
             statusCode = 500; errorCode = 'INVALID_RESPONSE'; errorMessage = 'Model returned an empty response.';
          }

          console.log(`[AI ATTEMPT] requestId=${requestId} model=${currentModel} attempt=${attempt} status=${statusCode} duration=${duration}ms`);

          reportModelFailure(currentModel, statusCode, errStr);

          finalError = { status: statusCode, code: errorCode, message: errorMessage, retryable: isTransient };

          if (statusCode === 401 || statusCode === 403) {
             break; // Stop immediately on auth failure
          }

          if (statusCode === 400 && !errStr.includes('interactions api')) {
             // Request malformed, switching models won't help
             break;
          }

          // Move to next model
          fallbackIndex++;
          if (fallbackIndex < modelsToTry.length) {
              attempt++;
              continue;
          }
          
          break; // Exhausted fallbacks
        }
      }

      console.log(`[AI REQUEST] id=${requestId} status=FAILED finalCode=${finalError ? finalError.code : 'UNKNOWN'} duration=${Date.now() - startTime}ms`);
      return res.status(finalError ? finalError.status : 500).json({
        error: { 
          code: finalError ? finalError.code : 'SERVER_ERROR', 
          message: finalError ? finalError.message : 'Unknown error', 
          retryable: finalError ? finalError.retryable : false,
          messageAr: (finalError && finalError.code === 'PROVIDER_UNAVAILABLE') ? 'خدمة الذكاء الاصطناعي غير متاحة مؤقتاً بسبب ضغط على المزود. حاول مرة أخرى بعد قليل.' : undefined
        }
      });

    } catch (err) {
      console.error(`[AI REQUEST ${requestId}] Unhandled Server Error:`, err);
      res.status(500).json({
        error: { code: 'SERVER_ERROR', message: 'An internal server error occurred.' }
      });
    }
  });

  
  const server = http.createServer(app);

  let vite = null;
  if (process.env.NODE_ENV !== 'production') {
    try {
      vite = await createViteServer({
        server: { 
          middlewareMode: true,
          hmr: { server }
        },
        appType: 'spa',
      });
      app.use((req, res, next) => {
          vite.middlewares(req, res, next);
      });
    } catch (err) {
      console.error('Failed to create Vite server:', err);
    }
  } else {
    // If production or HMR disabled, serve static directly
    const distPath = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      console.error('[SERVER ERROR] Production build not found. Missing dist/index.html. Did you run npm run build?');
      process.exit(1);
    }
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  
  setupLiveTransport(server);
  server.on('error', (err) => {
    console.error('[SERVER ERROR]', err);
  });
}

startServer();
