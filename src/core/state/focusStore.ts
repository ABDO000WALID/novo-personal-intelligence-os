import { AuthLifecycle } from '../auth/authLifecycle';
import { create } from 'zustand';
import { FocusSession } from '../../types/data';
import { ActiveFocusState, FocusMode } from '../../modules/focus/domain/types';
import { RepositoryFactory } from '../data/RepositoryFactory';
import { calculateDisplay, calculateCompletion } from '../../modules/focus/domain/focusEngine';

interface FocusState {
  sessions: FocusSession[];
  activeState: ActiveFocusState | null;
  displaySeconds: number;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  lastUpdated: string | null;
  initialize: () => Promise<void>;
  startSession: (mode: FocusMode, durationSeconds?: number) => Promise<void>;
  pauseTimer: () => Promise<void>;
  resumeTimer: () => Promise<void>;
  finishSession: () => Promise<void>;
  cancelSession: () => Promise<void>;
  clearSessions: () => Promise<void>;
  clearState: () => void;
  _tick: () => void;
}

let globalFocusInterval: ReturnType<typeof setInterval> | null = null;

const startGlobalFocusInterval = (tick: () => void) => {
  if (globalFocusInterval) {
    clearInterval(globalFocusInterval);
  }
  globalFocusInterval = setInterval(tick, 500);
};

const stopGlobalFocusInterval = () => {
  if (globalFocusInterval) {
    clearInterval(globalFocusInterval);
    globalFocusInterval = null;
  }
};

let initializationPromise: Promise<void> | null = null;

