import { RouteId } from '../../types/navigation';
import { NOVOContext } from '../intelligence/intelligenceTypes';
import { NOVOCommand } from '../commands/commandTypes';

export type AIMessageRole = 'system' | 'user' | 'assistant';

export interface AIMessage {
  role: AIMessageRole;
  content: string;
  timestamp?: string;
}

export interface AIResponse {
  text: string;
  finishReason?: string;
  tokensUsed?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  raw?: unknown;
}

export interface AIStreamChunk {
  deltaText: string;
  isComplete: boolean;
}

export interface AIRequestOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
  history?: AIMessage[];
  abortSignal?: AbortSignal;
}

export type AIProviderType = 'gemini' | 'openai' | 'local_model' | 'offline_stub';

export type AIErrorCode =
  | 'NO_ACTIVE_PROVIDER'
  | 'PROVIDER_UNAVAILABLE'
  | 'REQUEST_FAILED'
  | 'INVALID_RESPONSE'
  | 'ABORTED'
  | 'UNKNOWN'
  | 'MODEL_NOT_AVAILABLE'
  | 'RATE_LIMITED'
  | 'AI_AUTH_ERROR'
  | 'AI_TIMEOUT'
  | 'NETWORK_ERROR'
  | 'rate_limit_exceeded'
  | 'authentication_failed'
  | 'context_window_exceeded'
  | 'network_error'
  | 'timeout';

export interface AIError {
  code: AIErrorCode;
  message: string;
  messageAr?: string;
  details?: unknown;
  retryable: boolean;
}

export type ChatExecutionState = 'idle' | 'parsing_command' | 'generating' | 'error';

export interface ChatOrchestrationRequest {
  message: string;
  context: NOVOContext;
  conversationHistory?: Array<{ role: string; content: string; createdAt?: string }>;
  language?: 'ar' | 'en';
  options?: AIRequestOptions;
}

export interface ChatOrchestrationResult {
  handledAsCommand: boolean;
  command?: NOVOCommand;
  commandTargetRoute?: RouteId;
  commandFeedback?: {
    ar: string;
    en: string;
  };
  aiResponse?: AIResponse;
  error?: AIError;
}
