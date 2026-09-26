import { AuthLifecycle } from '../auth/authLifecycle';
import { create } from 'zustand';
import { KnowledgeItem, KnowledgeCategory, KnowledgeImportance } from '../../types/data';
import { RepositoryFactory } from '../data/RepositoryFactory';

interface KnowledgeState {
  knowledge: KnowledgeItem[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: Error | null;
  lastUpdated: number;

  initialize: () => Promise<void>;
  createKnowledge: (params: {
    title: string;
    content: string;
    category?: KnowledgeCategory;
    tags?: string[];
    importance?: KnowledgeImportance;
    pinned?: boolean;
    source?: 'manual' | 'note';
    goalId?: string;
    noteId?: string;
  }) => Promise<KnowledgeItem>;
  updateKnowledge: (id: string, updates: Partial<Omit<KnowledgeItem, 'id' | 'createdAt'>>) => Promise<void>;
  deleteKnowledge: (id: string) => Promise<void>;
  togglePinned: (id: string) => Promise<void>;
  clearState: () => void;
}

let initializationPromise: Promise<void> | null = null;

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  knowledge: [],
  status: 'idle',
  error: null,
  lastUpdated: Date.now(),
  clearState: () => {
    initializationPromise = null;
    set({
      knowledge: [],
      status: 'idle',
      error: null,
      lastUpdated: Date.now()
    });
  },

  initialize: async () => {
    const authGuard = AuthLifecycle.createGuard();
    const { status } = get();
    if (status === 'ready') return;
    
    if (initializationPromise) {
      return initializationPromise;
    }

    set({ status: 'loading', error: null });

    initializationPromise = (async () => {
      try {
        const data = await RepositoryFactory.getKnowledgeRepository().getAll();
        if (authGuard.isStale()) return;
        set({
          knowledge: data,
          status: 'ready',
          lastUpdated: Date.now(),
        });
      } catch (err) {
        if (authGuard.isStale()) return;
        const error = err instanceof Error ? err : new Error('Failed to load knowledge');
        set({ status: 'error', error });
        throw error;
      } finally {
        initializationPromise = null;
      }
    })();

    return initializationPromise;
  },

  createKnowledge: async (params) => {
    const authGuard = AuthLifecycle.createGuard();
    const now = new Date().toISOString();
    const cleanTags = Array.from(
      new Set(
        (params.tags || [])
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t.length > 0)
      )
    );
    const newItem: KnowledgeItem = {
      id: `know-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: params.title.trim(),
      content: params.content.trim(),
      category: params.category || 'general',
      tags: cleanTags,
      importance: params.importance || 'medium',
      pinned: params.pinned || false,
      source: params.source || 'manual',
      goalId: params.goalId,
      noteId: params.noteId,
      createdAt: now,
      updatedAt: now,
    };

    // Optimistic UI update
    set(state => ({
      knowledge: [newItem, ...state.knowledge],
      lastUpdated: Date.now(),
    }));

    try {
      await RepositoryFactory.getKnowledgeRepository().create(newItem);
    } catch (err) {
      console.error('[KnowledgeStore] Failed to persist new knowledge item', err);
      if (authGuard.isStale()) return;
      // Targeted rollback: remove only this specific newly created item
      set(state => ({
        knowledge: state.knowledge.filter(k => k.id !== newItem.id),
      }));
      throw err;
    }

    return newItem;
  },

  updateKnowledge: async (id, updates) => {
    const authGuard = AuthLifecycle.createGuard();
    const originalItem = get().knowledge.find(k => k.id === id);
    if (!originalItem) return;

    let cleanTags = originalItem.tags;
    if (updates.tags) {
      cleanTags = Array.from(
        new Set(
          updates.tags
            .map((t) => t.trim().toLowerCase())
            .filter((t) => t.length > 0)
        )
      );
    }
    
    const updatedItem = {
      ...originalItem,
      ...updates,
      tags: cleanTags,
      updatedAt: new Date().toISOString(),
    };

    // Optimistic UI update
    set(state => ({
      knowledge: state.knowledge.map((item) => item.id === id ? updatedItem : item),
      lastUpdated: Date.now(),
    }));

    try {
      await RepositoryFactory.getKnowledgeRepository().update(id, updatedItem);
    } catch (err) {
      console.error('[KnowledgeStore] Failed to persist knowledge update', err);
      if (authGuard.isStale()) return;
      // Targeted rollback: only revert if the current item is exactly the one we optimistically set
      // (Protects against newer concurrent changes)
      set(state => {
        const currentItem = state.knowledge.find(k => k.id === id);
        if (currentItem === updatedItem) {
          return {
            knowledge: state.knowledge.map((item) => item.id === id ? originalItem : item),
          };
        }
        return state;
      });
      throw err;
    }
  },

  deleteKnowledge: async (id) => {
    const authGuard = AuthLifecycle.createGuard();
    const originalItem = get().knowledge.find(k => k.id === id);
    if (!originalItem) return;
    
    const originalIndex = get().knowledge.findIndex(k => k.id === id);

    // Optimistic UI update
    set(state => ({
      knowledge: state.knowledge.filter((item) => item.id !== id),
      lastUpdated: Date.now(),
    }));

    try {
      await RepositoryFactory.getKnowledgeRepository().delete(id);
    } catch (err) {
      console.error('[KnowledgeStore] Failed to persist knowledge deletion', err);
      if (authGuard.isStale()) return;
      // Targeted rollback: restore deleted item at original index (or end if out of bounds)
      set(state => {
        // Double check it hasn't been recreated somehow
        if (state.knowledge.some(k => k.id === id)) {
          return state;
        }
        const restoredKnowledge = [...state.knowledge];
        restoredKnowledge.splice(originalIndex, 0, originalItem);
        return { knowledge: restoredKnowledge };
      });
      throw err;
    }
  },

  togglePinned: async (id) => {
    const authGuard = AuthLifecycle.createGuard();
    const target = get().knowledge.find((i) => i.id === id);
    if (!target) return;
    return get().updateKnowledge(id, { pinned: !target.pinned });
  }
}));
