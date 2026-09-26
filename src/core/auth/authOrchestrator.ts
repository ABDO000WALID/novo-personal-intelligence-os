import { AuthLifecycle } from './authLifecycle';
import { useTaskStore } from '../state/taskStore';
import { useGoalStore } from '../state/goalStore';
import { useNoteStore } from '../state/noteStore';
import { useKnowledgeStore } from '../state/knowledgeStore';
import { useMoneyStore } from '../state/moneyStore';
import { useChatStore } from '../state/chatStore';
import { useFocusStore } from '../state/focusStore';

/**
 * Deterministically resets the authentication identity in-memory.
 */
export const resetAuthIdentity = (newUid: string | null = null) => {
  // 1. Invalidate the old auth epoch so pending async ops become stale
  AuthLifecycle.reset(newUid);

  // 2. Synchronously clear all user-owned Zustand state
  // 3. Stop/cancel active Focus timer/session (handled inside focusStore.clearState)
  useTaskStore.getState().clearState();
  useGoalStore.getState().clearState();
  useNoteStore.getState().clearState();
  useKnowledgeStore.getState().clearState();
  useMoneyStore.getState().clearState();
  useChatStore.getState().clearState();
  useFocusStore.getState().clearState();
};
