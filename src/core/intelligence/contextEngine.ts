import { useFocusStore } from '../state/focusStore';
import {
  Task,
  Goal,
  Note,
  FocusSession,
  Transaction,
  Conversation,
  KnowledgeItem,
} from '../../types/data';
import {
  NOVOContext,
  NOVOSummary,
  ActivityEvent,
  WorkspaceSnapshot,
  IntelligenceSnapshot,
} from './intelligenceTypes';
import { captureWorkspaceSnapshot } from './workspaceSnapshotBuilder';
import { getTodayString, isDateToday } from './dateUtils';
import { evaluateWorkspaceIntelligence } from './intelligenceOrchestrator';
import { useTaskStore } from '../state/taskStore';
import { useKnowledgeStore } from '../state/knowledgeStore';
import { useGoalStore } from '../state/goalStore';
import { useMoneyStore } from '../state/moneyStore';
import { useNoteStore } from '../state/noteStore';
import { useChatStore } from '../state/chatStore';
import { ActiveFocusState } from '../../modules/focus/domain/types';

export interface ContextSourceData {
  tasks: Task[];
  goals: Goal[];
  notes: Note[];
  sessions: FocusSession[];
  transactions: Transaction[];
  conversations?: Conversation[];
  knowledgeItems?: KnowledgeItem[];
  activeFocusState?: ActiveFocusState | null;
  activeConversationId?: string | null;
}

/**
 * Pure adapter: adapts an IntelligenceSnapshot into the legacy NOVOContext interface.
 * Does not re-calculate any intelligence metrics.
 */
export function toNOVOContext(intelligence: IntelligenceSnapshot): NOVOContext {
  const { snapshot, evaluatedAt } = intelligence;
  const now = new Date(evaluatedAt);
  const todayStr = snapshot.date || getTodayString(now);

  const todayTasks = snapshot.tasks.filter((t) =>
    isDateToday(t.date || t.createdAt, now)
  );
  const completedTasks = snapshot.tasks.filter((t) => t.completed);
  const overdueTasks = snapshot.tasks.filter(
    (t) => !t.completed && t.date && t.date < todayStr
  );
  const activeGoals = snapshot.goals.filter((g) => g.progress < 100);

  const recentNotes = [...snapshot.notes]
    .sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt).getTime() || 0;
      const timeB = new Date(b.updatedAt || b.createdAt).getTime() || 0;
      return timeB - timeA;
    })
    .slice(0, 10);

  const boundedKnowledge = [...snapshot.knowledgeItems]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 50);

  const recentKnowledge = [...boundedKnowledge]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  return {
    generatedAt: evaluatedAt,
    date: todayStr,
    todayTasks,
    completedTasks,
    overdueTasks,
    activeGoals,
    notesCount: snapshot.notes.length,
    recentNotes,
    recentKnowledge,
    focusSessions: snapshot.sessions,
    focusStats: intelligence.focus,
    moneySummary: intelligence.finance,
    tasks: snapshot.tasks,
    goals: snapshot.goals,
    focusSummary: intelligence.focus,
    financeSummary: intelligence.finance,
    knowledgeSummary: intelligence.knowledge,
    productivitySummary: intelligence.productivity,
    goalHealth: intelligence.goalHealth,
    productivityScore: intelligence.score.score,
    recentActivity: intelligence.activityTimeline as ActivityEvent[],
    insights: intelligence.insights,
    conversations: snapshot.conversations,
    activeFocusState: snapshot.activeFocusState ?? null,
    activeConversationId: snapshot.activeConversationId ?? null,
  };
}

/**
 * NOVO Context Engine
 *
 * Delegates execution to the canonical evaluateWorkspaceIntelligence pipeline
 * and adapts the result into the backward-compatible NOVOContext structure.
 *
 * Zero duplicate analytical calculations.
 */
export function buildNOVOContext(
  data: ContextSourceData,
  now: Date = new Date()
): NOVOContext {
  const snapshot = captureWorkspaceSnapshot(data, now);
  const intelligence = evaluateWorkspaceIntelligence(snapshot, now);
  return toNOVOContext(intelligence);
}

/**
 * Reads local storage abstraction directly and returns the current NOVOContext.
 * Pure business logic function callable outside React component lifecycles.
 */
export function getNOVOContext(now: Date = new Date()): NOVOContext {
  if (useTaskStore.getState().status === 'idle') {
    useTaskStore.getState().initialize();
  }
  const tasks = useTaskStore.getState().tasks;
  if (useGoalStore.getState().status === 'idle') {
    useGoalStore.getState().initialize();
  }
  const goals = useGoalStore.getState().goals;
  if (useNoteStore.getState().status === 'idle') {
    useNoteStore.getState().initialize();
  }
  const rawNotes = useNoteStore.getState().notes;
  const notes = [...rawNotes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 10);
  if (useFocusStore.getState().status === 'idle') { useFocusStore.getState().initialize(); } 
  const sessions = useFocusStore.getState().sessions;
  const activeFocusState = useFocusStore.getState().activeState;
  if (useMoneyStore.getState().status === 'idle') {
    useMoneyStore.getState().initialize();
  }
  const transactions = useMoneyStore.getState().transactions;
  if (useChatStore.getState().status === 'idle') {
    useChatStore.getState().initialize();
  }
  const conversations = useChatStore.getState().conversations;
  const activeConversationId = useChatStore.getState().activeConversationId;
  
  if (useKnowledgeStore.getState().status === 'idle') {
    useKnowledgeStore.getState().initialize();
  }
  const rawKnowledge = useKnowledgeStore.getState().knowledge;
  const knowledgeItems = rawKnowledge;

  return buildNOVOContext(
    {
      tasks,
      goals,
      notes,
      sessions,
      transactions,
      conversations,
      knowledgeItems,
      activeFocusState,
      activeConversationId,
    },
    now
  );
}

/**
 * Unified NOVO Summary
 *
 * Returns a concise, structured overview of the user's current productivity,
 * task state, active goals, focus minutes, and finances.
 */
export function getNOVOSummary(context?: NOVOContext): NOVOSummary {
  const ctx = context || getNOVOContext();

  return {
    productivityScore: ctx.productivityScore,
    tasksSummary: ctx.productivitySummary,
    goalsSummary: ctx.goalHealth,
    focusSummary: ctx.focusSummary,
    notesSummary: ctx.knowledgeSummary,
    financialSummary: ctx.financeSummary,
  };
}
