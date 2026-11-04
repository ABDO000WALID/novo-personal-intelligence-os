import express from 'express';
import { setupLiveTransport } from './server/liveTransport.ts';
import { requireAuth, rateLimiter, AuthenticatedRequest } from './server/authMiddleware.ts';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

let cachedAvailableModels: string[] = [];
let modelDiscoveryPromise: Promise<string[]> | null = null;

const MODEL_STATE_HEALTHY = 'HEALTHY';
const MODEL_STATE_COOLDOWN = 'COOLDOWN';
const MODEL_STATE_PROBING = 'PROBING';

const modelHealth: Record<string, any> = {}; 

async function discoverAvailableModels(apiKey: string) {
  if (cachedAvailableModels.length > 0) return cachedAvailableModels;
  if (!modelDiscoveryPromise) {
    modelDiscoveryPromise = (async () => {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.list();
        const available: string[] = [];
        
        for await (const model of response) {
           if (model.supportedActions && model.supportedActions.includes('generateContent')) {
             const name = (model.name || '').replace('models/', '');
             
             // استبعاد الموديلات البطيئة أو التجريبية أو غير المتوافقة مع الأدوات
             if (
               !name.includes('vision') && 
               !name.includes('embedding') && 
               !name.includes('tts') &&
               !name.includes('image') &&
               !name.includes('audio') &&
               !name.includes('thinking') &&
               !name.includes('exp') &&
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
        return ['gemini-2.5-flash', 'gemini-2.0-flash'];
      }
    })();
  }
  return modelDiscoveryPromise;
}

function getHealthyModels(availableModels: string[], envModel?: string) {
  const now = Date.now();
  const healthy: string[] = [];
  
  for (const m of availableModels) {
    const health = modelHealth[m];
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

  const fallbacks: string[] = [];
  // أولوية قصوى للموديلات السريعة والمستقرة
  const preferences = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-pro'];
  
  if (envModel && healthy.includes(envModel)) {
    fallbacks.push(envModel);
  }
  
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
  
  if (fallbacks.length === 0) {
    return ['gemini-2.5-flash', 'gemini-2.0-flash'];
  }
  
  return fallbacks;
}

function markModelProbing(modelName: string) {
  const health = modelHealth[modelName];
  if (health && health.state === MODEL_STATE_PROBING) {
    health.activeProbes++;
  }
}

function unmarkModelProbing(modelName: string) {
  const health = modelHealth[modelName];
  if (health && health.state === MODEL_STATE_PROBING) {
    health.activeProbes = Math.max(0, health.activeProbes - 1);
  }
}

function reportModelFailure(modelName: string, statusCode: number, errStr: string) {
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

function reportModelSuccess(modelName: string) {
  modelHealth[modelName] = { state: MODEL_STATE_HEALTHY, consecutiveFailures: 0, cooldownUntil: 0, activeProbes: 0 };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '2mb' }));

  app.post('/api/ai/chat', requireAuth, rateLimiter, async (req: AuthenticatedRequest, res) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    
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
      const envModel = process.env.GEMINI_MODEL;
      const modelsToTry = getHealthyModels(availableModels, envModel);

      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction = context || 'You are NOVO, a productivity AI assistant.';
      
      // بناء سجل محادثة سليم يمنع تكرار الأوامر السابقة أو تعطل المحادثة عند غياب رد المساعد
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
      if (Array.isArray(history)) {
        for (const msg of history) {
          if (!msg || typeof msg.content !== 'string' || !msg.content.trim()) continue;
          if (msg.role !== 'user' && msg.role !== 'model' && msg.role !== 'assistant') continue;
          
          const mappedRole = msg.role === 'assistant' ? 'model' : msg.role;
          const text = msg.content.trim();

          // إذا كانت الرسالة الأخيرة في التاريخ مطابقة للرسالة الحالية، نتجاهلها لمنع التكرار
          if (mappedRole === 'user' && text === prompt.trim()) continue;

          // إذا جاءت رسالتان متتاليتان من المستخدم (بسبب تنفيذ أمر سابق بدون فقاعة رد)، نضع رداً فاصلاً
          if (contents.length > 0 && contents[contents.length - 1].role === 'user' && mappedRole === 'user') {
            contents.push({
              role: 'model',
              parts: [{ text: 'تم تنفيذ طلبك السابق بنجاح.' }]
            });
          }

          contents.push({
            role: mappedRole,
            parts: [{ text }]
          });
        }
      }

      // إذا كان آخر عنصر في التاريخ هو أيضاً من المستخدم، نضع رداً فاصلاً قبل الرسالة الجديدة
      if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
        contents.push({
          role: 'model',
          parts: [{ text: 'تم تنفيذ طلبك السابق بنجاح.' }]
        });
      }

      contents.push({ role: 'user', parts: [{ text: prompt.trim() }] });

      const todayStr = new Date().toISOString().split('T')[0];
      const enrichedSystemInstruction = `${systemInstruction}\n[SYSTEM: Today's date is ${todayStr}. Only call create_task if the user's latest message explicitly asks to add/create a task. For normal conversation, reply naturally in Arabic without calling tools.]`;

      const tools = [
        {
          functionDeclarations: [
            {
              name: "create_task",
              description: "Create a new task in the user's daily planner ONLY when explicitly requested in the latest user message.",
              parameters: {
                type: "OBJECT",
                properties: {
                  title: {
                    type: "STRING",
                    description: "The task title (exclude relative date words like tomorrow/today/بكرة/اليوم)."
                  },
                  date: {
                    type: "STRING",
                    description: "Task date in YYYY-MM-DD format."
                  }
                },
                required: ["title", "date"]
              }
            }
          ]
        }
      ];

      const maxAttempts = Math.min(3, modelsToTry.length);
      let attempt = 1;
      let fallbackIndex = 0;
      let finalError: any = null;

      while (attempt <= maxAttempts && fallbackIndex < modelsToTry.length) {
        const currentModel = modelsToTry[fallbackIndex];
        markModelProbing(currentModel);
        
        try {
          if (req.socket.destroyed) {
            unmarkModelProbing(currentModel);
            return;
          }

          const response = await ai.models.generateContent({
            model: currentModel,
            contents,
            config: {
              systemInstruction: enrichedSystemInstruction,
              temperature: 0.7,
              tools: tools as any,
            }
          });

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
          
        } catch (err: any) {
          console.error(`[AI REQUEST ${requestId}] Model ${currentModel} Error:`, err);
          
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

          if (statusCode === 401 || statusCode === 403) {
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
  let vite: any = null;

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