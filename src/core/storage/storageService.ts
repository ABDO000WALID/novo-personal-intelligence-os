import { STORAGE_KEYS } from './storageKeys';
import {
  Note,
  Goal,
  Task,
  FocusSession,
  Transaction,
  Conversation,
  KnowledgeItem,
} from '../../types/data';

// In-memory fallback if localStorage is blocked or throws
const memoryStorage: Record<string, string> = {};

// Custom event name for instant cross-component updates on same window
export const NOVO_STORAGE_EVENT = 'novo-storage-update';
export const NOVO_STORAGE_ERROR = 'novo-storage-error';

export const storageService = {
  isAvailable(): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return false;
      }
      const testKey = '__novo_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  },

  getItem<T>(key: string, defaultValue: T): T {
    try {
      let raw: string | null = null;
      if (this.isAvailable()) {
        raw = window.localStorage.getItem(key);
      } else {
        raw = memoryStorage[key] || null;
      }

      if (raw === null || raw === undefined) {
        return defaultValue;
      }

      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn(`[storageService] Failed to parse key "${key}":`, err);
      return defaultValue;
    }
  },

  setItem<T>(key: string, value: T): boolean {
    try {
      const serialized = JSON.stringify(value);
      if (this.isAvailable()) {
        window.localStorage.setItem(key, serialized);
      } else {
        memoryStorage[key] = serialized;
      }

      // Dispatch event to inform any listening components in the same window
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(NOVO_STORAGE_EVENT, {
            detail: { key, value },
          })
        );
      }

      return true;
    } catch (err) {
      console.error(`[storageService] Failed to set key "${key}":`, err);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(NOVO_STORAGE_ERROR, {
            detail: { key, error: err instanceof Error ? err.message : 'QuotaExceededError' },
          })
        );
      }
      throw err; // explicitly throw so callers can rollback
    }
  },

  removeItem(key: string): boolean {
    try {
      if (this.isAvailable()) {
        window.localStorage.removeItem(key);
      } else {
        delete memoryStorage[key];
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(NOVO_STORAGE_EVENT, {
            detail: { key, value: null },
          })
        );
      }

      return true;
    } catch (err) {
      console.error(`[storageService] Failed to remove key "${key}":`, err);
      return false;
    }
  },
};

// Initial starter seeds to populate local storage if empty
export const INITIAL_SEEDS = {
  notes: (): Note[] => [],
  goals: (): Goal[] => [],
  tasks: (): Task[] => [],
  focusSessions: (): FocusSession[] => [],
  transactions: (): Transaction[] => [],
  conversations: (): Conversation[] => [],
  knowledge: (): KnowledgeItem[] => []
};
