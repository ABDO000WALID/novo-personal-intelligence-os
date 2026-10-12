/**
 * Novo Gate 19.3B - Migration Types & Ownership Definitions
 * 
 * Defines strongly typed models for migration lifecycle, ownership fencing,
 * error codes, and canonical Firestore document paths.
 */

export type MigrationStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export type MigrationErrorCode =
  | 'LOCK_ACQUISITION_FAILED'
  | 'GENERATION_MISMATCH'
  | 'SESSION_MISMATCH'
  | 'RUN_ID_MISMATCH'
  | 'CONFLICT_PREEXISTING_CLOUD_DATA'
  | 'OVERSIZED_PAYLOAD'
  | 'VERIFICATION_FAILED'
  | 'AUTH_STALE'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface MigrationOwnership {
  /**
   * Ephemeral tab/browser session identifier (e.g., generated per session/window).
   */
  sessionId: string;

  /**
   * Unique migration run identifier (UUID per migration execution attempt).
   */
  migrationRunId: string;

  /**
   * Monotonically increasing fencing generation token.
   */
  generation: number;
}

export interface MigrationMarker extends Partial<MigrationOwnership> {
  status: MigrationStatus;
  version: number;
  startedAt: string;
  sessionId?: string;
  migrationRunId?: string;
  generation?: number;
  lastHeartbeatAt?: string;
  completedAt?: string;
  failedAt?: string;
  errorCode?: MigrationErrorCode | string;
  errorMessage?: string;
  itemCounts?: {
    tasks?: number;
    goals?: number;
    notes?: number;
    knowledge?: number;
    money?: number;
    focusSessions?: number;
    conversations?: number;
    activeFocus?: number;
    activeChat?: number;
    total?: number;
  };
}

/**
 * Canonical Firestore paths for all user-scoped collections and metadata documents.
 * Verified against firestore.rules and FirebaseAsyncRepository implementations.
 */
export const MIGRATION_PATHS = {
  marker: (uid: string) => `users/${uid}/metadata/migration`,
  tasks: (uid: string) => `users/${uid}/tasks`,
  goals: (uid: string) => `users/${uid}/goals`,
  notes: (uid: string) => `users/${uid}/notes`,
  knowledge: (uid: string) => `users/${uid}/knowledge`,
  money: (uid: string) => `users/${uid}/money`,
  focusSessions: (uid: string) => `users/${uid}/focus_sessions`,
  conversations: (uid: string) => `users/${uid}/conversations`,
  activeFocus: (uid: string) => `users/${uid}/active_state/focus`,
  activeChat: (uid: string) => `users/${uid}/active_state/chat`,
} as const;
