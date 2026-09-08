const fs = require('fs');

const fileContent = `import { parseCommand } from '../commands/commandParser';
import { buildAISystemContext } from '../intelligence/contextBuilder';
import { aiProviderRegistry } from './aiProvider';
import {
  AIMessage,
  AIError,
  AIRequestOptions,
  ChatOrchestrationRequest,
  ChatOrchestrationResult,
} from './aiTypes';

/**
 * Normalizes raw/unknown errors into a standardized AIError.
 */
export function normalizeAIError(err: unknown): AIError {
  if (typeof err === 'object' && err !== null && 'code' in err && 'message' in err) {
    const candidate = err as Partial<AIError>;
    return {
      code: candidate.code || 'UNKNOWN',
      message: candidate.message || 'An unexpected AI error occurred.',
      messageAr: candidate.messageAr || 'حدث خطأ غير متوقع في محرك الذكاء الاصطناعي.',
      details: candidate.details,
      retryable: typeof candidate.retryable === 'boolean' ? candidate.retryable : true,
    };
  }

  if (err instanceof DOMException && err.name === 'AbortError') {
    return {
      code: 'ABORTED',
      message: 'The request was cancelled.',
      messageAr: 'تم إلغاء الطلب.',
      retryable: true,
    };
  }

  // Consumer-safe generic error
  let friendlyMessage = 'We could not connect to NOVO. Please check your internet connection and try again.';
  let friendlyMessageAr = 'تعذر الاتصال بـ NOVO. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.';
  
  if (err instanceof Error) {
    const rawMsg = err.message.toLowerCase();
    if (rawMsg.includes('rate limit') || rawMsg.includes('429')) {
       friendlyMessage = 'NOVO is receiving too many requests. Please wait a moment and try again.';
       friendlyMessageAr = 'NOVO يتلقى طلبات كثيرة. يرجى الانتظار قليلاً والمحاولة مرة أخرى.';
    } else if (rawMsg.includes('timeout') || rawMsg.includes('aborted')) {
       friendlyMessage = 'The request took too long. Please try again.';
       friendlyMessageAr = 'استغرق الطلب وقتاً أطول من المتوقع. يرجى المحاولة مرة أخرى.';
    } else if (rawMsg.includes('quota') || rawMsg.includes('402')) {
       friendlyMessage = 'AI services quota exceeded. Please contact support.';
       friendlyMessageAr = 'تم تجاوز الحد المسموح به لخدمات الذكاء الاصطناعي. يرجى الاتصال بالدعم.';
    }
  }

  return {
    code: 'REQUEST_FAILED',
    message: friendlyMessage,
    messageAr: friendlyMessageAr,
    retryable: true,
  };
}

export function prepareConversationHistory(
  messages?: Array<{ role: string; content: string; createdAt?: string }>,
  currentMessage?: string,
  maxMessages: number = 10
): AIMessage[] {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const normalizedCurrent = currentMessage ? currentMessage.trim() : '';
  const validMessages: AIMessage[] = [];

  for (const msg of messages) {
    if (!msg || typeof msg.content !== 'string') continue;
    const trimmed = msg.content.trim();
    if (!trimmed) continue;

    let role: 'user' | 'assistant' | 'system' = 'user';
    if (msg.role === 'assistant') role = 'assistant';
    else if (msg.role === 'system') role = 'system';

    validMessages.push({
      role,
      content: trimmed,
      timestamp: msg.createdAt,
    });
  }

  if (
    normalizedCurrent &&
    validMessages.length > 0 &&
    validMessages[validMessages.length - 1].role === 'user' &&
    validMessages[validMessages.length - 1].content === normalizedCurrent
  ) {
    validMessages.pop();
  }

  // Layered Memory Architecture:
  if (validMessages.length > maxMessages) {
     const firstMessage = validMessages[0];
     const recentWindow = validMessages.slice(-(maxMessages - 2));
     
     const truncatedMiddle = validMessages.slice(1, -(maxMessages - 2));
     const topics = truncatedMiddle.filter(m => m.role === 'user').map(m => m.content.substring(0, 40).replace(/\\n/g, ' ')).join(' | ');
     
     return [
       firstMessage,
       {
         role: 'system',
         content: \`[SYSTEM: \${truncatedMiddle.length} older messages omitted for context brevity. Earlier user topics included: \${topics.substring(0, 400)}]\`
       },
       ...recentWindow
     ];
  }

  return validMessages;
}

export class AIOrchestrator {
  public async dispatch(
    request: ChatOrchestrationRequest
  ): Promise<ChatOrchestrationResult> {
    const trimmed = request.message.trim();

    if (!trimmed) {
      return {
        handledAsCommand: false,
        error: {
          code: 'INVALID_RESPONSE',
          message: 'Cannot process an empty message.',
          messageAr: 'لا يمكن معالجة رسالة فارغة.',
          retryable: false,
        },
      };
    }

    // 1. Check for deterministic local commands FIRST
    const parseResult = parseCommand(trimmed);
    if (parseResult.isCommand && parseResult.command) {
      return {
        handledAsCommand: true,
        command: parseResult.command,
        commandTargetRoute: parseResult.command.targetRoute,
        commandFeedback: {
          ar: parseResult.command.feedbackAr,
          en: parseResult.command.feedbackEn,
        },
      };
    }

    // 2. Locate Active AI Provider
    const activeProvider = aiProviderRegistry.getActiveProvider();
    if (!activeProvider) {
      return {
        handledAsCommand: false,
        error: {
          code: 'PROVIDER_UNAVAILABLE',
          message: 'No AI provider is currently configured or active.',
          messageAr: 'لا يوجد مزود ذكاء اصطناعي نشط حالياً.',
          retryable: false,
        },
      };
    }

    // 3. Prepare AI Request Context
    const history = prepareConversationHistory(
      request.conversationHistory,
      trimmed,
      10
    );

    const systemInstruction =
      request.options?.systemInstruction || buildAISystemContext(request.context);

    const mergedOptions: AIRequestOptions = {
      ...request.options,
      systemInstruction,
      history,
    };

    // 4. Dispatch to Provider
    try {
      const response = await activeProvider.generateResponse(
        trimmed,
        request.context,
        mergedOptions
      );

      if (!response || typeof response.text !== 'string' || !response.text.trim()) {
        return {
          handledAsCommand: false,
          error: {
            code: 'INVALID_RESPONSE',
            message: 'Provider returned an empty or invalid response.',
            messageAr: 'أرجع مزود الذكاء الاصطناعي استجابة فارغة أو غير صالحة.',
            retryable: true,
          },
        };
      }

      return {
        handledAsCommand: false,
        aiResponse: response,
      };
    } catch (err: unknown) {
      return {
        handledAsCommand: false,
        error: normalizeAIError(err),
      };
    }
  }
}

export const aiOrchestrator = new AIOrchestrator();
`;
fs.writeFileSync('src/core/ai/aiOrchestrator.ts', fileContent);
