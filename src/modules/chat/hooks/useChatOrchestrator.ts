import { useState, useCallback, useRef } from 'react';
import { RouteId } from '../../../types/navigation';
import { useChatStore } from '../../../core/state/chatStore';
import { useAuthStore } from '../../../core/auth/authStore';
import { AuthLifecycle } from '../../../core/auth/authLifecycle';
import { NOVOContext } from '../../../core/intelligence/intelligenceTypes';
import { useTaskStore } from '../../../core/state/taskStore';
import { useGoalStore } from '../../../core/state/goalStore';
import {
  TaskActionProposal,
  GoalProgressActionProposal,
  GoalActionProposal,
  ChatActionProposal,
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
  executionState: ChatExecutionState | 'executing';
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
  confirmProposal: (proposal: ChatActionProposal, messageId: string) => Promise<void>;
  resolvedChatProposals: Set<string>;
}

export function useChatOrchestrator({
  getContext,
  onCommandNavigate,
  language = 'ar',
}: UseChatOrchestratorProps): UseChatOrchestratorResult {
  const [executionState, setExecutionState] = useState<ChatExecutionState | 'executing'>('idle');
  const [error, setError] = useState<AIError | null>(null);
  const [lastCommandFeedback, setLastCommandFeedback] = useState<{
    ar: string;
    en: string;
  } | null>(null);
  const [activeProposal, setActiveProposal] = useState<TaskActionProposal | null>(null);
  const [activeGoalProgressProposal, setActiveGoalProgressProposal] = useState<GoalProgressActionProposal | null>(null);
  const [activeGoalProposal, setActiveGoalProposal] = useState<GoalActionProposal | null>(null);
  const [resolvedChatProposals, setResolvedChatProposals] = useState<Set<string>>(new Set());

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

  // تنفيذ العمليات فور استلام أمر النية بدون عرض بطاقات تأكيد
  const applyCommandResult = useCallback(
    async (result: ChatOrchestrationResult, userMessageId?: string) => {
      // 1. تنفيذ أوامر المهام مباشرة
      if (result.taskProposal) {
        const proposal = result.taskProposal as any; // تم إضافة as any لحل أخطاء الـ TS
        proposal.originatingMessageId = userMessageId;
        const taskStore = useTaskStore.getState();

        try {
          if (proposal.type === 'existing_task') {
            if (typeof (taskStore as any).toggleTask === 'function') {
              await (taskStore as any).toggleTask(proposal.taskId);
            }
          } else if (proposal.type === 'new_task_required') {
            const title = proposal.title || (language === 'ar' ? 'مهمة جديدة' : 'New Task');
            const date = proposal.date || new Date().toISOString().split('T')[0];

            if (typeof (taskStore as any).createTask === 'function') {
              await (taskStore as any).createTask(title, 'medium', date);
            } else if (typeof (taskStore as any).addTask === 'function') {
              await (taskStore as any).addTask({
                id: 'task-' + Date.now(),
                title,
                priority: 'medium',
                date,
                completed: false,
                createdAt: new Date().toISOString(),
              });
            }
          }

          if (userMessageId) {
            setResolvedChatProposals((prev) => new Set(prev).add(userMessageId));
          }
        } catch (err) {
          console.error('[useChatOrchestrator] Direct task execution failed:', err);
        }
      }

      // 2. تحديث تقدم الأهداف مباشرة
      if (result.goalProgressProposal) {
        const goalProposal = result.goalProgressProposal as any; // تم إضافة as any
        goalProposal.originatingMessageId = userMessageId;
        const goalStore = useGoalStore.getState();

        try {
          if (typeof (goalStore as any).updateGoalProgress === 'function') {
            await (goalStore as any).updateGoalProgress(
              goalProposal.goalId,
              goalProposal.progressIncrement
            );
          } else if (typeof (goalStore as any).addProgress === 'function') {
            await (goalStore as any).addProgress(
              goalProposal.goalId,
              goalProposal.progressIncrement
            );
          }

          if (userMessageId) {
            setResolvedChatProposals((prev) => new Set(prev).add(userMessageId));
          }
        } catch (err) {
          console.error('[useChatOrchestrator] Direct goal execution failed:', err);
        }
      }

      // 3. إضافة هدف جديد مباشرة
      if (result.goalProposal) {
        const gProp = result.goalProposal as any; // تم إضافة as any
        gProp.originatingMessageId = userMessageId;
        const goalStore = useGoalStore.getState();

        try {
          if (typeof (goalStore as any).addGoal === 'function') {
            await (goalStore as any).addGoal({
              id: 'goal-' + Date.now(),
              title: gProp.title,
              category: gProp.category || 'personal',
              target: gProp.target || 100,
              current: 0,
              unit: gProp.unit || '%',
              deadline: gProp.deadline || new Date().toISOString().split('T')[0],
            });
          }

          if (userMessageId) {
            setResolvedChatProposals((prev) => new Set(prev).add(userMessageId));
          }
        } catch (err) {
          console.error('[useChatOrchestrator] Direct goal creation failed:', err);
        }
      }

      // 4. تعيين الملاحظة والتوجيه اللحظي
      if (result.commandFeedback) {
        setLastCommandFeedback(result.commandFeedback);
      }
      if (result.commandTargetRoute && onCommandNavigate) {
        onCommandNavigate(result.commandTargetRoute);
      }
    },
    [language, onCommandNavigate]
  );

  // إبقاء الدالة للأمان والتوافق الخلفي للواجهة البرمجية (Backward Compatibility)
  const confirmProposal = useCallback(
    async (proposal: ChatActionProposal, messageId: string) => {
      if (executionState === 'executing') return;

      setError(null);
      setExecutionState('executing');

      try {
        const taskStore = useTaskStore.getState();
        const p = proposal as any; // تم إضافة as any

        if (p.type === 'existing_task') {
          if (typeof (taskStore as any).toggleTask === 'function') {
            await (taskStore as any).toggleTask(p.taskId);
          } else {
            throw new Error('toggleTask method not found in store');
          }
        } else if (p.type === 'new_task_required') {
          const title = p.title || (language === 'ar' ? 'مهمة جديدة' : 'New Task');
          const date = p.date || new Date().toISOString().split('T')[0];

          if (typeof (taskStore as any).createTask === 'function') {
            await (taskStore as any).createTask(title, 'medium', date);
          } else if (typeof (taskStore as any).addTask === 'function') {
            await (taskStore as any).addTask({
              id: 'task-' + Date.now(),
              title,
              priority: 'medium',
              date,
              completed: false,
              createdAt: new Date().toISOString(),
            });
          } else {
            throw new Error('createTask/addTask method not found in store');
          }
        }

        setResolvedChatProposals((prev) => new Set(prev).add(messageId));
        setExecutionState('idle');
      } catch (e: any) {
        console.error('[useChatOrchestrator] Failed to execute proposal:', e);
        setError({
          code: 'REQUEST_FAILED',
          message: 'Failed to execute proposal.',
          messageAr: 'تعذر تنفيذ الاقتراح. يرجى المحاولة مرة أخرى.',
          retryable: true,
        });
        setExecutionState('idle');
      }
    },
    [executionState, language]
  );

  const submitMessage = useCallback(
    async (message: string): Promise<ChatOrchestrationResult> => {
      if (isSubmittingRef.current) {
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
          return { handledAsCommand: false, error: errorResult };
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
          return { handledAsCommand: false, error: errorResult };
        }

        lastSubmittedMessageRef.current = trimmed;
        setError(null);
        setExecutionState('parsing_command');
        const state = useChatStore.getState();
        const sendMessage = state.sendMessage;

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
          return { handledAsCommand: false, error: errorResult };
        }

        const updatedState = useChatStore.getState();
        const activeConversation = originConvId
          ? updatedState.conversations.find((c) => c.id === originConvId)
          : null;
        const context = getContext();
        setExecutionState('generating');

        const result = await aiOrchestrator.orchestrate({
          message: trimmed,
          messageId: userMessageId,
          context,
          conversationHistory: activeConversation?.messages,
          language,
        });

        if (result.handledAsCommand) {
          setExecutionState('idle');
          await applyCommandResult(result, userMessageId);
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
            return { handledAsCommand: false, error: errorResult };
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
    if (isSubmittingRef.current) return null;
    isSubmittingRef.current = true;

    try {
      const state = useChatStore.getState();
      const originConvId = state.activeConversationId;
      const activeConversation = originConvId
        ? state.conversations.find((c) => c.id === originConvId)
        : null;
      const sendMessage = state.sendMessage;
      if (!lastSubmittedMessageRef.current) {
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
        await applyCommandResult(result, lastUserMsg?.id);
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
            return { handledAsCommand: false, error: errorResult };
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
      const errorResult: AIError = {
        code: 'REQUEST_FAILED',
        message: e?.message || 'Failed to process retry request.',
        messageAr: 'فشل معالجة طلب إعادة المحاولة.',
        retryable: true,
      };
      setError(errorResult);
      return { handledAsCommand: false, error: errorResult };
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
    confirmProposal,
    resolvedChatProposals,
  };
}