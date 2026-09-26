import { ActiveFocusState } from './types';

export function calculateDisplay(state: ActiveFocusState, nowMs: number = Date.now()): number {
  let currentPausedMs = state.totalPausedMs;
  if (state.status === 'paused' && state.lastPauseTimestamp) {
    currentPausedMs += (nowMs - new Date(state.lastPauseTimestamp).getTime());
  }
  const elapsedMs = (nowMs - new Date(state.startedAt).getTime()) - currentPausedMs;
  const elapsedSecs = Math.max(0, Math.floor(elapsedMs / 1000));
  if (state.mode === 'stopwatch') {
    return elapsedSecs;
  } else {
    return Math.max(0, state.durationSeconds - elapsedSecs);
  }
}

export function calculateCompletion(state: ActiveFocusState, nowMs: number = Date.now()) {
  let endPausedMs = state.totalPausedMs;
  if (state.status === 'paused' && state.lastPauseTimestamp) {
    endPausedMs += (nowMs - new Date(state.lastPauseTimestamp).getTime());
  }
  const actualElapsedMs = (nowMs - new Date(state.startedAt).getTime()) - endPausedMs;
  const actualDurationSeconds = Math.max(0, Math.floor(actualElapsedMs / 1000));
  return { actualDurationSeconds, endPausedMs };
}
