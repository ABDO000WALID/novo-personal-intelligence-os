import {
  ProductivitySummary,
  GoalHealthResult,
  FocusSummary,
  KnowledgeSummary,
} from './intelligenceTypes';
import { calculateNovoScore } from './scoreEngine';

/**
 * Backward-Compatibility Adapter for NOVO Score
 *
 * Forwards calls directly to the canonical scoreEngine.ts calculation.
 * All new code should consume calculateNovoScore from scoreEngine.ts.
 */
export function calculateProductivityScore(
  taskSummary: ProductivitySummary,
  focusSummary: FocusSummary,
  goalSummary: GoalHealthResult,
  knowledgeSummary: KnowledgeSummary
): number {
  const { score } = calculateNovoScore({
    productivity: taskSummary,
    goals: goalSummary,
    focus: focusSummary,
    knowledge: knowledgeSummary,
  });
  return score;
}
