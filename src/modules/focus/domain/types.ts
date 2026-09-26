export type FocusMode = 'preset' | 'custom' | 'stopwatch';

export interface ActiveFocusState {
  mode: FocusMode;
  status: 'running' | 'paused';
  startedAt: string;
  durationSeconds: number; // Target duration (0 for stopwatch)
  totalPausedMs: number;
  lastPauseTimestamp: string | null;
}
