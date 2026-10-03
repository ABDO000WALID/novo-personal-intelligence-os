import { useState, useCallback, useRef } from 'react';
import { RouteId } from '../../../types/navigation';
import { Conversation } from '../../../types/data';
import { useChatStore } from '../../../core/state/chatStore';
import { useAuthStore } from '../../../core/auth/authStore';
import { AuthLifecycle } from '../../../core/auth/authLifecycle';
import { NOVOContext } from '../../../core/intelligence/intelligenceTypes';
import {
  TaskActionProposal,
  GoalProgressActionProposal,
  GoalActionProposal,
} from '../../../core/commands/commandTypes';
import {
  AIError,
  ChatExecutionState,
  ChatOrchestrationResult,
  aiOrchestrator,
} from '../../../core/ai';

export interface UseChatOrchestratorProps {
  getContext: () => NOVOContext;
  onCommandNavigate?: (route: RouteId) => void;
  language?: 'ar' | 'en';
}

export interface UseChatOrchestratorResult {
  executionState: ChatExecutionState;
  error: AIError | null;
  lastCommandFeedback: { ar: string; en: string } | null;
  activeProposal: TaskActionProposal | null;
  activeGoalProgressProposal: GoalProgressActionProposal | null;
  activeGoalProposal: GoalActionProposal | null;
  submitMessage: (message: string) => Promise<ChatOrchestrationResult>;
  retryLastMessage: () => Promise<ChatOrchestrationResult | null>;
  clearProposal: () => void;
  clearGoalProgressProposal: () => void;
  clearGoalProposal: () => void;
  clearError: () => void;
}

