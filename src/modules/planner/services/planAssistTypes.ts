import { Task, Goal } from '../../../types/data';

export type PlanAssistSuggestion =
  | {
      type: 'new_task';
      title: string;
      priority: 'low' | 'medium' | 'high';
      reason: string;
      goalId?: string;
    }
  | {
      type: 'priority_change';
      taskId: string;
      priority: 'low' | 'medium' | 'high';
      reason: string;
    };

export interface PlanAssistResult {
  summary: string;
  suggestions: PlanAssistSuggestion[];
}

export interface PlanAssistPlanningContext {
  selectedDate: string; // YYYY-MM-DD (authoritative planner date)
  existingTasks: Task[];
  activeGoals?: Goal[];
  focusMinutes?: number;
  language?: 'ar' | 'en';
}

export type PlanAssistErrorCode =
  | 'ABORTED'
  | 'MALFORMED_OUTPUT'
  | 'EMPTY_OUTPUT'
  | 'API_ERROR'
  | 'TIMEOUT';

export interface PlanAssistError {
  code: PlanAssistErrorCode;
  message: string;
  messageAr?: string;
  isAborted: boolean;
  rawError?: unknown;
}

export type PlanAssistResponse =
  | {
      success: true;
      data: PlanAssistResult;
    }
  | {
      success: false;
      error: PlanAssistError;
    };

export interface ParsePlanAssistOptions {
  strict?: boolean; // If true, fails entire parse if any suggestion is invalid
  availableGoals?: Array<{ id: string }> | Goal[];
}
