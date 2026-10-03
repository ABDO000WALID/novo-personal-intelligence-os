import { RouteId } from '../../types/navigation';
import { TaskPriority } from '../../types/data';
import { DailyBriefing } from '../intelligence/briefingEngine';
import { NextActionResult } from '../intelligence/nextActionEngine';
import { AttentionRadarResult } from '../intelligence/attentionEngine';
import { GoalPacingAnalysis } from '../intelligence/goalVelocityEngine';

export type CommandActionType =
  | 'navigate'
  | 'system'
  | 'create_task'
  | 'create_goal'
  | 'update_goal_progress'
  | 'align_day'
  | 'daily_briefing'
  | 'next_action'
  | 'attention_radar'
  | 'goal_pacing'
  | 'unknown';

export interface GoalPacingCommandPayload {
  mode: 'portfolio' | 'single';
  targetGoalQuery?: string;
  matchedGoalId?: string;
  matchedGoalTitle?: string;
  status: 'success' | 'no_goals' | 'not_found' | 'ambiguous';
  ambiguousMatches?: string[];
  analyses: GoalPacingAnalysis[];
  aiEnriched?: boolean;
}

export interface AttentionRadarCommandPayload {
  radarResult: AttentionRadarResult;
  selectedTaskId?: string;
  selectedTaskTitle?: string;
  selectedGoalId?: string;
  selectedGoalTitle?: string;
  suggestedTaskTitle?: string;
  insightAr?: string;
  insightEn?: string;
  aiEnriched?: boolean;
  reasoning?: string;
}

export interface NextActionCommandPayload {
  nextActionResult: NextActionResult;
  selectedTaskId?: string;
  selectedTaskTitle?: string;
  selectedGoalId?: string;
  selectedGoalTitle?: string;
  suggestedTaskTitle?: string;
  rationaleAr?: string;
  rationaleEn?: string;
  aiEnriched?: boolean;
  reasoning?: string;
}

export interface DailyBriefingCommandPayload {
  briefing: DailyBriefing;
  selectedGoalId?: string;
  selectedGoalTitle?: string;
  suggestedTaskTitle?: string;
  hasUnattendedGoals: boolean;
  activeGoalCount: number;
  aiEnriched?: boolean;
  reasoning?: string;
}

export interface AlignDayCommandPayload {
  selectedGoalId?: string;
  selectedGoalTitle?: string;
  suggestedTaskTitle?: string;
  hasUnattendedGoals: boolean;
  activeGoalCount: number;
  aiEnriched?: boolean;
  reasoning?: string;
}

export interface CreateTaskCommandPayload {
  title: string;
  priority: TaskPriority;
  date: string;
  goalId?: string;
  goalTitle?: string;
  rawGoalReference?: string;
}

export interface TaskActionProposal {
  id: string;
  originatingMessageId?: string;
  source?: 'align_day' | 'create_task' | 'daily_briefing' | 'next_action' | 'attention_radar' | string;
  requiresGoal?: boolean;
  title: string;
  priority: TaskPriority;
  date: string;
  goalId?: string;
  goalTitle?: string;
  reasoning?: string;
  aiEnriched?: boolean;
  status: 'pending' | 'confirmed' | 'cancelled';
}

export interface CreateGoalCommandPayload {
  title: string;
  description?: string;
  initialProgress?: number;
}

export interface GoalActionProposal {
  id: string;
  originatingMessageId?: string;
  title: string;
  description?: string;
  initialProgress?: number;
  status: 'pending' | 'confirmed' | 'cancelled';
}

export interface UpdateGoalProgressCommandPayload {
  goalId: string;
  goalTitle: string;
  currentProgress: number;
  newProgress: number;
  rawGoalReference?: string;
}

export interface GoalProgressActionProposal {
  id: string;
  originatingMessageId?: string;
  goalId: string;
  goalTitle: string;
  currentProgress: number;
  newProgress: number;
  status: 'pending' | 'confirmed' | 'cancelled';
}

export interface NOVOCommand {
  rawInput: string;
  action: CommandActionType;
  targetRoute?: RouteId;
  taskPayload?: CreateTaskCommandPayload;
  goalPayload?: CreateGoalCommandPayload;
  goalProgressPayload?: UpdateGoalProgressCommandPayload;
  alignDayPayload?: AlignDayCommandPayload;
  dailyBriefingPayload?: DailyBriefingCommandPayload;
  nextActionPayload?: NextActionCommandPayload;
  attentionRadarPayload?: AttentionRadarCommandPayload;
  goalPacingPayload?: GoalPacingCommandPayload;
  actionPayload?: Record<string, unknown>;
  confidence: number; // 0.0 to 1.0
  feedbackAr: string;
  feedbackEn: string;
}

export interface CommandParseResult {
  isCommand: boolean;
  command?: NOVOCommand;
}

