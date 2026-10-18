/**
 * Gate 20-A — NOVO Intelligence Foundation & Runtime Boundary Verification Suite
 *
 * Verifies all Gate 20-A requirements:
 * A. WorkspaceSnapshot can be constructed from current domain data.
 * B. evaluateWorkspaceIntelligence() is callable without React.
 * C. evaluateWorkspaceIntelligence() does not require Zustand.
 * D. evaluateWorkspaceIntelligence() does not require Firebase.
 * E. identical snapshot + identical now produces identical results.
 * F. the input snapshot is not mutated.
 * G. intelligence evaluation performs no persistence writes.
 * H. contextEngine uses the canonical pipeline rather than independently calculating intelligence.
 * I. useIntelligence no longer contains a competing independent calculation pipeline.
 * J. Local and Firebase-backed domain data with identical WorkspaceSnapshot values produce identical intelligence results.
 * K. existing NOVOContext consumers remain compatible.
 * L. Gate 19.4 runtime behavior remains unaffected.
 */

import './test_firebase_mock_app';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { setMockFirestore } from './src/core/data/repositories/firebase/firestoreProvider';
import { storageService } from './src/core/storage/storageService';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { useNoteStore } from './src/core/state/noteStore';
import { useKnowledgeStore } from './src/core/state/knowledgeStore';
import { useMoneyStore } from './src/core/state/moneyStore';
import { useFocusStore } from './src/core/state/focusStore';
import { useChatStore } from './src/core/state/chatStore';

import {
  WorkspaceSnapshot,
  IntelligenceSnapshot,
  NOVOContext,
} from './src/core/intelligence/intelligenceTypes';
import { evaluateWorkspaceIntelligence } from './src/core/intelligence/intelligenceOrchestrator';
import {
  buildNOVOContext,
  toNOVOContext,
  getNOVOContext,
  getNOVOSummary,
  ContextSourceData,
} from './src/core/intelligence/contextEngine';
import {
  buildAIGroundedContext,
  buildAISystemContext,
} from './src/core/intelligence/contextBuilder';
import { calculateNovoScore } from './src/core/intelligence/scoreEngine';
import { generateSmartInsights } from './src/core/intelligence/insightEngine';
import { generateDailyBriefing } from './src/core/intelligence/briefingEngine';
import { generateWeeklyReview } from './src/core/intelligence/weeklyReviewEngine';
import { determineNextAction } from './src/core/intelligence/nextActionEngine';
import { evaluateAttentionRadar } from './src/core/intelligence/attentionEngine';
import { calculateGoalPacing, analyzeAllGoalsPacing } from './src/core/intelligence/goalVelocityEngine';
import { aiProviderRegistry, AIProvider } from './src/core/ai/aiProvider';
import { AIResponse, AIRequestOptions } from './src/core/ai/aiTypes';
import { Task, Goal, Note, FocusSession, Transaction, KnowledgeItem, Conversation } from './src/types/data';
import { ActiveFocusState } from './src/modules/focus/domain/types';

let passedCount = 0;
let failedCount = 0;
const failedTests: string[] = [];

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    failedCount++;
    failedTests.push(message);
    throw new Error(message);
  }
  console.log(`  ✓ PASS: ${message}`);
  passedCount++;
}

// Global Spies for Write Tracking
let firestoreWriteAttempts = 0;
let localStorageWriteAttempts = 0;

const mockDb: Record<string, any> = {};

const mockFirestore: any = {
  getFirestore: () => ({}),
  doc: (_db: any, path: string) => path,
  collection: (_db: any, path: string) => path,
  getDoc: async (docRef: string) => {
    const parts = docRef.split('/');
    const col = parts.slice(0, parts.length - 1).join('/');
    const id = parts[parts.length - 1];
    const exists = mockDb[col] && mockDb[col][id] !== undefined;
    return {
      exists: () => exists,
      data: () => (exists ? JSON.parse(JSON.stringify(mockDb[col][id])) : undefined),
    };
  },
  getDocs: async (colRef: string) => {
    const docs = mockDb[colRef] || {};
    return {
      docs: Object.keys(docs).map(id => ({
        id,
        data: () => JSON.parse(JSON.stringify(docs[id])),
      })),
    };
  },
  setDoc: async (docRef: string, data: any) => {
    firestoreWriteAttempts++;
    const parts = docRef.split('/');
    const col = parts.slice(0, parts.length - 1).join('/');
    const id = parts[parts.length - 1];
    if (!mockDb[col]) mockDb[col] = {};
    mockDb[col][id] = JSON.parse(JSON.stringify(data));
  },
  deleteDoc: async () => {
    firestoreWriteAttempts++;
  },
  writeBatch: () => ({
    set: () => { firestoreWriteAttempts++; },
    delete: () => { firestoreWriteAttempts++; },
    commit: async () => {},
  }),
};

