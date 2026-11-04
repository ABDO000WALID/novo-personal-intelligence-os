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
  _unsubscribe: (() => void) | null;
  pendingMutations: number;
  deferredSnapshot: Task[] | null;
  initialize: (force?: boolean) => Promise<void>;
  createTask: (title: string, priority?: TaskPriority, date?: string, goalId?: string) => Promise<Task>;
  updateTask: (id: string, updates: Partial<Pick<Task, 'title' | 'priority' | 'date' | 'completed' | 'goalId'>>) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  clearState: () => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  status: 'idle',
  error: null,
  lastUpdated: 0,
  _unsubscribe: null,
  pendingMutations: 0,
  deferredSnapshot: null,

  clearState: () => {
    const { _unsubscribe } = get();
    if (_unsubscribe) {
      _unsubscribe();
    }
    set({
      tasks: [],
      status: 'idle',
      error: null,
      lastUpdated: Date.now(),
      _unsubscribe: null,
      pendingMutations: 0,
      deferredSnapshot: null
    });
  },

  initialize: async (force = false) => {
    const authGuard = AuthLifecycle.createGuard();
    // منع التهيئة المزدوجة اللي بتعمل الـ Bounce
    if (!force && (get().status === 'loading' || get().status === 'ready')) return;
    
    try {
      // شلنا السطر اللي كان بيعمل status: loading لو كان ready، عشان نحافظ على الـ UI ناعم
      if (get().status === 'idle') set({ status: 'loading' });
      const repo = RepositoryFactory.getTaskRepository();

      const currentUnsub = get()._unsubscribe;
      if (currentUnsub) currentUnsub();

      await new Promise<void>((resolve, reject) => {
        let isFirstSnapshot = true;

        const unsubscribe = repo.subscribe((incomingTasks) => {
          if (authGuard.isStale()) {
            unsubscribe();
            if (isFirstSnapshot) reject(new Error('Auth changed during initialization'));
            return;
          }

          if (get().pendingMutations > 0) {
            set({ deferredSnapshot: incomingTasks });
            if (isFirstSnapshot) {
              isFirstSnapshot = false;
              resolve();
            }
            return;
          }

          const currentTasks = get().tasks;
          const isIdentical = JSON.stringify(currentTasks) === JSON.stringify(incomingTasks);

          if (!isIdentical || isFirstSnapshot || force) {
            set({ tasks: incomingTasks, status: 'ready', error: null, lastUpdated: Date.now(), deferredSnapshot: null });
          }

          if (isFirstSnapshot) {
            isFirstSnapshot = false;
            resolve();
          }
        });

        set({ _unsubscribe: unsubscribe });
      });

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
      pendingMutations: state.pendingMutations + 1,
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
        lastUpdated: Date.now(),
        deferredSnapshot: null
      }));
      get().initialize(true).catch(console.error);
      throw err;
    } finally {
      if (!authGuard.isStale()) {
        set((state) => {
          const newCount = Math.max(0, state.pendingMutations - 1);
          const updates: Partial<TaskState> = { pendingMutations: newCount };
          if (newCount === 0 && state.deferredSnapshot) {
            if (JSON.stringify(state.tasks) !== JSON.stringify(state.deferredSnapshot)) {
              updates.tasks = state.deferredSnapshot;
              updates.lastUpdated = Date.now();
            }
            updates.deferredSnapshot = null;
          }
          return updates;
        });
      }
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
      pendingMutations: state.pendingMutations + 1,
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
        return {
          tasks: currentTask === updatedTask ? state.tasks.map(t => (t.id === id ? originalTask : t)) : state.tasks,
          error: err.message || 'Failed to update task',
          lastUpdated: Date.now(),
          deferredSnapshot: null
        };
      });
      get().initialize(true).catch(console.error);
      throw err;
    } finally {
      if (!authGuard.isStale()) {
        set((state) => {
          const newCount = Math.max(0, state.pendingMutations - 1);
          const patch: Partial<TaskState> = { pendingMutations: newCount };
          if (newCount === 0 && state.deferredSnapshot) {
            if (JSON.stringify(state.tasks) !== JSON.stringify(state.deferredSnapshot)) {
              patch.tasks = state.deferredSnapshot;
              patch.lastUpdated = Date.now();
            }
            patch.deferredSnapshot = null;
          }
          return patch;
        });
      }
    }
  },

  toggleTask: async (id: string) => {
    const authGuard = AuthLifecycle.createGuard();
    const task = get().tasks.find(t => t.id === id);
    if (!task) return;
    await get().updateTask(id, { completed: !task.completed });
  },

  completeTask: async (id: string) => {
    const authGuard = AuthLifecycle.createGuard();
    const task = get().tasks.find(t => t.id === id);
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
      pendingMutations: state.pendingMutations + 1,
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
        const newTasks = [...state.tasks];
        if (!state.tasks.find(t => t.id === id)) {
          if (originalIndex >= 0 && originalIndex <= newTasks.length) {
            newTasks.splice(originalIndex, 0, originalTask);
          } else {
            newTasks.push(originalTask);
          }
        }
        return {
          tasks: newTasks,
          error: err.message || 'Failed to delete task',
          lastUpdated: Date.now(),
          deferredSnapshot: null
        };
      });
      get().initialize(true).catch(console.error);
      throw err;
    } finally {
      if (!authGuard.isStale()) {
        set((state) => {
          const newCount = Math.max(0, state.pendingMutations - 1);
          const patch: Partial<TaskState> = { pendingMutations: newCount };
          if (newCount === 0 && state.deferredSnapshot) {
            if (JSON.stringify(state.tasks) !== JSON.stringify(state.deferredSnapshot)) {
              patch.tasks = state.deferredSnapshot;
              patch.lastUpdated = Date.now();
            }
            patch.deferredSnapshot = null;
          }
          return patch;
        });
      }
    }
  }
}));