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
import { storageService, INITIAL_SEEDS } from '../storage/storageService';
import { STORAGE_KEYS } from '../storage/storageKeys';

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

  // Analyze individual domains deterministically
  const productivitySummary: ProductivitySummary = analyzeProductivity(data.tasks, now);
  const goalHealth: GoalHealthResult = analyzeGoals(data.goals, now);
  const focusSummary: FocusSummary = analyzeFocus(data.sessions, now);
  const financeSummary: FinanceSummary = analyzeFinance(data.transactions, now);
  const knowledgeSummary: KnowledgeSummary = analyzeNotesAndKnowledge(
    data.notes,
    data.knowledgeItems || [],
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
      knowledgeItems: data.knowledgeItems,
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
  const tasks = storageService.getItem<Task[]>(
    STORAGE_KEYS.TASKS,
    INITIAL_SEEDS.tasks()
  );
  const goals = storageService.getItem<Goal[]>(
    STORAGE_KEYS.GOALS,
    INITIAL_SEEDS.goals()
  );
  const notes = storageService.getItem<Note[]>(
    STORAGE_KEYS.NOTES,
    INITIAL_SEEDS.notes()
  );
  const sessions = storageService.getItem<FocusSession[]>(
    STORAGE_KEYS.FOCUS_SESSIONS,
    INITIAL_SEEDS.focusSessions()
  );
  const transactions = storageService.getItem<Transaction[]>(
    STORAGE_KEYS.MONEY_ENTRIES,
    INITIAL_SEEDS.transactions()
  );
  const conversations = storageService.getItem<Conversation[]>(
    STORAGE_KEYS.CONVERSATIONS,
    INITIAL_SEEDS.conversations()
  );
  const knowledgeItems = storageService.getItem<KnowledgeItem[]>(
    STORAGE_KEYS.KNOWLEDGE,
    INITIAL_SEEDS.knowledge()
  );

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
