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
  ProductivitySummary,
  GoalHealthResult,
  FocusSummary,
  FinanceSummary,
  KnowledgeSummary,
  ActivityEvent,
  Insight,
} from './intelligenceTypes';
import { getTodayString, isDateToday } from './dateUtils';
import { analyzeProductivity } from './productivityEngine';
import { analyzeGoals } from './goalEngine';
import { analyzeFocus } from './focusEngine';
import { analyzeFinance } from './financeEngine';
import { analyzeNotesAndKnowledge } from './notesEngine';
import { calculateNovoScore } from './scoreEngine';
import { generateSmartInsights } from './insightEngine';
import { generateActivityTimeline } from './activityEngine';
import { RepositoryFactory } from '../data/RepositoryFactory';
import { useTaskStore } from '../state/taskStore';
import { useKnowledgeStore } from '../state/knowledgeStore';
import { useGoalStore } from '../state/goalStore';
import { useMoneyStore } from '../state/moneyStore';
import { useNoteStore } from '../state/noteStore';
import { useChatStore } from '../state/chatStore';


export interface ContextSourceData {
  tasks: Task[];
  goals: Goal[];
  notes: Note[];
  sessions: FocusSession[];
  transactions: Transaction[];
  conversations?: Conversation[];
  knowledgeItems?: KnowledgeItem[];
}

/**
 * NOVO Context Engine
 *
 * Pure, deterministic business logic layer that aggregates local data from
 * storage abstraction into an unified context snapshot.
 *
 * DOES NOT depend on UI components or external AI services.
 */
export function buildNOVOContext(
  data: ContextSourceData,
  now: Date = new Date()
): NOVOContext {
  const todayStr = getTodayString(now);

  // AI Bounding: We only send the 50 most recently updated knowledge items to prevent token explosion.
  const boundedKnowledge = [...(data.knowledgeItems || [])]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 50);

  // Analyze individual domains deterministically
  const productivitySummary: ProductivitySummary = analyzeProductivity(data.tasks, now);
  const goalHealth: GoalHealthResult = analyzeGoals(data.goals, now);
  const focusSummary: FocusSummary = analyzeFocus(data.sessions, now);
  const financeSummary: FinanceSummary = analyzeFinance(data.transactions, now);
  const knowledgeSummary: KnowledgeSummary = analyzeNotesAndKnowledge(
    data.notes,
    boundedKnowledge,
    now
  );

  const { score: productivityScore } = calculateNovoScore({
    productivity: productivitySummary,
    goals: goalHealth,
    focus: focusSummary,
    knowledge: knowledgeSummary,
  });

  const insights: Insight[] = generateSmartInsights(
    {
      productivity: productivitySummary,
      goals: goalHealth,
      focus: focusSummary,
      finance: financeSummary,
      knowledge: knowledgeSummary,
    },
    now
  );

  const recentActivity: ActivityEvent[] = generateActivityTimeline(
    {
      notes: data.notes,
      goals: data.goals,
      tasks: data.tasks,
      sessions: data.sessions,
      transactions: data.transactions,
      conversations: data.conversations,
      knowledgeItems: boundedKnowledge,
    },
    15
  );

  // Filter specific task and goal slices requested by Context Engine architecture
  const todayTasks = data.tasks.filter((t) =>
    isDateToday(t.date || t.createdAt, now)
  );
  const completedTasks = data.tasks.filter((t) => t.completed);
  const overdueTasks = data.tasks.filter(
    (t) => !t.completed && t.date && t.date < todayStr
  );
  const activeGoals = data.goals.filter((g) => g.progress < 100);

  // Recent notes sorted by newest update/creation
  const recentNotes = [...data.notes]
    .sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt).getTime() || 0;
      const timeB = new Date(b.updatedAt || b.createdAt).getTime() || 0;
      return timeB - timeA;
    })
    .slice(0, 10);

  return {
    generatedAt: now.toISOString(),
    date: todayStr,
    todayTasks,
    completedTasks,
    overdueTasks,
    activeGoals,
    notesCount: data.notes.length,
    recentNotes,
    recentKnowledge: boundedKnowledge.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5),
    focusSessions: data.sessions,
    focusStats: focusSummary,
    moneySummary: financeSummary,
    tasks: data.tasks,
    goals: data.goals,
    focusSummary,
    financeSummary,
    knowledgeSummary,
    productivitySummary,
    goalHealth,
    productivityScore,
    recentActivity,
    insights,
  };
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
  if (useFocusStore.getState().status === 'idle') { useFocusStore.getState().initialize(); } const sessions = useFocusStore.getState().sessions;
  if (useMoneyStore.getState().status === 'idle') {
    useMoneyStore.getState().initialize();
  }
  const transactions = useMoneyStore.getState().transactions;
    if (useChatStore.getState().status === 'idle') {
    useChatStore.getState().initialize();
  }
  const conversations = useChatStore.getState().conversations;
  
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
