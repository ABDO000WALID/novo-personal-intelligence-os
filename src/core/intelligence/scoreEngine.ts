import {
  ProductivitySummary,
  GoalHealthResult,
  FocusSummary,
  KnowledgeSummary,
} from './intelligenceTypes';

export interface ScoreBreakdown {
  tasks: number;     // max 35
  focus: number;     // max 20
  goals: number;     // max 25
  planning: number;  // max 10
  knowledge: number; // max 10
}

export interface NovoScore {
  score: number;
  label: string;
  labelAr: string;
  breakdown: ScoreBreakdown;
}

export interface ScoreInputState {
  productivity: ProductivitySummary;
  goals: GoalHealthResult;
  focus: FocusSummary;
  knowledge: KnowledgeSummary;
}

/**
 * Deterministic NOVO Workspace Score Engine
 * Evaluates holistic personal productivity on a calibrated 0–100 scale:
 * - Task Completion (35 pts)
 * - Focus Consistency (20 pts)
 * - Goal Progress (25 pts)
 * - Planning Activity (10 pts)
 * - Knowledge / Notes Activity (10 pts)
 */
export function calculateNovoScore(state: ScoreInputState): NovoScore {
  const { productivity, goals, focus, knowledge } = state;

  // 1. Task Completion (35 points max)
  let taskPoints = 0;
  if (productivity.totalTasks > 0) {
    const ratio = Math.min(1, productivity.completedTasks / productivity.totalTasks);
    taskPoints = Math.round(ratio * 35);
  }

  // 2. Focus Consistency (20 points max)
  let focusPoints = 0;
  const totalFocus = focus.todayFocusMinutes + (focus.weeklyFocusMinutes > focus.todayFocusMinutes ? focus.weeklyFocusMinutes - focus.todayFocusMinutes : 0);
  if (totalFocus >= 50 || focus.todayFocusMinutes >= 50) {
    focusPoints = 20;
  } else if (totalFocus >= 25 || focus.todayFocusMinutes >= 25) {
    focusPoints = 15;
  } else if (totalFocus >= 10 || focus.totalSessions > 0) {
    focusPoints = 10;
  } else if (totalFocus > 0) {
    focusPoints = 5;
  }

  // 3. Goal Progress (25 points max)
  let goalPoints = 0;
  if (goals.totalGoals > 0) {
    const progressRatio = Math.min(1, Math.max(0, goals.averageProgress / 100));
    goalPoints = Math.round(progressRatio * 25);
  }

  // 4. Planning Activity (10 points max)
  let planningPoints = 0;
  if (productivity.todayTasks > 0) {
    planningPoints = 10;
  } else if (productivity.totalTasks > 0) {
    planningPoints = 6;
  }

  // 5. Knowledge Activity (10 points max)
  let knowledgePoints = 0;
  const totalNotesAndKnowledge = knowledge.totalNotes + knowledge.totalKnowledgeItems;
  if (knowledge.recentlyCreatedNotes > 0 || knowledge.recentlyUpdatedNotes > 0) {
    knowledgePoints = 10;
  } else if (totalNotesAndKnowledge >= 3) {
    knowledgePoints = 8;
  } else if (totalNotesAndKnowledge > 0) {
    knowledgePoints = 5;
  }

  const rawScore = taskPoints + focusPoints + goalPoints + planningPoints + knowledgePoints;
  const score = Math.max(0, Math.min(100, rawScore));

  // Determine semantic label
  let label = 'Getting Started';
  let labelAr = 'البداية';

  if (score >= 80) {
    label = 'Excellent Consistency';
    labelAr = 'استمرارية ممتازة';
  } else if (score >= 60) {
    label = 'Strong Momentum';
    labelAr = 'زخم قوي';
  } else if (score >= 40) {
    label = 'Building Momentum';
    labelAr = 'بناء الزخم';
  }

  return {
    score,
    label,
    labelAr,
    breakdown: {
      tasks: taskPoints,
      focus: focusPoints,
      goals: goalPoints,
      planning: planningPoints,
      knowledge: knowledgePoints,
    },
  };
}
