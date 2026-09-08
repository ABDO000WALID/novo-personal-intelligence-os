import { RouteId } from '../../types/navigation';

export type CommandActionType = 'navigate' | 'system' | 'unknown';

export interface NOVOCommand {
  rawInput: string;
  action: CommandActionType;
  targetRoute?: RouteId;
  actionPayload?: Record<string, unknown>;
  confidence: number; // 0.0 to 1.0
  feedbackAr: string;
  feedbackEn: string;
}

export interface CommandParseResult {
  isCommand: boolean;
  command?: NOVOCommand;
}
