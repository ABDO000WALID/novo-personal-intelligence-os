import { useState, useEffect, useMemo, useCallback } from 'react';
import { Note } from '../../../types/data';
import { STORAGE_KEYS } from '../../../core/storage/storageKeys';
import { storageService, INITIAL_SEEDS, NOVO_STORAGE_EVENT } from '../../../core/storage/storageService';

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>(() => {
    return storageService.getItem<Note[]>(STORAGE_KEYS.NOTES, INITIAL_SEEDS.notes());
  });
  const [activeNoteId, setActiveNoteId] = useState<string | null>(() => {
    const initialNotes = storageService.getItem<Note[]>(STORAGE_KEYS.NOTES, INITIAL_SEEDS.notes());
    return initialNotes.length > 0 ? initialNotes[0].id : null;
  });
  const [searchQuery, setSearchQuery] = useState('');

  // Persist whenever notes change
  const syncNotes = useCallback((newNotes: Note[]) => {
    setNotes(newNotes);
    storageService.setItem(STORAGE_KEYS.NOTES, newNotes);
  }, []);

  // Listen to external updates to notes
  useEffect(() => {
    const handleStorageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string }>;
      if (customEvent.detail?.key === STORAGE_KEYS.NOTES) {
        const updated = storageService.getItem<Note[]>(STORAGE_KEYS.NOTES, []);
        setNotes(updated);
      }
    };

    window.addEventListener(NOVO_STORAGE_EVENT, handleStorageUpdate);
    return () => {
      window.removeEventListener(NOVO_STORAGE_EVENT, handleStorageUpdate);
    };
  }, []);

  const activeNote = useMemo(() => {
    return notes.find((n) => n.id === activeNoteId) || null;
  }, [notes, activeNoteId]);

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes;
    const q = searchQuery.toLowerCase();
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );
  }, [notes, searchQuery]);

  const createNote = useCallback((title = '', content = '') => {
    const now = new Date().toISOString();
    const newNote: Note = {
      id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: title || 'ملاحظة جديدة',
      content: content,
      createdAt: now,
      updatedAt: now,
    };
    const updated = [newNote, ...notes];
    syncNotes(updated);
    setActiveNoteId(newNote.id);
    return newNote;
  }, [notes, syncNotes]);

  const updateNote = useCallback((id: string, updates: Partial<Pick<Note, 'title' | 'content'>>) => {
    const now = new Date().toISOString();
    const updated = notes.map((note) => {
      if (note.id === id) {
        return {
          ...note,
          ...updates,
          updatedAt: now,
        };
      }
      return note;
    });
    syncNotes(updated);
  }, [notes, syncNotes]);

  const deleteNote = useCallback((id: string) => {
    const updated = notes.filter((n) => n.id !== id);
    syncNotes(updated);
    if (activeNoteId === id) {
      setActiveNoteId(updated.length > 0 ? updated[0].id : null);
    }
  }, [notes, activeNoteId, syncNotes]);

  return {
    notes,
    filteredNotes,
    activeNote,
    activeNoteId,
    setActiveNoteId,
    searchQuery,
    setSearchQuery,
    createNote,
    updateNote,
    deleteNote,
  };
}