export function useChatOrchestrator({
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
  const [activeProposal, setActiveProposal] = useState<TaskActionProposal | null>(null);
  const [activeGoalProgressProposal, setActiveGoalProgressProposal] = useState<GoalProgressActionProposal | null>(null);
  const [activeGoalProposal, setActiveGoalProposal] = useState<GoalActionProposal | null>(null);

  const lastSubmittedMessageRef = useRef<string | null>(null);
  const isSubmittingRef = useRef<boolean>(false);

  const clearError = useCallback(() => {
    setError(null);
    setExecutionState('idle');
  }, []);

  const clearProposal = useCallback(() => {
    setActiveProposal(null);
  }, []);

  const clearGoalProgressProposal = useCallback(() => {
    setActiveGoalProgressProposal(null);
  }, []);

  const clearGoalProposal = useCallback(() => {
    setActiveGoalProposal(null);
  }, []);

  const applyCommandResult = useCallback(
    (result: ChatOrchestrationResult, userMessageId?: string) => {
      if (result.taskProposal) {
        result.taskProposal.originatingMessageId = userMessageId;
        setActiveProposal(result.taskProposal);
      }
      if (result.goalProgressProposal) {
        result.goalProgressProposal.originatingMessageId = userMessageId;
        setActiveGoalProgressProposal(result.goalProgressProposal);
      }
      if (result.goalProposal) {
        result.goalProposal.originatingMessageId = userMessageId;
        setActiveGoalProposal(result.goalProposal);
      }
      if (result.commandFeedback) {
        setLastCommandFeedback(result.commandFeedback);
      }
      if (result.commandTargetRoute && onCommandNavigate) {
        // Delay navigation slightly to allow UI to show feedback and state to settle
        const target = result.commandTargetRoute;
        onCommandNavigate(target);
      }
    },
    [onCommandNavigate]
  );

  const submitMessage = useCallback(
    async (message: string): Promise<ChatOrchestrationResult> => {
      // Synchronous mutex lock to prevent concurrent submissions
      if (isSubmittingRef.current) {
        console.warn('[useChatOrchestrator] Submission rejected: message already in flight');
        return {
          handledAsCommand: false,
          error: {
            code: 'REQUEST_FAILED',
            message: 'A message is already being processed.',
            messageAr: 'يتم حالياً معالجة رسالة سابقة، يرجى الانتظار.',
            retryable: false,
          },
        };
      }

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

      isSubmittingRef.current = true;

      try {
        const authUser = useAuthStore.getState().user;
        const authLoading = useAuthStore.getState().loading;
        const uid = AuthLifecycle.getUid();

        if (authLoading) {
          const errorResult: AIError = {
            code: 'AI_AUTH_ERROR',
            message: 'Authentication is still initializing. Please try again in a moment.',
            messageAr: 'جاري تهيئة جلسة المستخدم. يرجى المحاولة بعد لحظات.',
            retryable: true,
          };
          setError(errorResult);
          setExecutionState('idle');
          return {
            handledAsCommand: false,
            error: errorResult,
          };
        }

        if (!authUser || !uid) {
          const errorResult: AIError = {
            code: 'AI_AUTH_ERROR',
            message: 'Repository operation requires an authenticated user.',
            messageAr: 'يتطلب حفظ المحادثة تسجيل الدخول أولاً.',
            retryable: false,
          };
          setError(errorResult);
          setExecutionState('idle');
          return {
            handledAsCommand: false,
            error: errorResult,
          };
        }

        lastSubmittedMessageRef.current = trimmed;
        setError(null);
        setExecutionState('parsing_command');
        const state = useChatStore.getState();
        const sendMessage = state.sendMessage;

        // 1. Persist the user message to the active conversation thread
        let originConvId: string | undefined;
        let userMessageId: string | undefined;
        try {
          originConvId = await sendMessage(trimmed, 'user');
          const st = useChatStore.getState();
          userMessageId = st.lastSentMessageId || undefined;
          if (!userMessageId && originConvId) {
            const conv = st.conversations.find((c) => c.id === originConvId);
            const lastUserMsg = conv?.messages
              .slice()
              .reverse()
              .find((m) => m.role === 'user' && m.content === trimmed);
            userMessageId = lastUserMsg?.id;
          }
        } catch (e: any) {
          const errorResult: AIError = {
            code: 'REQUEST_FAILED',
            message: e.message || 'Failed to save message.',
            messageAr: 'فشل حفظ الرسالة.',
            retryable: true,
          };
          setError(errorResult);
          setExecutionState('idle');
          return {
            handledAsCommand: false,
            error: errorResult,
          };
        }
        
        const updatedState = useChatStore.getState();
        const activeConversation = originConvId ? updatedState.conversations.find(c => c.id === originConvId) : null;

        // 2. Prepare workspace context snapshot from single source of truth
        const context = getContext();
        setExecutionState('generating');

        // 3. Delegate to provider-independent AI Orchestrator
        const result = await aiOrchestrator.orchestrate({
          message: trimmed,
          messageId: userMessageId,
          context,
          conversationHistory: activeConversation?.messages,
          language,
        });

        // 4. Handle result
        if (result.handledAsCommand) {
          setExecutionState('idle');
          applyCommandResult(result, userMessageId);
          return result;
        }

        if (result.aiResponse) {
          try {
            await sendMessage(result.aiResponse.text, 'assistant', originConvId, userMessageId);
          } catch (e: any) {
            const errorResult: AIError = {
              code: 'REQUEST_FAILED',
              message: e.message || 'Failed to save assistant response.',
              messageAr: 'فشل حفظ رد المساعد.',
              retryable: true,
            };
            setError(errorResult);
            setExecutionState('idle');
            return {
              handledAsCommand: false,
              error: errorResult,
            };
          }
          setExecutionState('idle');
          setError(null);
          return result;
        }

        if (result.error) {
          try {
            await sendMessage(JSON.stringify(result.error), 'system', originConvId, userMessageId);
          } catch (e) {
            console.error('[useChatOrchestrator] Failed to persist system error:', e);
          }
          setExecutionState('idle');
          return result;
        }

        setExecutionState('idle');
        return result;
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [getContext, language, applyCommandResult]
  );

  const retryLastMessage = useCallback(async (): Promise<ChatOrchestrationResult | null> => {
    if (isSubmittingRef.current) {
      console.warn('[useChatOrchestrator] Retry rejected: message already in flight');
      return null;
    }

    isSubmittingRef.current = true;

    try {
      const state = useChatStore.getState();
      const originConvId = state.activeConversationId;
      const activeConversation = originConvId ? state.conversations.find(c => c.id === originConvId) : null;
      const sendMessage = state.sendMessage;
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

      const lastUserMsg = activeConversation?.messages
        .slice()
        .reverse()
        .find((m) => m.role === 'user');

      const result = await aiOrchestrator.orchestrate({
        message: messageToRetry,
        messageId: lastUserMsg?.id,
        context,
        conversationHistory: activeConversation?.messages,
        language,
      });

      if (result.handledAsCommand) {
        setExecutionState('idle');
        applyCommandResult(result, lastUserMsg?.id);
        return result;
      }

      if (result.aiResponse) {
        if (originConvId) {
          try {
            await sendMessage(result.aiResponse.text, 'assistant', originConvId, lastUserMsg?.id);
          } catch (e: any) {
            const errorResult: AIError = {
              code: 'REQUEST_FAILED',
              message: e.message || 'Failed to save assistant response.',
              messageAr: 'فشل حفظ رد المساعد.',
              retryable: true,
            };
            setError(errorResult);
            setExecutionState('idle');
            return {
              handledAsCommand: false,
              error: errorResult,
            };
          }
        }
        setExecutionState('idle');
        setError(null);
        return result;
      }

      if (result.error) {
        if (originConvId) {
          try {
            await sendMessage(JSON.stringify(result.error), 'system', originConvId, lastUserMsg?.id);
          } catch (e) {
            console.error('[useChatOrchestrator] Failed to persist system error:', e);
          }
        }
        setExecutionState('idle');
        return result;
      }

      setExecutionState('idle');
      return result;
    } catch (e: any) {
      console.error('[useChatOrchestrator] Retry unexpected rejection:', e);
      const errorResult: AIError = {
        code: 'REQUEST_FAILED',
        message: e?.message || 'Failed to process retry request.',
        messageAr: 'فشل معالجة طلب إعادة المحاولة.',
        retryable: true,
      };
      setError(errorResult);
      return {
        handledAsCommand: false,
        error: errorResult,
      };
    } finally {
      setExecutionState('idle');
      isSubmittingRef.current = false;
    }
  }, [getContext, language, applyCommandResult]);

  return {
    executionState,
    error,
    lastCommandFeedback,
    activeProposal,
    activeGoalProgressProposal,
    activeGoalProposal,
    submitMessage,
    retryLastMessage,
    clearProposal,
    clearGoalProgressProposal,
    clearGoalProposal,
    clearError,
  };
}
