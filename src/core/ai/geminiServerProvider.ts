import { AIResponse, AIRequestOptions, AIError, AIMessage } from './aiTypes';
import { AIProvider } from './aiProvider';
import { NOVOContext } from '../intelligence/intelligenceTypes';

export class GeminiServerProvider implements AIProvider {
  id = 'gemini-client';
  name = 'Gemini Client API';
  providerType = 'gemini' as const;
  supportedModels = ['gemini-1.5-flash'];

  isAvailable(): boolean {
    // Check if the API key is provided in the environment
    return !!import.meta.env.VITE_GEMINI_API_KEY;
  }

  async generateResponse(
    prompt: string,
    context: NOVOContext,
    options?: AIRequestOptions
  ): Promise<AIResponse> {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) {
      throw {
        code: 'NETWORK_ERROR',
        message: 'Cannot connect to AI service. Please check your internet connection.',
        messageAr: 'لا يمكن الاتصال بخدمة الذكاء الاصطناعي حالياً. تأكد من اتصالك بالإنترنت ثم حاول مرة أخرى.',
        retryable: true,
      } as AIError;
    }

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw {
        code: 'UNAUTHENTICATED',
        message: 'Gemini API key is missing. Please add VITE_GEMINI_API_KEY to your environment variables.',
        messageAr: 'مفتاح Gemini API غير موجود. يرجى إضافته كمتغير بيئة (VITE_GEMINI_API_KEY).',
        retryable: false,
      } as AIError;
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 60000); // 60s timeout

    const onAbort = () => abortController.abort();
    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', onAbort);
    }

    try {
      // 1. Format conversation history for Gemini (user / model)
      const contents: any[] = [];
      
      if (options?.history && options.history.length > 0) {
        options.history.forEach((msg: AIMessage) => {
          if (msg.role === 'user' || msg.role === 'assistant') {
            contents.push({
              role: msg.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: msg.content }]
            });
          }
        });
      }

      // 2. Add current user prompt
      contents.push({
        role: 'user',
        parts: [{ text: prompt }]
      });

      // 3. Prepare the payload
      const payload: any = {
        contents,
        generationConfig: {
          temperature: 0.7,
        }
      };

      // 4. Add system instructions (Context)
      if (options?.systemInstruction) {
        payload.systemInstruction = {
          parts: [{ text: options.systemInstruction }]
        };
      }

      // 5. Fetch directly from Google's Generative Language API
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (!response.ok) {
        throw {
          code: 'REQUEST_FAILED',
          message: data?.error?.message || 'Failed to fetch from Gemini API.',
          messageAr: 'فشل الاتصال بخوادم Gemini API. ' + (data?.error?.message || ''),
          retryable: true,
        };
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text || !text.trim()) {
        throw {
          code: 'INVALID_RESPONSE',
          message: 'Received empty or invalid response from Gemini.',
          messageAr: 'تم استلام استجابة فارغة أو غير صالحة من Gemini.',
          retryable: false,
        };
      }

      return {
        text: text,
      };

    } catch (err: any) {
      clearTimeout(timeoutId);
      
      if (err.name === 'AbortError') {
        throw {
          code: options?.abortSignal?.aborted ? 'ABORTED' : 'AI_TIMEOUT',
          message: options?.abortSignal?.aborted ? 'Request was aborted.' : 'Request timed out.',
          messageAr: options?.abortSignal?.aborted ? 'تم إلغاء الطلب.' : 'انتهى وقت الطلب.',
          retryable: true,
        };
      }

      if (err.code) {
        throw err;
      }

      throw {
        code: 'NETWORK_ERROR',
        message: 'Failed to communicate with AI server.',
        messageAr: 'فشل الاتصال بخادم الذكاء الاصطناعي.',
        retryable: true,
        details: String(err),
      };
    } finally {
      if (options?.abortSignal) {
        options.abortSignal.removeEventListener('abort', onAbort);
      }
    }
  }
}