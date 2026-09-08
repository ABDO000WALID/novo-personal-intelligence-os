import { useState, useEffect, useRef, useCallback } from 'react';
import { FocusSession } from '../../../types/data';
import { STORAGE_KEYS } from '../../../core/storage/storageKeys';
import { storageService, INITIAL_SEEDS, NOVO_STORAGE_EVENT } from '../../../core/storage/storageService';

export type FocusMode = 'preset' | 'custom' | 'stopwatch';

export interface ActiveFocusState {
  mode: FocusMode;
  status: 'running' | 'paused';
  startedAt: string;
  durationSeconds: number; // Target duration (0 for stopwatch)
  totalPausedMs: number;
  lastPauseTimestamp: string | null;
}

export function useFocus() {
  const [activeState, setActiveState] = useState<ActiveFocusState | null>(() => {
    return storageService.getItem<ActiveFocusState | null>('novo_active_focus', null);
  });
  
  // displaySeconds handles both countdown (timeLeft) and stopwatch (elapsed)
  const [displaySeconds, setDisplaySeconds] = useState(0);

  const [sessions, setSessions] = useState<FocusSession[]>(() => {
    return storageService.getItem<FocusSession[]>(
      STORAGE_KEYS.FOCUS_SESSIONS,
      INITIAL_SEEDS.focusSessions()
    );
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync sessions when updated externally
  useEffect(() => {
    const handleStorageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string }>;
      if (customEvent.detail?.key === STORAGE_KEYS.FOCUS_SESSIONS) {
        const updated = storageService.getItem<FocusSession[]>(STORAGE_KEYS.FOCUS_SESSIONS, []);
        setSessions(updated);
      }
    };
    window.addEventListener(NOVO_STORAGE_EVENT, handleStorageUpdate);
    return () => {
      window.removeEventListener(NOVO_STORAGE_EVENT, handleStorageUpdate);
    };
  }, []);

  // Save active state to storage whenever it changes so it survives reloads
  useEffect(() => {
    if (activeState) {
      storageService.setItem('novo_active_focus', activeState);
    } else {
      storageService.removeItem('novo_active_focus');
    }
  }, [activeState]);

  const completeSession = useCallback((finalState: ActiveFocusState) => {
    const now = Date.now();
    let endPausedMs = finalState.totalPausedMs;
    if (finalState.status === 'paused' && finalState.lastPauseTimestamp) {
      endPausedMs += (now - new Date(finalState.lastPauseTimestamp).getTime());
    }
    
    const actualElapsedMs = (now - new Date(finalState.startedAt).getTime()) - endPausedMs;
    const actualDurationSeconds = Math.max(0, Math.floor(actualElapsedMs / 1000));
    
    const newSession: FocusSession = {
      id: `focus-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      duration: Math.round(actualDurationSeconds / 60) || 1, // legacy support
      completedAt: new Date().toISOString(),
      mode: finalState.mode,
      actualDurationSeconds,
      startedAt: finalState.startedAt,
      pausedDurationSeconds: Math.floor(endPausedMs / 1000)
    };

    const updated = [newSession, ...sessions];
    setSessions(updated);
    storageService.setItem(STORAGE_KEYS.FOCUS_SESSIONS, updated);
  }, [sessions]);

  const clearSessions = useCallback(() => {
    setSessions([]);
    storageService.setItem(STORAGE_KEYS.FOCUS_SESSIONS, []);
  }, []);

  const calculateDisplay = useCallback((state: ActiveFocusState) => {
    const now = Date.now();
    let currentPausedMs = state.totalPausedMs;
    if (state.status === 'paused' && state.lastPauseTimestamp) {
      currentPausedMs += (now - new Date(state.lastPauseTimestamp).getTime());
    }
    
    const elapsedMs = (now - new Date(state.startedAt).getTime()) - currentPausedMs;
    const elapsedSecs = Math.max(0, Math.floor(elapsedMs / 1000));

    if (state.mode === 'stopwatch') {
      return elapsedSecs;
    } else {
      const remaining = Math.max(0, state.durationSeconds - elapsedSecs);
      return remaining;
    }
  }, []);

  // Main tick effect
  useEffect(() => {
    if (activeState) {
      // Immediate update
      setDisplaySeconds(calculateDisplay(activeState));
      
      if (activeState.status === 'running') {
        timerRef.current = setInterval(() => {
          const currentDisplay = calculateDisplay(activeState);
          setDisplaySeconds(currentDisplay);
          
          // Auto-finish for countdown modes if we hit 0
          if (activeState.mode !== 'stopwatch' && currentDisplay <= 0) {
            completeSession(activeState);
            setActiveState(null);
            setDisplaySeconds(0);
          }
        }, 500);
      }
    } else {
      setDisplaySeconds(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [activeState, calculateDisplay, completeSession]);

  const startSession = useCallback((mode: FocusMode, durationSeconds: number = 0) => {
    setActiveState({
      mode,
      status: 'running',
      startedAt: new Date().toISOString(),
      durationSeconds,
      totalPausedMs: 0,
      lastPauseTimestamp: null
    });
  }, []);

  const pauseTimer = useCallback(() => {
    setActiveState(prev => {
      if (!prev || prev.status === 'paused') return prev;
      return {
        ...prev,
        status: 'paused',
        lastPauseTimestamp: new Date().toISOString()
      };
    });
  }, []);

  const resumeTimer = useCallback(() => {
    setActiveState(prev => {
      if (!prev || prev.status === 'running') return prev;
      
      const pauseDuration = prev.lastPauseTimestamp 
        ? (Date.now() - new Date(prev.lastPauseTimestamp).getTime()) 
        : 0;
        
      return {
        ...prev,
        status: 'running',
        totalPausedMs: prev.totalPausedMs + pauseDuration,
        lastPauseTimestamp: null
      };
    });
  }, []);

  const finishSession = useCallback(() => {
    if (activeState) {
      completeSession(activeState);
      setActiveState(null);
    }
  }, [activeState, completeSession]);

  const cancelSession = useCallback(() => {
    setActiveState(null);
  }, []);

  return {
    activeState,
    displaySeconds,
    sessions,
    startSession,
    pauseTimer,
    resumeTimer,
    finishSession,
    cancelSession,
    clearSessions,
  };
}
