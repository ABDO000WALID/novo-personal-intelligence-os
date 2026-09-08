import { storageService, INITIAL_SEEDS, NOVO_STORAGE_EVENT } from './storageService';
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

export interface NovoBackupData {
  notes: Note[];
  goals: Goal[];
  tasks: Task[];
  focusSessions: FocusSession[];
  transactions: Transaction[];
  conversations: Conversation[];
  knowledgeItems: KnowledgeItem[];
}

export interface NovoBackup {
  version: number;
  exportedAt: string;
  source?: string;
  data: NovoBackupData;
}

export interface BackupStats {
  notesCount: number;
  goalsCount: number;
  tasksCount: number;
  focusSessionsCount: number;
  transactionsCount: number;
  conversationsCount: number;
  knowledgeCount: number;
  totalItems: number;
  sizeKb: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  errorAr?: string;
  backup?: NovoBackup;
  stats?: BackupStats;
}

/**
 * Deterministic Backup & Data Management Service
 * Enables full, zero-loss JSON export and import of all NOVO modules.
 */
export const backupService = {
  /**
   * Reads all current records from storage.
   */
  getCurrentData(): NovoBackupData {
    return {
      notes: storageService.getItem<Note[]>(STORAGE_KEYS.NOTES, INITIAL_SEEDS.notes()),
      goals: storageService.getItem<Goal[]>(STORAGE_KEYS.GOALS, INITIAL_SEEDS.goals()),
      tasks: storageService.getItem<Task[]>(STORAGE_KEYS.TASKS, INITIAL_SEEDS.tasks()),
      focusSessions: storageService.getItem<FocusSession[]>(
        STORAGE_KEYS.FOCUS_SESSIONS,
        INITIAL_SEEDS.focusSessions()
      ),
      transactions: storageService.getItem<Transaction[]>(
        STORAGE_KEYS.MONEY_ENTRIES,
        INITIAL_SEEDS.transactions()
      ),
      conversations: storageService.getItem<Conversation[]>(
        STORAGE_KEYS.CONVERSATIONS,
        INITIAL_SEEDS.conversations()
      ),
      knowledgeItems: storageService.getItem<KnowledgeItem[]>(
        STORAGE_KEYS.KNOWLEDGE,
        INITIAL_SEEDS.knowledge()
      ),
    };
  },

  /**
   * Generates storage statistics and estimated size.
   */
  getStorageStats(): BackupStats {
    const data = this.getCurrentData();
    const serialized = JSON.stringify(data);
    const sizeKb = Math.round((new Blob([serialized]).size / 1024) * 10) / 10;

    const notesCount = data.notes.length;
    const goalsCount = data.goals.length;
    const tasksCount = data.tasks.length;
    const focusSessionsCount = data.focusSessions.length;
    const transactionsCount = data.transactions.length;
    const conversationsCount = data.conversations.length;
    const knowledgeCount = data.knowledgeItems.length;

    return {
      notesCount,
      goalsCount,
      tasksCount,
      focusSessionsCount,
      transactionsCount,
      conversationsCount,
      knowledgeCount,
      totalItems:
        notesCount +
        goalsCount +
        tasksCount +
        focusSessionsCount +
        transactionsCount +
        conversationsCount +
        knowledgeCount,
      sizeKb,
    };
  },

  /**
   * Generates a complete NovoBackup object representation.
   */
  getBackupObject(): NovoBackup {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: 'NOVO Personal Intelligence Workspace',
      data: this.getCurrentData(),
    };
  },

  /**
   * Generates a serialized JSON string of the complete workspace backup.
   */
  generateBackupJson(): string {
    return JSON.stringify(this.getBackupObject(), null, 2);
  },

  /**
   * Exports full NOVO backup file and triggers client-side download.
   */
  exportBackup(): void {
    const jsonString = this.generateBackupJson();

    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `novo-backup-${dateStr}.json`;

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();

    // Clean up
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  },

  /**
   * Validates a JSON backup file content.
   */
  validateBackup(jsonString: string): ValidationResult {
    try {
      if (!jsonString || typeof jsonString !== 'string') {
        return {
          valid: false,
          error: 'File content is empty or unreadable.',
          errorAr: 'محتوى الملف فارغ أو تعذر قراءته.',
        };
      }

      const parsed = JSON.parse(jsonString) as NovoBackup;

      if (!parsed || typeof parsed !== 'object') {
        return {
          valid: false,
          error: 'Invalid JSON structure.',
          errorAr: 'هيكل ملف JSON غير صالح.',
        };
      }

      if (typeof parsed.version !== 'number' || parsed.version < 1) {
        return {
          valid: false,
          error: 'Unsupported backup version. Must be version 1 or higher.',
          errorAr: 'إصدار النسخة الاحتياطية غير مدعوم. يجب أن يكون 1 أو أحدث.',
        };
      }

      if (!parsed.data || typeof parsed.data !== 'object') {
        return {
          valid: false,
          error: 'Backup file is missing data payload.',
          errorAr: 'الملف لا يحتوي على بيانات صالحة للاستيراد.',
        };
      }

      // Check arrays
      const data = parsed.data;
      const notes = Array.isArray(data.notes) ? data.notes : [];
      const goals = Array.isArray(data.goals) ? data.goals : [];
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      const focusSessions = Array.isArray(data.focusSessions) ? data.focusSessions : [];
      const transactions = Array.isArray(data.transactions) ? data.transactions : [];
      const conversations = Array.isArray(data.conversations) ? data.conversations : [];
      const knowledgeItems = Array.isArray(data.knowledgeItems) ? data.knowledgeItems : [];

      const totalItems =
        notes.length +
        goals.length +
        tasks.length +
        focusSessions.length +
        transactions.length +
        conversations.length +
        knowledgeItems.length;

      const sizeKb = Math.round((new Blob([jsonString]).size / 1024) * 10) / 10;

      const stats: BackupStats = {
        notesCount: notes.length,
        goalsCount: goals.length,
        tasksCount: tasks.length,
        focusSessionsCount: focusSessions.length,
        transactionsCount: transactions.length,
        conversationsCount: conversations.length,
        knowledgeCount: knowledgeItems.length,
        totalItems,
        sizeKb,
      };

      const sanitizedBackup: NovoBackup = {
        version: parsed.version,
        exportedAt: parsed.exportedAt || new Date().toISOString(),
        source: parsed.source,
        data: {
          notes,
          goals,
          tasks,
          focusSessions,
          transactions,
          conversations,
          knowledgeItems,
        },
      };

      return {
        valid: true,
        backup: sanitizedBackup,
        stats,
      };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : 'Invalid JSON file syntax.',
        errorAr: 'خطأ في صياغة ملف JSON.',
      };
    }
  },

  /**
   * Imports and overwrites current local storage data with the validated backup.
   * Dispatches instant event for React hooks to refresh without reload.
   */
  importBackup(backup: NovoBackup): boolean {
    try {
      const data = backup.data;

      if (Array.isArray(data.notes)) {
        storageService.setItem(STORAGE_KEYS.NOTES, data.notes);
      }
      if (Array.isArray(data.goals)) {
        storageService.setItem(STORAGE_KEYS.GOALS, data.goals);
      }
      if (Array.isArray(data.tasks)) {
        storageService.setItem(STORAGE_KEYS.TASKS, data.tasks);
      }
      if (Array.isArray(data.focusSessions)) {
        storageService.setItem(STORAGE_KEYS.FOCUS_SESSIONS, data.focusSessions);
      }
      if (Array.isArray(data.transactions)) {
        storageService.setItem(STORAGE_KEYS.MONEY_ENTRIES, data.transactions);
      }
      if (Array.isArray(data.conversations)) {
        storageService.setItem(STORAGE_KEYS.CONVERSATIONS, data.conversations);
      }
      if (Array.isArray(data.knowledgeItems)) {
        storageService.setItem(STORAGE_KEYS.KNOWLEDGE, data.knowledgeItems);
      }

      // Dispatch global window event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(NOVO_STORAGE_EVENT, {
            detail: { key: '__ALL__', backup },
          })
        );
      }

      return true;
    } catch (err) {
      console.error('[backupService] Import failed:', err);
      return false;
    }
  },
};
