import { useState, useEffect, useCallback } from 'react';
import { Task, TaskPriority } from '../../../types/data';
import { STORAGE_KEYS } from '../../../core/storage/storageKeys';
import { storageService, INITIAL_SEEDS, NOVO_STORAGE_EVENT } from '../../../core/storage/storageService';

export function usePlanner() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    return storageService.getItem<Task[]>(STORAGE_KEYS.TASKS, INITIAL_SEEDS.tasks());
  });

  const syncTasks = useCallback((newTasks: Task[]) => {
    setTasks(newTasks);
    storageService.setItem(STORAGE_KEYS.TASKS, newTasks);
  }, []);

  useEffect(() => {
    const handleStorageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string }>;
      if (customEvent.detail?.key === STORAGE_KEYS.TASKS) {
        const updated = storageService.getItem<Task[]>(STORAGE_KEYS.TASKS, []);
        setTasks(updated);
      }
    };

    window.addEventListener(NOVO_STORAGE_EVENT, handleStorageUpdate);
    return () => {
      window.removeEventListener(NOVO_STORAGE_EVENT, handleStorageUpdate);
    };
  }, []);

  const createTask = useCallback((title: string, priority: TaskPriority = 'medium', date?: string) => {
    const now = new Date();
    const taskDate = date || now.toISOString().split('T')[0];
    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: title.trim() || 'مهمة جديدة',
      date: taskDate,
      completed: false,
      priority,
      createdAt: now.toISOString(),
    };
    const updated = [newTask, ...tasks];
    syncTasks(updated);
    return newTask;
  }, [tasks, syncTasks]);

  const toggleTask = useCallback((id: string) => {
    const updated = tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
    syncTasks(updated);
  }, [tasks, syncTasks]);

  const deleteTask = useCallback((id: string) => {
    const updated = tasks.filter((t) => t.id !== id);
    syncTasks(updated);
  }, [tasks, syncTasks]);

  const updateTask = useCallback((id: string, updates: Partial<Pick<Task, 'title' | 'priority' | 'date' | 'completed'>>) => {
    const updated = tasks.map((t) => (t.id === id ? { ...t, ...updates } : t));
    syncTasks(updated);
  }, [tasks, syncTasks]);

  return {
    tasks,
    createTask,
    toggleTask,
    deleteTask,
    updateTask,
  };
}