export const useFocusStore = create<FocusState>((set, get) => ({
  sessions: [],
  activeState: null,
  displaySeconds: 0,
  status: 'idle',
  error: null,
  lastUpdated: null,
  clearState: () => {
    stopGlobalFocusInterval();
    initializationPromise = null;
    set({
      sessions: [],
      activeState: null,
      displaySeconds: 0,
      status: 'idle',
      error: null,
      lastUpdated: null,
    });
  },
  
  initialize: async () => {
    const authGuard = AuthLifecycle.createGuard();
    if (get().status === 'ready') return;
    if (initializationPromise) return initializationPromise;

    set({ status: 'loading', error: null });

    initializationPromise = (async () => {
      try {
        const repo = RepositoryFactory.getFocusRepository();
        const sessions = await repo.getSessions();
        const activeState = await repo.getActiveState();
        
        let displaySeconds = 0;
        if (activeState) {
          displaySeconds = calculateDisplay(activeState);
        }
        
        if (authGuard.isStale()) return;
        set({
          sessions,
          activeState,
          displaySeconds,
          status: 'ready',
          error: null,
          lastUpdated: new Date().toISOString(),
        });
        
        if (activeState && activeState.status === 'running') {
          startGlobalFocusInterval(get()._tick);
        } else {
          stopGlobalFocusInterval();
        }
      } catch (err) {
        if (authGuard.isStale()) return;
        set({ error: (err as Error).message, status: 'error' });
        throw err;
      } finally {
        initializationPromise = null;
      }
    })();
    return initializationPromise;
  },

  startSession: async (mode: FocusMode, durationSeconds: number = 0) => {
    const authGuard = AuthLifecycle.createGuard();
    const newState: ActiveFocusState = {
      mode,
      status: 'running',
      startedAt: new Date().toISOString(),
      durationSeconds,
      totalPausedMs: 0,
      lastPauseTimestamp: null,
    };
    
    const previousState = get().activeState;
    const previousDisplay = get().displaySeconds;

    if (authGuard.isStale()) return;
      set({
        activeState: newState,
      displaySeconds: calculateDisplay(newState),
    });
    startGlobalFocusInterval(get()._tick);

    try {
      await RepositoryFactory.getFocusRepository().saveActiveState(newState);
    } catch (err) {
      console.error('[FocusStore] Failed to persist start session', err);
      // Rollback
      if (authGuard.isStale()) return;
      set({
        activeState: previousState,
        displaySeconds: previousDisplay
      });
      if (!previousState || previousState.status !== 'running') {
        stopGlobalFocusInterval();
      }
      throw err;
    }
  },

  pauseTimer: async () => {
    const authGuard = AuthLifecycle.createGuard();
    const activeState = get().activeState;
    if (!activeState || activeState.status === 'paused') return;
    
    const newState: ActiveFocusState = {
      ...activeState,
      status: 'paused',
      lastPauseTimestamp: new Date().toISOString(),
    };
    
    const previousState = activeState;
    const previousDisplay = get().displaySeconds;

    if (authGuard.isStale()) return;
      set({
        activeState: newState,
      displaySeconds: calculateDisplay(newState),
    });
    stopGlobalFocusInterval();

    try {
      await RepositoryFactory.getFocusRepository().saveActiveState(newState);
    } catch (err) {
      console.error('[FocusStore] Failed to persist pause timer', err);
      // Rollback
      if (authGuard.isStale()) return;
      set({
        activeState: previousState,
        displaySeconds: previousDisplay
      });
      startGlobalFocusInterval(get()._tick);
      throw err;
    }
  },

  resumeTimer: async () => {
    const authGuard = AuthLifecycle.createGuard();
    const activeState = get().activeState;
    if (!activeState || activeState.status === 'running') return;
    
    const pauseDuration = activeState.lastPauseTimestamp
      ? (Date.now() - new Date(activeState.lastPauseTimestamp).getTime())
      : 0;
      
    const newState: ActiveFocusState = {
      ...activeState,
      status: 'running',
      totalPausedMs: activeState.totalPausedMs + pauseDuration,
      lastPauseTimestamp: null,
    };
    
    const previousState = activeState;
    const previousDisplay = get().displaySeconds;

    if (authGuard.isStale()) return;
      set({
        activeState: newState,
      displaySeconds: calculateDisplay(newState),
    });
    startGlobalFocusInterval(get()._tick);

    try {
      await RepositoryFactory.getFocusRepository().saveActiveState(newState);
    } catch (err) {
      console.error('[FocusStore] Failed to persist resume timer', err);
      // Rollback
      if (authGuard.isStale()) return;
      set({
        activeState: previousState,
        displaySeconds: previousDisplay
      });
      stopGlobalFocusInterval();
      throw err;
    }
  },

  finishSession: async () => {
    const authGuard = AuthLifecycle.createGuard();
    const activeState = get().activeState;
    if (!activeState) return;
    
    const previousState = activeState;
    const previousDisplay = get().displaySeconds;

    stopGlobalFocusInterval();
    
    const { actualDurationSeconds, endPausedMs } = calculateCompletion(activeState);
    const newSession: FocusSession = {
      id: `focus-${new Date(activeState.startedAt || new Date().toISOString()).getTime()}`,
      duration: Math.round(actualDurationSeconds / 60) || 1,
      completedAt: new Date().toISOString(),
      mode: activeState.mode,
      actualDurationSeconds,
      startedAt: activeState.startedAt,
      pausedDurationSeconds: Math.floor(endPausedMs / 1000),
    };
    
    set({
      sessions: [newSession, ...get().sessions],
      activeState: null,
      displaySeconds: 0,
    });

    try {
      const repo = RepositoryFactory.getFocusRepository();
      await repo.create(newSession);
      await repo.removeActiveState();
    } catch (err) {
      console.error('[FocusStore] Failed to persist finish session', err);
      // Rollback
      if (authGuard.isStale()) return;
      set(state => ({
        sessions: state.sessions.filter(s => s.id !== newSession.id),
        activeState: previousState,
        displaySeconds: previousDisplay,
      }));
      if (previousState.status === 'running') {
        startGlobalFocusInterval(get()._tick);
      }
      throw err;
    }
  },

  cancelSession: async () => {
    const authGuard = AuthLifecycle.createGuard();
    const previousState = get().activeState;
    if (!previousState) return;
    
    const previousDisplay = get().displaySeconds;

    stopGlobalFocusInterval();
    
    if (authGuard.isStale()) return;
      set({
        activeState: null,
      displaySeconds: 0,
    });

    try {
      await RepositoryFactory.getFocusRepository().removeActiveState();
    } catch (err) {
      console.error('[FocusStore] Failed to persist cancel session', err);
      // Rollback
      if (authGuard.isStale()) return;
      set({
        activeState: previousState,
        displaySeconds: previousDisplay
      });
      if (previousState.status === 'running') {
        startGlobalFocusInterval(get()._tick);
      }
      throw err;
    }
  },

  clearSessions: async () => {
    const authGuard = AuthLifecycle.createGuard();
    const previousSessions = get().sessions;
    
    set({ sessions: [] });

    try {
      await RepositoryFactory.getFocusRepository().saveSessions([]);
    } catch (err) {
      console.error('[FocusStore] Failed to persist clear sessions', err);
      if (authGuard.isStale()) return;
      set({ sessions: previousSessions });
      throw err;
    }
  },

  _tick: () => {
    const authGuard = AuthLifecycle.createGuard();
    const activeState = get().activeState;
    if (!activeState || activeState.status !== 'running') {
      stopGlobalFocusInterval();
      return;
    }
    
    if (authGuard.isStale()) {
      stopGlobalFocusInterval();
      return;
    }
    
    const currentDisplay = calculateDisplay(activeState);
    
    if (activeState.mode !== 'stopwatch' && currentDisplay <= 0) {
      // Intentionally not awaiting inside the tick
      get().finishSession();
      return;
    }
    
    // Only update state if it changed to avoid useless renders
    if (get().displaySeconds !== currentDisplay) {
      set({ displaySeconds: currentDisplay });
    }
  }
}));
