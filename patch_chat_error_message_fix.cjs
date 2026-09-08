const fs = require('fs');

const fileContent = `import { useState, useCallback, useRef } from 'react';
import { RouteId } from '../../../types/navigation';
import { Conversation } from '../../../types/data';
import { NOVOContext } from '../../../core/intelligence/intelligenceTypes';
import {
  AIError,
  ChatExecutionState,
  ChatOrchestrationResult,
  aiOrchestrator,
} from '../../../core/ai';

export interface UseChatOrchestratorProps {
  sendMessage: (content: string, role?: 'user' | 'assistant' | 'system') => void;
  activeConversation: Conversation | null;
  getContext: () => NOVOContext;
  onCommandNavigate?: (route: RouteId) => void;
  language?: 'ar' | 'en';
}

export interface UseChatOrchestratorResult {
  executionState: ChatExecutionState;
  error: AIError | null;
  lastCommandFeedback: { ar: string; en: string } | null;
  submitMessage: (message: string) => Promise<ChatOrchestrationResult>;
  retryLastMessage: () => Promise<ChatOrchestrationResult | null>;
  clearError: () => void;
}

export function useChatOrchestrator({
  sendMessage,
  activeConversation,
  getContext,
  onCommandNavigate,
  language = 'ar',
}: UseChatOrchestratorProps): UseChatOrchestratorResult {
  const [executionState, setExecutionState] = useState<ChatExecutionState>('idle');
  const [error, setError] = useState<AIError | null>(null);
  const [lastCommandFeedback, setLastCommandFeedback] = useState<{
    ar: string;
    en: string;
  } | null>(null);

  const lastSubmittedMessageRef = useRef<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
    setExecutionState('idle');
  }, []);

  const submitMessage = useCallback(
    async (message: string): Promise<ChatOrchestrationResult> => {
      const trimmed = message.trim();
      if (!trimmed) {
        return {
          handledAsCommand: false,
          error: {
            code: 'INVALID_RESPONSE',
            message: 'Empty message cannot be submitted.',
            messageAr: 'لا يمكن إرسال رسالة فارغة.',
            retryable: false,
          },
        };
      }

      lastSubmittedMessageRef.current = trimmed;
      setError(null);
      setExecutionState('parsing_command');

      // 1. Persist the user message to the active conversation thread
      sendMessage(trimmed, 'user');

      // 2. Prepare workspace context snapshot from single source of truth
      const context = getContext();
      setExecutionState('generating');

      // 3. Delegate to provider-independent AI Orchestrator
      const result = await aiOrchestrator.orchestrate({
        message: trimmed,
        context,
        conversationHistory: activeConversation?.messages,
        language,
      });

      // 4. Handle result
      if (result.handledAsCommand) {
        setExecutionState('idle');
        if (result.commandFeedback) {
          setLastCommandFeedback(result.commandFeedback);
        }
        if (result.commandTargetRoute && onCommandNavigate) {
          // Delay navigation slightly to allow UI to show feedback and state to settle
          const target = result.commandTargetRoute;
          onCommandNavigate(target);
        }
        return result;
      }

      if (result.aiResponse) {
        sendMessage(result.aiResponse.text, 'assistant');
        setExecutionState('idle');
        setError(null);
        return result;
      }

      if (result.error) {
        sendMessage(JSON.stringify(result.error), 'system');
        setExecutionState('idle');
        return result;
      }

      setExecutionState('idle');
      return result;
    },
    [sendMessage, getContext, activeConversation, language, onCommandNavigate]
  );

  const retryLastMessage = useCallback(async (): Promise<ChatOrchestrationResult | null> => {
    if (!lastSubmittedMessageRef.current) {
      // Find the last user message from conversation
      const lastUserMsg = activeConversation?.messages
        .slice()
        .reverse()
        .find((m) => m.role === 'user');
      if (!lastUserMsg) return null;
      lastSubmittedMessageRef.current = lastUserMsg.content;
    }

    const messageToRetry = lastSubmittedMessageRef.current;
    setError(null);
    setExecutionState('generating');
    
    const context = getContext();

    const result = await aiOrchestrator.orchestrate({
      message: messageToRetry,
      context,
      conversationHistory: activeConversation?.messages,
      language,
    });

    if (result.aiResponse) {
      sendMessage(result.aiResponse.text, 'assistant');
      setExecutionState('idle');
      setError(null);
      return result;
    }

    if (result.error) {
      sendMessage(JSON.stringify(result.error), 'system');
      setExecutionState('idle');
      return result;
    }

    setExecutionState('idle');
    return result;
  }, [activeConversation, getContext, language, sendMessage]);

  return {
    executionState,
    error,
    lastCommandFeedback,
    submitMessage,
    retryLastMessage,
    clearError,
  };
}
`;

fs.writeFileSync('src/modules/chat/hooks/useChatOrchestrator.ts', fileContent);
