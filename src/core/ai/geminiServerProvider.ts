import {
  AIResponse,
  AIRequestOptions,
  AIError,
} from './aiTypes';
import { AIProvider } from './aiProvider';
import { NOVOContext } from '../intelligence/intelligenceTypes';

export class GeminiServerProvider implements AIProvider {
  id = 'gemini-server';
  name = 'Gemini Server API';
  providerType = 'gemini' as const;
  supportedModels = ['gemini-3.8-flash'];

  isAvailable(): boolean {
    return true;
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

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 60000); // 60s timeout for server retries

    const onAbort = () => abortController.abort();
    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', onAbort);
    }

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': crypto.randomUUID(),
        },
        body: JSON.stringify({
          prompt,
          context: options?.systemInstruction,
          history: options?.history,
        }),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (!response.ok) {
        const errCode = data?.error?.code || 'REQUEST_FAILED';
        const errMessage = data?.error?.message || 'Server returned an error.';
        let retryable = data?.error?.retryable ?? true;
        let messageAr = data?.error?.messageAr;

        if (errCode === 'MODEL_NOT_AVAILABLE') {
          retryable = false;
          messageAr = messageAr || 'نموذج الذكاء الاصطناعي المحدد غير متاح حالياً. تحقق من إعداد GEMINI_MODEL.';
        } else if (errCode === 'PROVIDER_UNAVAILABLE') {
          retryable = true;
          messageAr = messageAr || 'خدمة الذكاء الاصطناعي تواجه ضغطاً مؤقتاً. حاول مرة أخرى بعد قليل.';
        } else if (errCode === 'AI_AUTH_ERROR' || errCode === 'INVALID_REQUEST' || errCode === 'INVALID_RESPONSE') {
          retryable = false;
        }

        throw {
          code: errCode,
          message: errMessage,
          messageAr,
          retryable,
        };
      }

      if (!data || typeof data.text !== 'string' || !data.text.trim()) {
        throw {
          code: 'INVALID_RESPONSE',
          message: 'Received empty or invalid response from server.',
          retryable: false,
        };
      }

      return {
        text: data.text,
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
