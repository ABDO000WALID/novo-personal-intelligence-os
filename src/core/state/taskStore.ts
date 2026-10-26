import { AuthLifecycle } from '../auth/authLifecycle';
import { create } from 'zustand';
import { Task, TaskPriority } from '../../types/data';
import { RepositoryFactory } from '../data/RepositoryFactory';

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface TaskState {
  tasks: Task[];
  status: StoreStatus;
  error: string | null;
  lastUpdated: number;
  initialize: () => Promise<void>;
  createTask: (title: string, priority?: TaskPriority, date?: string, goalId?: string) => Promise<Task>;
  updateTask: (id: string, updates: Partial<Pick<Task, 'title' | 'priority' | 'date' | 'completed' | 'goalId'>>) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  // GATE 27: Idempotent completion intent
  completeTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  clearState: () => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  status: 'idle',
  error: null,
  lastUpdated: 0,
  clearState: () => {
    set({
      tasks: [],
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
      const repo = RepositoryFactory.getTaskRepository();
      const tasks = await repo.getAll();
      if (authGuard.isStale()) return;
      set({ tasks, status: 'ready', error: null, lastUpdated: Date.now() });
    } catch (err: any) {
      console.error('[TaskStore] Initialization failed:', err);
      if (authGuard.isStale()) return;
      set({ status: 'error', error: err.message || 'Failed to initialize tasks', lastUpdated: Date.now() });
    }
  },

  createTask: async (title: string, priority: TaskPriority = 'medium', date?: string, goalId?: string) => {
    const authGuard = AuthLifecycle.createGuard();
    const now = new Date();
    const taskDate = date || now.toISOString().split('T')[0];
    
    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: title.trim() || 'مهمة جديدة',
      date: taskDate,
      completed: false,
      priority,
      ...(goalId ? { goalId } : {}),
      createdAt: now.toISOString(),
    };

    if (authGuard.isStale()) return;
      set((state) => ({
      tasks: [newTask, ...state.tasks],
      lastUpdated: Date.now(),
      error: null
    }));

    try {
      await RepositoryFactory.getTaskRepository().create(newTask);
      return newTask;
    } catch (err: any) {
      console.error('[TaskStore] Failed to persist task. Rolling back optimistic state.', err);
      if (authGuard.isStale()) return;
      set((state) => ({
        tasks: state.tasks.filter(t => t.id !== newTask.id),
        error: err.message || 'Failed to create task',
        lastUpdated: Date.now()
      }));
      throw err;
    }
  },

  updateTask: async (id: string, updates: Partial<Pick<Task, 'title' | 'priority' | 'date' | 'completed' | 'goalId'>>) => {
    const authGuard = AuthLifecycle.createGuard();
    const originalTask = get().tasks.find(t => t.id === id);
    if (!originalTask) {
      const err = new Error(`Task ${id} not found in state`);
      set({ error: err.message, lastUpdated: Date.now() });
      throw err;
    }

    const updatedTask = { ...originalTask, ...updates };

    if (authGuard.isStale()) return;
      set((state) => ({
      tasks: state.tasks.map(t => (t.id === id ? updatedTask : t)),
      lastUpdated: Date.now(),
      error: null
    }));

    try {
      await RepositoryFactory.getTaskRepository().update(id, updates);
    } catch (err: any) {
      console.error('[TaskStore] Failed to persist updated task.', err);
      if (authGuard.isStale()) return;
      set((state) => {
        const currentTask = state.tasks.find(t => t.id === id);
        if (currentTask === updatedTask) {
          return {
            tasks: state.tasks.map(t => (t.id === id ? originalTask : t)),
            error: err.message || 'Failed to update task',
            lastUpdated: Date.now()
          };
        }
        return { error: err.message || 'Failed to update task', lastUpdated: Date.now() };
      });
      throw err;
    }
  },

  toggleTask: async (id: string) => {
    const authGuard = AuthLifecycle.createGuard();
    const task = get().tasks.find(t => t.id === id);
    if (!task) return;
    await get().updateTask(id, { completed: !task.completed });
  },

  // GATE 27: Idempotent completion intent
  completeTask: async (id: string) => {
    const authGuard = AuthLifecycle.createGuard();
    const task = get().tasks.find(t => t.id === id);
    // Intent Enforcement: Do nothing if task doesn't exist or is already completed
    if (!task || task.completed) return;
    await get().updateTask(id, { completed: true });
  },

  deleteTask: async (id: string) => {
    const authGuard = AuthLifecycle.createGuard();
    const tasks = get().tasks;
    const originalIndex = tasks.findIndex(t => t.id === id);
    if (originalIndex === -1) return;
    
    const originalTask = tasks[originalIndex];

    if (authGuard.isStale()) return;
      set((state) => ({
      tasks: state.tasks.filter(t => t.id !== id),
      lastUpdated: Date.now(),
      error: null
    }));

    try {
      await RepositoryFactory.getTaskRepository().delete(id);
    } catch (err: any) {
      console.error('[TaskStore] Failed to persist deleted task.', err);
      if (authGuard.isStale()) return;
      set((state) => {
        if (!state.tasks.find(t => t.id === id)) {
          const newTasks = [...state.tasks];
          if (originalIndex >= 0 && originalIndex <= newTasks.length) {
            newTasks.splice(originalIndex, 0, originalTask);
          } else {
            newTasks.push(originalTask);
          }
          return {
            tasks: newTasks,
            error: err.message || 'Failed to delete task',
            lastUpdated: Date.now()
          };
        }
        return { error: err.message || 'Failed to delete task', lastUpdated: Date.now() };
      });
      throw err;
    }
  }
}));