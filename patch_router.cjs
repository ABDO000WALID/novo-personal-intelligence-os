const fs = require('fs');

const code = `import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

let cachedAvailableModels = [];
let modelDiscoveryPromise = null;
const modelHealth = {}; // Record<string, { consecutiveFailures: number, temporarilyDisabledUntil: number }>

async function discoverAvailableModels(apiKey) {
  if (cachedAvailableModels.length > 0) return cachedAvailableModels;
  if (!modelDiscoveryPromise) {
    modelDiscoveryPromise = (async () => {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.list();
        const available = [];
        
        for await (const model of response) {
           // Strict capability filter
           if (model.supportedActions && model.supportedActions.includes('generateContent')) {
             const name = model.name.replace('models/', '');
             
             // Exclude fundamentally incompatible models for standard chat
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
  const healthy = availableModels.filter(m => {
    const health = modelHealth[m];
    return !(health && health.temporarilyDisabledUntil > now);
  });

  const fallbacks = [];
  
  // 1. Primary if healthy and verified
  if (envModel && healthy.includes(envModel)) {
    fallbacks.push(envModel);
  }
  
  // 2. Preferred reliable models, ONLY if healthy and verified
  const preferences = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-2.0-flash'];
  
  for (const pref of preferences) {
    if (healthy.includes(pref) && !fallbacks.includes(pref)) {
      fallbacks.push(pref);
    }
  }
  
  // 3. Any remaining healthy models
  for (const model of healthy) {
    if (!fallbacks.includes(model)) {
      fallbacks.push(model);
    }
  }
  
  // 4. If all verified models are on cooldown, ignore cooldown and just try the preferred one if available
  if (fallbacks.length === 0 && availableModels.length > 0) {
    if (envModel && availableModels.includes(envModel)) return [envModel];
    for (const pref of preferences) {
      if (availableModels.includes(pref)) return [pref];
    }
    return [availableModels[0]];
  }
  
  return fallbacks;
}

function reportModelFailure(modelName, statusCode) {
  if (statusCode === 404 || statusCode === 400) {
    // Permanently remove from discovered models
    cachedAvailableModels = cachedAvailableModels.filter(m => m !== modelName);
    console.log(\`[MODEL HEALTH] model=\${modelName} action=removed reason=\${statusCode}\`);
    return;
  }
  
  if (statusCode === 429 || statusCode === 503) {
    const health = modelHealth[modelName] || { consecutiveFailures: 0, temporarilyDisabledUntil: 0 };
    health.consecutiveFailures++;
    // Cooldown: 1st failure = 10s, 2nd = 30s, 3rd = 60s
    const cooldownMs = health.consecutiveFailures === 1 ? 10000 : (health.consecutiveFailures === 2 ? 30000 : 60000);
    health.temporarilyDisabledUntil = Date.now() + cooldownMs;
    modelHealth[modelName] = health;
    console.log(\`[MODEL HEALTH] model=\${modelName} action=cooldown reason=\${statusCode} duration=\${cooldownMs}ms\`);
  }
}

function reportModelSuccess(modelName) {
  if (modelHealth[modelName]) {
    delete modelHealth[modelName];
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

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
      const envModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
      
      const modelsToTry = getHealthyModels(availableModels, envModel);
      console.log(\`[MODEL ROUTER] available=\${availableModels.length} healthy=\${modelsToTry.length} preferred=\${modelsToTry[0] || 'none'}\`);

      if (modelsToTry.length === 0) {
        return res.status(500).json({
          error: { 
            code: 'MODEL_NOT_AVAILABLE', 
            message: 'No available AI models found for this API key.',
            retryable: false
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

      const maxAttempts = Math.min(3, modelsToTry.length * 2); 
      let attempt = 1;
      let fallbackIndex = 0;
      let finalError = null;

      while (attempt <= maxAttempts && fallbackIndex < modelsToTry.length) {
        const currentModel = modelsToTry[fallbackIndex];
        
        try {
          if (req.socket.destroyed) {
            console.log(\`[AI REQUEST] id=\${requestId} status=ABORTED duration=\${Date.now() - startTime}ms\`);
            return;
          }

          console.log(\`[MODEL SELECTED] model=\${currentModel} reason=\${fallbackIndex === 0 ? 'preferred' : 'fallback'}\`);
          
          const response = await ai.models.generateContent({
            model: currentModel,
            contents,
            config: {
              systemInstruction: systemInstruction,
              temperature: 0.7,
            }
          });

          if (!response || !response.text) {
             throw new Error('INVALID_RESPONSE');
          }

          reportModelSuccess(currentModel);
          console.log(\`[AI SUCCESS] requestId=\${requestId} model=\${currentModel} duration=\${Date.now() - startTime}ms\`);
          return res.json({
            text: response.text
          });
          
        } catch (err) {
          const errStr = String(err).toLowerCase();
          const duration = Date.now() - startTime;
          
          let isTransient = false;
          let statusCode = 500;
          let errorCode = 'AI_PROVIDER_ERROR';
          let errorMessage = 'An internal error occurred with the AI provider.';
          
          if (err.status === 400 || errStr.includes('invalid_argument') || errStr.includes('400')) {
             statusCode = 400; errorCode = 'INVALID_ARGUMENT'; errorMessage = 'Model is incompatible with this API call.';
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
          } else if (errStr.includes('fetch') || errStr.includes('network') || errStr.includes('econnrefused') || errStr.includes('etimedout') || errStr.includes('timeout')) {
             isTransient = true;
             statusCode = 503; errorCode = 'NETWORK_ERROR'; errorMessage = 'Network or timeout error contacting AI provider.';
          } else if (errStr.includes('invalid_response')) {
             statusCode = 500; errorCode = 'INVALID_RESPONSE'; errorMessage = 'Model returned an empty response.';
          }

          console.log(\`[AI ATTEMPT] requestId=\${requestId} model=\${currentModel} attempt=\${attempt} status=\${statusCode} duration=\${duration}ms\`);

          reportModelFailure(currentModel, statusCode);

          finalError = { status: statusCode, code: errorCode, message: errorMessage, retryable: isTransient };

          if (statusCode === 401 || statusCode === 403) {
             break; 
          }

          if (statusCode === 404 || statusCode === 400 || statusCode === 429 || statusCode === 503 || statusCode === 500) {
            fallbackIndex++;
            if (fallbackIndex < modelsToTry.length) {
                attempt++;
                continue;
            }
          }
          
          if (!isTransient) {
             break;
          }
          
          if (attempt >= maxAttempts) {
             break;
          }

          fallbackIndex = Math.max(0, fallbackIndex - 1); 

          const delayMs = attempt === 1 ? 1000 : 2000;
          await new Promise(resolve => {
             const timer = setTimeout(resolve, delayMs);
             req.on('close', () => {
                clearTimeout(timer);
                resolve();
             });
          });
          
          if (req.socket.destroyed) {
             console.log(\`[AI REQUEST] id=\${requestId} status=ABORTED duration=\${Date.now() - startTime}ms\`);
             return;
          }
          
          attempt++;
        }
      }

      console.log(\`[AI REQUEST] id=\${requestId} status=FAILED finalCode=\${finalError ? finalError.code : 'UNKNOWN'} duration=\${Date.now() - startTime}ms\`);
      return res.status(finalError ? finalError.status : 500).json({
        error: { 
          code: finalError ? finalError.code : 'SERVER_ERROR', 
          message: finalError ? finalError.message : 'Unknown error', 
          retryable: finalError ? finalError.retryable : false,
          messageAr: (finalError && finalError.code === 'PROVIDER_UNAVAILABLE') ? 'خدمة الذكاء الاصطناعي غير متاحة مؤقتاً بسبب ضغط على المزود. حاول مرة أخرى بعد قليل.' : undefined
        }
      });

    } catch (err) {
      console.error(\`[AI REQUEST \${requestId}] Unhandled Server Error:\`, err);
      res.status(500).json({
        error: { code: 'SERVER_ERROR', message: 'An internal server error occurred.' }
      });
    }
  });

  let vite;
  if (process.env.NODE_ENV !== 'production') {
    try {
      vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use((req, res, next) => {
          vite.middlewares(req, res, next);
      });
    } catch (err) {
      console.error('Failed to create Vite server:', err);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(\`Server running on http://0.0.0.0:\${PORT}\`);
  });

  // Handle Vite WebSocket upgrades safely without unhandled rejections
  server.on('upgrade', (req, socket, head) => {
    if (vite && vite.ws) {
      vite.ws.upgrade(req, socket, head);
    } else {
      socket.destroy();
    }
  });
  
  // Catch server-level errors
  server.on('error', (err) => {
     console.error('[SERVER ERROR]', err);
  });
}

startServer();
`
fs.writeFileSync('server.ts', code);
