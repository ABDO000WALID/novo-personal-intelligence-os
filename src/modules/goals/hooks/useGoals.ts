import { useState, useEffect, useCallback } from 'react';
import { Goal } from '../../../types/data';
import { STORAGE_KEYS } from '../../../core/storage/storageKeys';
import { storageService, INITIAL_SEEDS, NOVO_STORAGE_EVENT } from '../../../core/storage/storageService';

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>(() => {
    return storageService.getItem<Goal[]>(STORAGE_KEYS.GOALS, INITIAL_SEEDS.goals());
  });

  const syncGoals = useCallback((newGoals: Goal[]) => {
    setGoals(newGoals);
    storageService.setItem(STORAGE_KEYS.GOALS, newGoals);
  }, []);

  useEffect(() => {
    const handleStorageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string }>;
      if (customEvent.detail?.key === STORAGE_KEYS.GOALS) {
        const updated = storageService.getItem<Goal[]>(STORAGE_KEYS.GOALS, []);
        setGoals(updated);
      }
    };

    window.addEventListener(NOVO_STORAGE_EVENT, handleStorageUpdate);
    return () => {
      window.removeEventListener(NOVO_STORAGE_EVENT, handleStorageUpdate);
    };
  }, []);

  const createGoal = useCallback((title: string, description = '', progress = 0) => {
    const now = new Date().toISOString();
    const newGoal: Goal = {
      id: `goal-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: title.trim() || 'هدف جديد',
      description: description.trim(),
      progress: Math.min(100, Math.max(0, progress)),
      createdAt: now,
      updatedAt: now,
    };
    const updated = [newGoal, ...goals];
    syncGoals(updated);
    return newGoal;
  }, [goals, syncGoals]);

  const updateGoal = useCallback((id: string, updates: Partial<Pick<Goal, 'title' | 'description' | 'progress'>>) => {
    const now = new Date().toISOString();
    const updated = goals.map((g) => {
      if (g.id === id) {
        return {
          ...g,
          ...updates,
          progress: updates.progress !== undefined ? Math.min(100, Math.max(0, updates.progress)) : g.progress,
          updatedAt: now,
        };
      }
      return g;
    });
    syncGoals(updated);
  }, [goals, syncGoals]);

  const updateProgress = useCallback((id: string, progress: number) => {
    updateGoal(id, { progress });
  }, [updateGoal]);

  const deleteGoal = useCallback((id: string) => {
    const updated = goals.filter((g) => g.id !== id);
    syncGoals(updated);
  }, [goals, syncGoals]);

  return {
    goals,
    createGoal,
    updateGoal,
    updateProgress,
    deleteGoal,
  };
}