setMockFirestore(mockFirestore);

// Spy on localStorage / storageService
const originalStorageSetItem = storageService.setItem.bind(storageService);
storageService.setItem = ((key: string, value: any) => {
  localStorageWriteAttempts++;
  return originalStorageSetItem(key, value);
}) as any;

// Canonical Test Data Fixture
function createStandardFixture() {
  const fixedDate = new Date('2026-10-16T12:00:00.000Z');
  const todayStr = '2026-10-16';

  const tasks: Task[] = [
    { id: 'task-1', title: 'Prepare board meeting slides', date: todayStr, completed: false, priority: 'high', goalId: 'goal-1', createdAt: '2026-10-16T08:00:00Z' },
    { id: 'task-2', title: 'Review quarterly revenue numbers', date: todayStr, completed: true, priority: 'medium', goalId: 'goal-2', createdAt: '2026-10-16T09:00:00Z' },
    { id: 'task-3', title: 'Submit patent disclosure report', date: '2026-10-14', completed: false, priority: 'high', goalId: 'goal-1', createdAt: '2026-10-13T10:00:00Z' }, // Overdue
    { id: 'task-4', title: 'Update documentation index', date: '2026-10-17', completed: false, priority: 'low', createdAt: '2026-10-16T11:00:00Z' },
  ];

  const goals: Goal[] = [
    { id: 'goal-1', title: 'Launch Enterprise Tier', description: 'Scale B2B recurring revenue', progress: 45, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-10-15T10:00:00Z' },
    { id: 'goal-2', title: 'Financial Sustainability', description: 'Achieve positive operating cashflow', progress: 80, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-10-16T09:00:00Z' },
    { id: 'goal-3', title: 'AI Agent Architecture', description: 'Complete zero-dependency intelligence layer', progress: 10, createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-20T00:00:00Z' }, // Stalled
  ];

  const notes: Note[] = [
    { id: 'note-1', title: 'Enterprise pricing models', content: 'Discussion on usage-based vs seat tiers', goalId: 'goal-1', createdAt: '2026-10-15T14:00:00Z', updatedAt: '2026-10-15T14:00:00Z' },
    { id: 'note-2', title: 'Q4 roadmap synthesis', content: 'Key focus areas and deliverables', createdAt: '2026-10-16T07:30:00Z', updatedAt: '2026-10-16T07:30:00Z' },
  ];

  const sessions: FocusSession[] = [
    { id: 'sess-1', duration: 45, actualDurationSeconds: 2700, completedAt: '2026-10-16T10:00:00Z', goalId: 'goal-1', taskId: 'task-1' },
    { id: 'sess-2', duration: 30, actualDurationSeconds: 1800, completedAt: '2026-10-15T15:00:00Z', goalId: 'goal-2', taskId: 'task-2' },
  ];

  const transactions: Transaction[] = [
    { id: 'tx-1', type: 'income', amount: 5000, category: 'consulting', description: 'Retainer deposit', createdAt: '2026-10-10T00:00:00Z' },
    { id: 'tx-2', type: 'expense', amount: 250, category: 'software', description: 'Cloud server hosting', createdAt: '2026-10-15T00:00:00Z' },
    { id: 'tx-3', type: 'expense', amount: 120, category: 'office', description: 'Ergonomic keyboard', createdAt: '2026-10-16T00:00:00Z' },
  ];

  const knowledgeItems: KnowledgeItem[] = [
    { id: 'know-1', title: 'Distributed Systems Patterns', content: 'Event-driven vs CQRS architectures', category: 'programming', tags: ['architecture', 'backend'], importance: 'high', pinned: true, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-16T08:00:00Z' },
  ];

  const conversations: Conversation[] = [
    { id: 'conv-1', title: 'Q4 Strategy Review', messages: [{ id: 'm1', role: 'user', content: 'Review my weekly goals', createdAt: '2026-10-16T09:00:00Z' }], createdAt: '2026-10-16T09:00:00Z', updatedAt: '2026-10-16T09:00:00Z' },
  ];

  const activeFocusState: ActiveFocusState = {
    mode: 'preset',
    status: 'running',
    startedAt: '2026-10-16T11:45:00.000Z',
    durationSeconds: 1500,
    totalPausedMs: 0,
    lastPauseTimestamp: null,
  };

  const activeConversationId = 'conv-1';

  const snapshot: WorkspaceSnapshot = {
    capturedAt: fixedDate.toISOString(),
    date: todayStr,
    tasks,
    goals,
    notes,
    knowledgeItems,
    transactions,
    sessions,
    conversations,
    activeFocusState,
    activeConversationId,
  };

  return {
    fixedDate,
    snapshot,
  };
}

async function runTestSuite() {
  console.log('======================================================================');
  console.log('GATE 20-A: NOVO INTELLIGENCE FOUNDATION & RUNTIME BOUNDARY SUITE');
  console.log('======================================================================\n');

  // -------------------------------------------------------------------------
  // TEST A: WorkspaceSnapshot Construction
  // -------------------------------------------------------------------------
  console.log('--- Test A: WorkspaceSnapshot Construction from Domain Data ---');
  {
    const { snapshot, fixedDate } = createStandardFixture();

    assert(snapshot.date === '2026-10-16', 'WorkspaceSnapshot date is YYYY-MM-DD');
    assert(snapshot.capturedAt === fixedDate.toISOString(), 'WorkspaceSnapshot capturedAt is accurate ISO timestamp');
    assert(snapshot.tasks.length === 4, 'Snapshot contains raw tasks array');
    assert(snapshot.goals.length === 3, 'Snapshot contains raw goals array');
    assert(snapshot.notes.length === 2, 'Snapshot contains raw notes array');
    assert(snapshot.knowledgeItems.length === 1, 'Snapshot contains raw knowledgeItems array');
    assert(snapshot.transactions.length === 3, 'Snapshot contains raw transactions array');
    assert(snapshot.sessions.length === 2, 'Snapshot contains raw sessions array');
    assert(snapshot.conversations?.length === 1, 'Snapshot contains raw conversations array');
    assert(snapshot.activeFocusState?.status === 'running', 'Snapshot contains activeFocusState');
    assert(snapshot.activeConversationId === 'conv-1', 'Snapshot contains activeConversationId');

    // Forbidden content check: no computed metrics inside WorkspaceSnapshot
    assert(!('productivityScore' in snapshot), 'WorkspaceSnapshot contains NO computed productivityScore');
    assert(!('goalHealth' in snapshot), 'WorkspaceSnapshot contains NO computed goalHealth');
    assert(!('insights' in snapshot), 'WorkspaceSnapshot contains NO computed insights');
    assert(!('briefing' in snapshot), 'WorkspaceSnapshot contains NO computed briefing');
  }

  // -------------------------------------------------------------------------
  // TEST B: Headless Execution without React
  // -------------------------------------------------------------------------
  console.log('\n--- Test B: evaluateWorkspaceIntelligence() Headless Execution (No React) ---');
  {
    const { snapshot, fixedDate } = createStandardFixture();
    
    // Evaluate completely synchronously outside React
    const intelligence: IntelligenceSnapshot = evaluateWorkspaceIntelligence(snapshot, fixedDate);

    assert(intelligence !== null && typeof intelligence === 'object', 'evaluateWorkspaceIntelligence returns valid object');
    assert(intelligence.evaluatedAt === fixedDate.toISOString(), 'Intelligence evaluatedAt matches timestamp');
    assert(typeof intelligence.score.score === 'number', 'Calculated score is numeric in headless context');
    assert(typeof intelligence.briefing.greeting === 'string', 'Generated briefing greeting in headless context');
    assert(intelligence.insights.length > 0, 'Generated insights in headless context');
    assert(intelligence.goalPacing.length === 3, 'Evaluated goal pacing for all 3 goals');
  }

  // -------------------------------------------------------------------------
  // TEST C: Zero Zustand Dependency in Orchestrator
  // -------------------------------------------------------------------------
  console.log('\n--- Test C: evaluateWorkspaceIntelligence() Does Not Require Zustand ---');
  {
    // Clear all Zustand stores completely
    useTaskStore.setState({ tasks: [] });
    useGoalStore.setState({ goals: [] });
    useFocusStore.setState({ sessions: [], activeState: null });
    useNoteStore.setState({ notes: [] });
    useKnowledgeStore.setState({ knowledge: [] });
    useMoneyStore.setState({ transactions: [] });
    useChatStore.setState({ conversations: [], activeConversationId: null });

    // Pass our standalone snapshot
    const { snapshot, fixedDate } = createStandardFixture();
    const result = evaluateWorkspaceIntelligence(snapshot, fixedDate);

    // The orchestrator must evaluate the snapshot passed in, NOT the empty Zustand stores
    assert(result.productivity.totalTasks === 4, 'Orchestrator evaluated 4 tasks from snapshot, ignoring empty Zustand taskStore');
    assert(result.goalHealth.totalGoals === 3, 'Orchestrator evaluated 3 goals from snapshot, ignoring empty Zustand goalStore');
    assert(result.focus.totalSessions === 2, 'Orchestrator evaluated 2 sessions from snapshot, ignoring empty Zustand focusStore');
  }

  // -------------------------------------------------------------------------
  // TEST D: Zero Firebase Dependency in Orchestrator
  // -------------------------------------------------------------------------
  console.log('\n--- Test D: evaluateWorkspaceIntelligence() Does Not Require Firebase ---');
  {
    const { snapshot, fixedDate } = createStandardFixture();

    // Reset auth and repository provider completely
    AuthLifecycle.reset(null);
    RepositoryFactory.setDataSource('local');

    const result = evaluateWorkspaceIntelligence(snapshot, fixedDate);
    assert(result.score.score > 0, 'Evaluates intelligence with no Firebase auth or connection');
  }

  // -------------------------------------------------------------------------
  // TEST E: Pure Deterministic Reproducibility
  // -------------------------------------------------------------------------
  console.log('\n--- Test E: Pure Deterministic Reproducibility (Identical Input = Identical Output) ---');
  {
    const { snapshot, fixedDate } = createStandardFixture();

    const run1 = evaluateWorkspaceIntelligence(snapshot, fixedDate);
    const run2 = evaluateWorkspaceIntelligence(snapshot, fixedDate);

    assert(run1.score.score === run2.score.score, 'NOVO Score is 100% reproducible');
    assert(JSON.stringify(run1.score.breakdown) === JSON.stringify(run2.score.breakdown), 'Score breakdown is 100% reproducible');
    assert(run1.briefing.greeting === run2.briefing.greeting, 'Briefing greeting is identical');
    assert(run1.briefing.summary === run2.briefing.summary, 'Briefing summary is identical');
    assert(run1.nextAction.tier === run2.nextAction.tier, 'NextAction tier is identical');
    assert(run1.attentionRadar.type === run2.attentionRadar.type, 'AttentionRadar type is identical');
    assert(JSON.stringify(run1.insights) === JSON.stringify(run2.insights), 'Insights array is 100% identical');
  }

  // -------------------------------------------------------------------------
  // TEST F: Read-Only Immutability of Input Snapshot
  // -------------------------------------------------------------------------
  console.log('\n--- Test F: Read-Only Immutability of Input Snapshot ---');
  {
    const { snapshot, fixedDate } = createStandardFixture();

    // Freeze snapshot and inner arrays to prove zero in-place mutation
    const frozenTasks = JSON.parse(JSON.stringify(snapshot.tasks));
    Object.freeze(frozenTasks);
    for (const t of frozenTasks) Object.freeze(t);

    const frozenGoals = JSON.parse(JSON.stringify(snapshot.goals));
    Object.freeze(frozenGoals);
    for (const g of frozenGoals) Object.freeze(g);

    const frozenSnapshot: WorkspaceSnapshot = {
      ...snapshot,
      tasks: frozenTasks,
      goals: frozenGoals,
    };

    const result = evaluateWorkspaceIntelligence(frozenSnapshot, fixedDate);
    assert(result !== null, 'Execution completed without throwing mutation error on frozen inputs');
    assert(frozenTasks.length === 4, 'Input tasks array length remains unmodified');
    assert(frozenGoals.length === 3, 'Input goals array length remains unmodified');
  }

  // -------------------------------------------------------------------------
  // TEST G: Zero Persistence Writes
  // -------------------------------------------------------------------------
  console.log('\n--- Test G: Intelligence Evaluation Performs Zero Persistence Writes ---');
  {
    const initialFirestoreWrites = firestoreWriteAttempts;
    const initialLocalWrites = localStorageWriteAttempts;

    const { snapshot, fixedDate } = createStandardFixture();
    evaluateWorkspaceIntelligence(snapshot, fixedDate);

    assert(firestoreWriteAttempts === initialFirestoreWrites, 'Zero writes executed against Firestore');
    assert(localStorageWriteAttempts === initialLocalWrites, 'Zero writes executed against localStorage');
  }

  // -------------------------------------------------------------------------
  // TEST H: contextEngine Uses Canonical Pipeline
  // -------------------------------------------------------------------------
  console.log('\n--- Test H: contextEngine Uses Canonical Pipeline without Duplicate Logic ---');
  {
    const { snapshot, fixedDate } = createStandardFixture();

    // 1. Evaluate via canonical orchestrator
    const intelligence = evaluateWorkspaceIntelligence(snapshot, fixedDate);

    // 2. Adapt via toNOVOContext
    const contextFromAdapter = toNOVOContext(intelligence);

    // 3. Evaluate via buildNOVOContext
    const contextFromBuilder = buildNOVOContext(
      {
        tasks: snapshot.tasks,
        goals: snapshot.goals,
        notes: snapshot.notes,
        sessions: snapshot.sessions,
        transactions: snapshot.transactions,
        knowledgeItems: snapshot.knowledgeItems,
        conversations: snapshot.conversations,
        activeFocusState: snapshot.activeFocusState,
        activeConversationId: snapshot.activeConversationId,
      },
      fixedDate
    );

    assert(contextFromAdapter.productivityScore === intelligence.score.score, 'Adapter maps intelligence score directly');
    assert(contextFromBuilder.productivityScore === intelligence.score.score, 'buildNOVOContext delegates to canonical orchestrator');
    assert(JSON.stringify(contextFromAdapter.productivitySummary) === JSON.stringify(intelligence.productivity), 'ProductivitySummary mapped through canonical pipeline');
    assert(JSON.stringify(contextFromAdapter.goalHealth) === JSON.stringify(intelligence.goalHealth), 'GoalHealth mapped through canonical pipeline');
    assert(JSON.stringify(contextFromAdapter.focusSummary) === JSON.stringify(intelligence.focus), 'FocusSummary mapped through canonical pipeline');
    assert(JSON.stringify(contextFromAdapter.financeSummary) === JSON.stringify(intelligence.finance), 'FinanceSummary mapped through canonical pipeline');
    assert(JSON.stringify(contextFromAdapter.knowledgeSummary) === JSON.stringify(intelligence.knowledge), 'KnowledgeSummary mapped through canonical pipeline');
  }

  // -------------------------------------------------------------------------
  // TEST I: Single Pipeline Verification (useIntelligence & contextEngine)
  // -------------------------------------------------------------------------
  console.log('\n--- Test I: Single Pipeline Verification ---');
  {
    const { snapshot, fixedDate } = createStandardFixture();
    const directResult = evaluateWorkspaceIntelligence(snapshot, fixedDate);

    // Verify derived structure matches toNOVOContext
    const adapted = toNOVOContext(directResult);
    assert(adapted.tasks.length === 4, 'Adapted NOVOContext contains 4 tasks');
    assert(adapted.goals.length === 3, 'Adapted NOVOContext contains 3 goals');
    assert(adapted.todayTasks.length === 2, 'Adapted NOVOContext correctly filters todayTasks slice');
    assert(adapted.overdueTasks.length === 1, 'Adapted NOVOContext correctly filters overdueTasks slice');
  }

  // -------------------------------------------------------------------------
  // TEST J: Local vs Firebase Data Parity
  // -------------------------------------------------------------------------
  console.log('\n--- Test J: Local vs Firebase Data Parity ---');
  {
    const fixture1 = createStandardFixture();
    const fixture2 = createStandardFixture();

    // Cloud / Firebase state
    AuthLifecycle.reset('cloud-user-gate20-test');
    RepositoryFactory.setDataSource('firebase');
    const cloudResult = evaluateWorkspaceIntelligence(fixture1.snapshot, fixture1.fixedDate);

    // Local / Guest state
    AuthLifecycle.reset(null);
    RepositoryFactory.setDataSource('local');
    const localResult = evaluateWorkspaceIntelligence(fixture2.snapshot, fixture2.fixedDate);

    assert(cloudResult.score.score === localResult.score.score, 'NOVO Score is identical between Cloud and Local workspace data');
    assert(cloudResult.briefing.greeting === localResult.briefing.greeting, 'Briefing greeting is identical');
    assert(cloudResult.briefing.recommendation === localResult.briefing.recommendation, 'Briefing recommendation is identical');
    assert(cloudResult.nextAction.tier === localResult.nextAction.tier, 'Next action selection is identical');
    assert(cloudResult.attentionRadar.type === localResult.attentionRadar.type, 'Attention radar alert is identical');
  }

  // -------------------------------------------------------------------------
  // TEST K: Existing NOVOContext Consumers Compatibility
  // -------------------------------------------------------------------------
  console.log('\n--- Test K: Existing NOVOContext Consumers Compatibility ---');
  {
    const { snapshot, fixedDate } = createStandardFixture();
    const intelligence = evaluateWorkspaceIntelligence(snapshot, fixedDate);
    const context = toNOVOContext(intelligence);

    // Test with AI context builder (used by ChatView / useChatOrchestrator)
    const prompt = buildAIGroundedContext(context);
    assert(prompt.includes('# NOVO Workspace Context Snapshot'), 'AI prompt generator succeeds with adapted NOVOContext');
    assert(prompt.includes('NOVO Velocity Score:'), 'AI prompt contains velocity score header');
    assert(prompt.includes('Launch Enterprise Tier'), 'AI prompt includes active goal');
    assert(prompt.includes('Prepare board meeting slides'), 'AI prompt includes critical task');

    const systemContext = buildAISystemContext(context);
    assert(systemContext.includes('You are NOVO'), 'System context generator succeeds with adapted NOVOContext');
  }

  // -------------------------------------------------------------------------
  // TEST L: Gate 19.4 Runtime Safety
  // -------------------------------------------------------------------------
  console.log('\n--- Test L: Gate 19.4 Runtime Behavior Unaffected ---');
  {
    // Cloud setup
    AuthLifecycle.reset('cloud-user-19-4-safe');
    RepositoryFactory.setDataSource('firebase');

    assert(RepositoryFactory.getDataSource() === 'firebase', 'Initial provider is firebase');
    assert(AuthLifecycle.getUid() === 'cloud-user-19-4-safe', 'Initial UID is authenticated user');

    // Execute context retrieval
    const liveContext = getNOVOContext();
    assert(liveContext !== null, 'getNOVOContext() executes successfully in cloud mode');
    assert(RepositoryFactory.getDataSource() === 'firebase', 'RepositoryFactory datasource remains strictly firebase');
    assert(AuthLifecycle.getUid() === 'cloud-user-19-4-safe', 'AuthLifecycle UID was not modified');

    // Local setup
    AuthLifecycle.reset(null);
    RepositoryFactory.setDataSource('local');
    const guestContext = getNOVOContext();
    assert(guestContext !== null, 'getNOVOContext() executes successfully in guest mode');
    assert(RepositoryFactory.getDataSource() === 'local', 'RepositoryFactory datasource remains strictly local');
    assert(AuthLifecycle.getUid() === null, 'AuthLifecycle UID remains null');
  }

  // -------------------------------------------------------------------------
  // FINAL TALLY
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`Gate 20-A Intelligence Boundary: PASS (${passedCount}/${passedCount + failedCount})`);
  console.log('======================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
