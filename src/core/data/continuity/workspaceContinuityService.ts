import { create } from 'zustand';
import { User } from 'firebase/auth';
import { RepositoryFactory } from '../RepositoryFactory';
import { MigrationService, MigrationMarker } from '../migration/MigrationService';

export type WorkspaceStorageState =
  | 'guest'
  | 'local'
  | 'in_progress'
  | 'failed'
  | 'cloud_synced';

export interface WorkspaceContinuityState {
  storageState: WorkspaceStorageState;
  isSyncing: boolean;
  lastError: string | null;
  
  /**
   * Determine the current workspace storage state for the given user.
   */
  checkStatus: (user?: User | null) => Promise<WorkspaceStorageState>;
  
  /**
   * Seam entry point for syncing workspace to cloud.
   * In Gate 19.3A, this safely validates preconditions and enters the seam
   * without mutating data or switching repositories.
   */
  syncWorkspaceToCloud: (user?: User | null) => Promise<{ success: boolean; error?: string }>;
  
  /**
   * Safe setter for status transitions (e.g. testing or explicit UI recovery).
   */
  setStorageState: (state: WorkspaceStorageState, error?: string | null) => void;
  
  /**
   * Reset continuity UI state to default.
   */
  resetState: () => void;
}

export const useWorkspaceContinuityStore = create<WorkspaceContinuityState>((set, get) => ({
  storageState: 'guest',
  isSyncing: false,
  lastError: null,

  checkStatus: async (user?: User | null): Promise<WorkspaceStorageState> => {
    // 1. Guest / unauthenticated check
    if (!user || user.isAnonymous) {
      set({ storageState: 'guest', isSyncing: false, lastError: null });
      return 'guest';
    }

    // 2. Already cut over to Firebase repository mode
    if (RepositoryFactory.getDataSource() === 'firebase') {
      set({ storageState: 'cloud_synced', isSyncing: false, lastError: null });
      return 'cloud_synced';
    }

    // 3. If currently in local mode, inspect remote migration status if available
    try {
      const marker: MigrationMarker | null = await MigrationService.getMigrationStatus();
      if (marker) {
        if (marker.status === 'IN_PROGRESS') {
          set({ storageState: 'in_progress', isSyncing: true, lastError: null });
          return 'in_progress';
        }
        if (marker.status === 'FAILED') {
          const err = marker.errorCode || 'Migration failed previously';
          set({ storageState: 'failed', isSyncing: false, lastError: err });
          return 'failed';
        }
        if (marker.status === 'COMPLETED' && RepositoryFactory.getDataSource() === 'firebase') {
          set({ storageState: 'cloud_synced', isSyncing: false, lastError: null });
          return 'cloud_synced';
        }
      }
    } catch (err: unknown) {
      console.warn('[WorkspaceContinuityService] Could not check migration status:', err);
    }

    // Default for permanent user currently in local repository mode
    set({ storageState: 'local', isSyncing: false, lastError: null });
    return 'local';
  },

  syncWorkspaceToCloud: async (user?: User | null): Promise<{ success: boolean; error?: string }> => {
    if (!user || user.isAnonymous) {
      return { success: false, error: 'guest_not_allowed' };
    }

    set({ isSyncing: true, storageState: 'in_progress', lastError: null });

    try {
      // In Gate 19.3A: Invocation seam only.
      // We do NOT execute full migration, do NOT switch repository mode,
      // do NOT clear local storage, and do NOT overwrite cloud data.
      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown sync error';
      set({ isSyncing: false, storageState: 'failed', lastError: errorMsg });
      return { success: false, error: errorMsg };
    } finally {
      // If still marked in_progress in this 19.3A seam, return to local or simulated state
      if (get().storageState === 'in_progress') {
        set({ isSyncing: false, storageState: 'local' });
      }
    }
  },

  setStorageState: (state: WorkspaceStorageState, error?: string | null) => {
    set({
      storageState: state,
      isSyncing: state === 'in_progress',
      lastError: error || null,
    });
  },

  resetState: () => {
    set({
      storageState: 'guest',
      isSyncing: false,
      lastError: null,
    });
  },
}));

/**
 * Convenience singleton wrapper for non-React call sites.
 */
export const WorkspaceContinuityService = {
  getState: () => useWorkspaceContinuityStore.getState(),
  checkStatus: (user?: User | null) => useWorkspaceContinuityStore.getState().checkStatus(user),
  syncWorkspaceToCloud: (user?: User | null) => useWorkspaceContinuityStore.getState().syncWorkspaceToCloud(user),
  setStorageState: (state: WorkspaceStorageState, error?: string | null) =>
    useWorkspaceContinuityStore.getState().setStorageState(state, error),
  resetState: () => useWorkspaceContinuityStore.getState().resetState(),
};
