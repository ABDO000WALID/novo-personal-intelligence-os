import { AuthLifecycle } from '../auth/authLifecycle';
import { create } from 'zustand';
import { Goal } from '../../types/data';
import { RepositoryFactory } from '../data/RepositoryFactory';

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface GoalState {
  goals: Goal[];
  status: StoreStatus;
  error: string | null;
  lastUpdated: number;
  initialize: () => Promise<void>;
  createGoal: (title: string, description?: string, progress?: number) => Promise<Goal>;
  updateGoal: (id: string, updates: Partial<Pick<Goal, 'title' | 'description' | 'progress'>>) => Promise<void>;
  updateProgress: (id: string, progress: number) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  clearState: () => void;
}

export const useGoalStore = create<GoalState>((set, get) => ({
  goals: [],
  status: 'idle',
  error: null,
  lastUpdated: 0,
  clearState: () => {
    set({
      goals: [],
      status: 'idle',
      error: null,
      lastUpdated: Date.now()
    });
  },

  initialize: async () => {
    const authGuard = AuthLifecycle.createGuard();
    if (get().status !== 'idle' && get().status !== 'error') return;
    try {
      set({ status: 'loading' });
      const goals = await RepositoryFactory.getGoalRepository().getAll();
      if (authGuard.isStale()) return;
      set({ goals, status: 'ready', error: null, lastUpdated: Date.now() });
    } catch (err: any) {
      if (authGuard.isStale()) return;
      set({ status: 'error', error: err.message || 'Failed to initialize goals' });
    }
  },

  createGoal: async (title: string, description: string = '', progress: number = 0) => {
    const authGuard = AuthLifecycle.createGuard();
    const now = new Date().toISOString();
    const newGoal: Goal = {
      id: `goal-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: title.trim() || 'هدف جديد',
      description: description.trim(),
      progress: Math.min(100, Math.max(0, progress)),
      createdAt: now,
      updatedAt: now,
    };
    
    if (authGuard.isStale()) return;
      set((state) => ({ goals: [newGoal, ...state.goals], lastUpdated: Date.now() }));
    
    try {
      await RepositoryFactory.getGoalRepository().create(newGoal);
      return newGoal;
    } catch (err: any) {
      console.error('[GoalStore] Failed to persist goal. Rolling back optimistic state.', err);
      if (authGuard.isStale()) return;
      set((state) => ({ 
        goals: state.goals.filter(g => g.id !== newGoal.id),
        error: err.message || 'Failed to create goal',
        lastUpdated: Date.now()
      }));
      throw err;
    }
  },

  updateGoal: async (id: string, updates: Partial<Pick<Goal, 'title' | 'description' | 'progress'>>) => {
    const authGuard = AuthLifecycle.createGuard();
    const originalGoal = get().goals.find(g => g.id === id);
    if (!originalGoal) {
      const err = new Error(`Goal ${id} not found in state`);
      set({ error: err.message });
      throw err;
    }

    const now = new Date().toISOString();
    const cleanUpdates = {
      ...updates,
      progress: updates.progress !== undefined ? Math.min(100, Math.max(0, updates.progress)) : originalGoal.progress,
      updatedAt: now,
    };
    
    const updatedGoal = { ...originalGoal, ...cleanUpdates };

    if (authGuard.isStale()) return;
      set((state) => ({
      goals: state.goals.map((g) => (g.id === id ? updatedGoal : g)),
      lastUpdated: Date.now()
    }));

    try {
      await RepositoryFactory.getGoalRepository().update(id, cleanUpdates);
    } catch (err: any) {
      console.error('[GoalStore] Failed to persist updated goal.', err);
      if (authGuard.isStale()) return;
      set((state) => {
        const currentGoal = state.goals.find(g => g.id === id);
        if (currentGoal === updatedGoal) {
            return {
              goals: state.goals.map((g) => (g.id === id ? originalGoal : g)),
              error: err.message || 'Failed to update goal',
              lastUpdated: Date.now()
            };
        }
        return { error: err.message || 'Failed to update goal' };
      });
      throw err;
    }
  },

  updateProgress: async (id: string, progress: number) => {
    const authGuard = AuthLifecycle.createGuard();
    await get().updateGoal(id, { progress });
  },

  deleteGoal: async (id: string) => {
    const authGuard = AuthLifecycle.createGuard();
    const goals = get().goals;
    const originalIndex = goals.findIndex(g => g.id === id);
    if (originalIndex === -1) {
      return; 
    }
    const originalGoal = goals[originalIndex];

    if (authGuard.isStale()) return;
      set((state) => ({
      goals: state.goals.filter((g) => g.id !== id),
      lastUpdated: Date.now()
    }));

    try {
      await RepositoryFactory.getGoalRepository().delete(id);
    } catch (err: any) {
      console.error('[GoalStore] Failed to persist deleted goal.', err);
      if (authGuard.isStale()) return;
      set((state) => {
        if (!state.goals.find(g => g.id === id)) {
           const newGoals = [...state.goals];
           if (originalIndex >= 0 && originalIndex <= newGoals.length) {
             newGoals.splice(originalIndex, 0, originalGoal);
           } else {
             newGoals.push(originalGoal);
           }
           return {
             goals: newGoals,
             error: err.message || 'Failed to delete goal',
             lastUpdated: Date.now()
           };
        }
        return { error: err.message || 'Failed to delete goal' };
      });
      throw err;
    }
  }
}));
