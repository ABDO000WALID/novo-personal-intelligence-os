import {
  Task,
  Goal,
  Note,
  FocusSession,
  Transaction,
  Conversation,
  KnowledgeItem,
} from '../../types/data';
import { ActiveFocusState } from '../../modules/focus/domain/types';
import { WorkspaceSnapshot } from './intelligenceTypes';
import { getTodayString } from './dateUtils';

export interface WorkspaceSnapshotInput {
  tasks?: Task[];
  goals?: Goal[];
  notes?: Note[];
  knowledgeItems?: KnowledgeItem[];
  transactions?: Transaction[];
  sessions?: FocusSession[];
  conversations?: Conversation[];
  activeFocusState?: ActiveFocusState | null;
  activeConversationId?: string | null;
  capturedAt?: string;
  date?: string;
}

/**
 * Pure Workspace Snapshot Builder
 *
 * Assembles a canonical WorkspaceSnapshot from raw domain collections.
 * Completely provider-agnostic, zero React, zero Zustand writes,
 * zero Firebase access, zero persistence side-effects.
 */
export function captureWorkspaceSnapshot(
  input: WorkspaceSnapshotInput,
  now: Date = new Date()
): WorkspaceSnapshot {
  return {
    capturedAt: input.capturedAt || now.toISOString(),
    date: input.date || getTodayString(now),
    tasks: input.tasks || [],
    goals: input.goals || [],
    notes: input.notes || [],
    knowledgeItems: input.knowledgeItems || [],
    transactions: input.transactions || [],
    sessions: input.sessions || [],
    conversations: input.conversations || [],
    activeFocusState: input.activeFocusState ?? null,
    activeConversationId: input.activeConversationId ?? null,
  };
}
