import express from 'express';
import { setupLiveTransport } from './server/liveTransport.ts';
import { requireAuth, rateLimiter, AuthenticatedRequest } from './server/authMiddleware.ts';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai'; // التعديل 1: استيراد كلاس Type

let cachedAvailableModels = [];
let modelDiscoveryPromise = null;

const MODEL_STATE_HEALTHY = 'HEALTHY';
const MODEL_STATE_COOLDOWN = 'COOLDOWN';
const MODEL_STATE_PROBING = 'PROBING';

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
       if (health.activeProbes < 1) { 
           healthy.push(m);
       }
    }
  }

  const fallbacks = [];
  if (envModel && healthy.includes(envModel)) {
    fallbacks.push(envModel);
  }
  
  const preferences = ['gemini-1.5-flash', 'gemini-1.5-pro'];
  
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
    cachedAvailableModels = cachedAvailableModels.filter(m => m !== modelName);
    return;
  }
  
  if (statusCode === 400) return;

  if ([429, 503, 500].includes(statusCode)) {
    const health = modelHealth[modelName] || { state: MODEL_STATE_HEALTHY, consecutiveFailures: 0, cooldownUntil: 0, activeProbes: 0 };
    health.consecutiveFailures++;
    const cooldownMs = health.consecutiveFailures === 1 ? 10000 : (health.consecutiveFailures === 2 ? 30000 : 60000);
    health.state = MODEL_STATE_COOLDOWN;
    health.cooldownUntil = Date.now() + cooldownMs;
    health.activeProbes = 0;
    modelHealth[modelName] = health;
  }
}

function reportModelSuccess(modelName) {
  modelHealth[modelName] = { state: MODEL_STATE_HEALTHY, consecutiveFailures: 0, cooldownUntil: 0, activeProbes: 0 };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '2mb' }));

  app.post('/api/ai/chat', requireAuth, rateLimiter, async (req: AuthenticatedRequest, res) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    const uid = req.user?.uid || 'unknown';
    const startTime = Date.now();
    
    try {
      const { prompt, context, history } = req.body;

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Prompt is required.' } });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: { code: 'AI_AUTH_ERROR', message: 'API Key missing.' } });
      }

      const availableModels = await discoverAvailableModels(apiKey);
      const envModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
      const modelsToTry = getHealthyModels(availableModels, envModel);

      if (modelsToTry.length === 0) {
        return res.status(503).json({
          error: { code: 'PROVIDER_UNAVAILABLE', message: 'All AI models are currently on cooldown.', retryable: true }
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

      const todayStr = new Date().toISOString().split('T')[0];
      const enrichedSystemInstruction = `${systemInstruction}\n[SYSTEM: Today's date is ${todayStr}. Use this to resolve relative dates like "tomorrow".]`;

      // === التعديل 2: استخدام كلاس Type للتعريفات عشان جوجل يقبلها ===
      const tools = [{
        functionDeclarations: [
          {
            name: 'create_task',
            description: 'Create a new task in the user\'s daily planner or to-do list.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: 'The title of the task. Exclude relative time words like "tomorrow" or "today".'
                },
                date: {
                  type: Type.STRING,
                  description: 'The date for the task in YYYY-MM-DD format. Calculate this based on the current date and the user\'s request (e.g. tomorrow).'
                }
              },
              required: ['title']
            }
          }
        ]
      }];

      const maxAttempts = Math.min(6, modelsToTry.length);
      let attempt = 1;
      let fallbackIndex = 0;
      let finalError = null;

      while (attempt <= maxAttempts && fallbackIndex < modelsToTry.length) {
        const currentModel = modelsToTry[fallbackIndex];
        markModelProbing(currentModel);
        
        try {
          if (req.socket.destroyed) {
            unmarkModelProbing(currentModel);
            return;
          }
          
          const abortController = new AbortController();
          const reqCloseHandler = () => abortController.abort();
          req.on('close', reqCloseHandler);
          const timeoutId = setTimeout(() => abortController.abort(), 60000);

          const response = await ai.models.generateContent({
            model: currentModel,
            contents,
            config: {
              systemInstruction: enrichedSystemInstruction,
              temperature: 0.7,
              tools: tools,
            }
          });
          
          clearTimeout(timeoutId);
          req.removeListener('close', reqCloseHandler);

          const hasText = !!response.text;
          const hasFunctionCalls = response.functionCalls && response.functionCalls.length > 0;

          if (!response || (!hasText && !hasFunctionCalls)) {
             throw new Error('INVALID_RESPONSE');
          }

          unmarkModelProbing(currentModel);
          reportModelSuccess(currentModel);
          
          return res.json({
            text: response.text || '', 
            functionCalls: hasFunctionCalls ? response.functionCalls : undefined
          });
          
        } catch (err) {
          // === التعديل 3: طباعة الخطأ الحقيقي في اللوجز عشان ميبقاش مخفي ===
          console.error(`[AI REQUEST ${requestId}] Gemini API Real Error:`, err);
          
          unmarkModelProbing(currentModel);
          const errStr = String(err).toLowerCase();
          
          let isTransient = false;
          let statusCode = 500;
          let errorCode = 'AI_PROVIDER_ERROR';
          let errorMessage = 'An internal error occurred.';
          
          if (err.status === 400 || errStr.includes('invalid_argument') || errStr.includes('400')) {
             statusCode = 400; errorCode = 'INVALID_ARGUMENT'; errorMessage = 'Model is incompatible or schema is invalid.';
          } else if (err.status === 404 || errStr.includes('404') || errStr.includes('not found')) {
             statusCode = 404; errorCode = 'MODEL_NOT_AVAILABLE';
          } else if (err.status === 401 || err.status === 403 || errStr.includes('401') || errStr.includes('auth')) {
             statusCode = 401; errorCode = 'AI_AUTH_ERROR';
          } else if (err.status === 503 || errStr.includes('503') || errStr.includes('high demand') || errStr.includes('overloaded')) {
             isTransient = true; statusCode = 503; errorCode = 'PROVIDER_UNAVAILABLE';
          } else if (err.status === 429 || errStr.includes('429') || errStr.includes('quota')) {
             isTransient = true; statusCode = 429; errorCode = 'RATE_LIMITED';
          } else if (err.name === 'AbortError' || errStr.includes('timeout') || errStr.includes('network')) {
             isTransient = true; statusCode = 503; errorCode = 'NETWORK_ERROR';
          } else if (errStr.includes('invalid_response')) {
             statusCode = 500; errorCode = 'INVALID_RESPONSE';
          }

          reportModelFailure(currentModel, statusCode, errStr);
          finalError = { status: statusCode, code: errorCode, message: errorMessage, retryable: isTransient };

          if (statusCode === 401 || statusCode === 403 || (statusCode === 400 && !errStr.includes('interactions api'))) {
             break;
          }

          fallbackIndex++;
          if (fallbackIndex < modelsToTry.length) {
              attempt++;
              continue;
          }
          break;
        }
      }

      return res.status(finalError ? finalError.status : 500).json({
        error: { 
          code: finalError ? finalError.code : 'SERVER_ERROR', 
          message: finalError ? finalError.message : 'Unknown error', 
          retryable: finalError ? finalError.retryable : false
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
        server: { middlewareMode: true, hmr: { server } },
        appType: 'spa',
      });
      app.use((req, res, next) => { vite.middlewares(req, res, next); });
    } catch (err) {
      console.error('Failed to create Vite server:', err);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      process.exit(1);
    }
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  setupLiveTransport(server);
}

startServer();