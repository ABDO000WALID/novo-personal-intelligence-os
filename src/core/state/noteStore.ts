import { AuthLifecycle } from '../auth/authLifecycle';
import { create } from 'zustand';
import { Note } from '../../types/data';
import { RepositoryFactory } from '../data/RepositoryFactory';

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface NoteState {
  notes: Note[];
  status: StoreStatus;
  error: string | null;
  lastUpdated: number;

  initialize: () => Promise<void>;
  createNote: (title?: string, content?: string) => Promise<Note>;
  updateNote: (id: string, updates: Partial<Pick<Note, 'title' | 'content'>>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  clearState: () => void;
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  status: 'idle',
  error: null,
  lastUpdated: 0,
  clearState: () => {
    set({
      notes: [],
      status: 'idle',
      error: null,
      lastUpdated: Date.now()
    });
  },

  initialize: async () => {
    const authGuard = AuthLifecycle.createGuard();
    if (get().status === 'loading' || get().status === 'ready') return;

    try {
      set({ status: 'loading', error: null });
      const notes = await RepositoryFactory.getNoteRepository().getAll();
      if (authGuard.isStale()) return;
      set({ notes, status: 'ready', error: null, lastUpdated: Date.now() });
    } catch (err: any) {
      if (authGuard.isStale()) return;
      set({ status: 'error', error: err.message || 'Failed to initialize notes' });
      throw err;
    }
  },

  createNote: async (title: string = '', content: string = '') => {
    const authGuard = AuthLifecycle.createGuard();
    const now = new Date().toISOString();
    const newNote: Note = {
      id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: title || 'ملاحظة جديدة',
      content,
      createdAt: now,
      updatedAt: now,
    };

    set(state => ({
      notes: [newNote, ...state.notes],
      lastUpdated: Date.now()
    }));

    try {
      await RepositoryFactory.getNoteRepository().create(newNote);
      return newNote;
    } catch (err: any) {
      console.error('[NoteStore] Failed to persist new note. Rolling back.', err);
      if (authGuard.isStale()) return;
      set(state => ({
        notes: state.notes.filter(n => n.id !== newNote.id),
        error: err.message || 'Failed to create note'
      }));
      throw err;
    }
  },

  updateNote: async (id: string, updates: Partial<Pick<Note, 'title' | 'content'>>) => {
    const authGuard = AuthLifecycle.createGuard();
    const currentState = get();
    const currentNote = currentState.notes.find(n => n.id === id);
    if (!currentNote) return;

    const now = new Date().toISOString();
    const updatedNote = { ...currentNote, ...updates, updatedAt: now };

    set(state => ({
      notes: state.notes.map(n => n.id === id ? updatedNote : n),
      lastUpdated: Date.now()
    }));

    try {
      await RepositoryFactory.getNoteRepository().update(id, updates);
    } catch (err: any) {
      console.error('[NoteStore] Failed to persist updated note. Rolling back.', err);
      if (authGuard.isStale()) return;
      const latestState = get();
      // Identity check: only rollback if the note is still the exactly same updated note
      const latestNote = latestState.notes.find(n => n.id === id);
      if (latestNote === updatedNote) {
        set(state => ({
          notes: state.notes.map(n => n.id === id ? currentNote : n),
          error: err.message || 'Failed to update note'
        }));
      }
      throw err;
    }
  },

  deleteNote: async (id: string) => {
    const authGuard = AuthLifecycle.createGuard();
    const currentState = get();
    const originalIndex = currentState.notes.findIndex(n => n.id === id);
    if (originalIndex === -1) return;
    const currentNote = currentState.notes[originalIndex];

    set(state => ({
      notes: state.notes.filter(n => n.id !== id),
      lastUpdated: Date.now()
    }));

    try {
      await RepositoryFactory.getNoteRepository().delete(id);
    } catch (err: any) {
      console.error('[NoteStore] Failed to persist deleted note. Rolling back.', err);
      if (authGuard.isStale()) return;
      const latestState = get();
      // Only rollback if the note is still missing (wasn't re-added/created by another process)
      const stillMissing = !latestState.notes.some(n => n.id === id);
      if (stillMissing) {
        const newNotes = [...latestState.notes];
        newNotes.splice(originalIndex, 0, currentNote);
        set({
          notes: newNotes,
          error: err.message || 'Failed to delete note'
        });
      }
      throw err;
    }
  }
}));
