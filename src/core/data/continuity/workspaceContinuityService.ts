import { create } from 'zustand';
import { User } from 'firebase/auth';
import { RepositoryFactory } from '../RepositoryFactory';
import { MigrationService, MigrationMarker } from '../migration/MigrationService';
import { CutoverCoordinator } from '../cutover/CutoverCoordinator';
import { AuthLifecycle } from '../../auth/authLifecycle';
import { useTaskStore } from '../../state/taskStore';
import { useGoalStore } from '../../state/goalStore';
import { useNoteStore } from '../../state/noteStore';
import { useFocusStore } from '../../state/focusStore';
import { useMoneyStore } from '../../state/moneyStore';
import { useChatStore } from '../../state/chatStore';
import { useKnowledgeStore } from '../../state/knowledgeStore';

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
   * Orchestrates the local-to-cloud migration and cutover lifecycle.
   * - In local mode: runs migration preflight, idempotent writes, and cutover.
   * - In firebase mode: retries store hydration without re-running local migration.
   * - Re-entrant, concurrency, and auth-drift safe.
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

function checkStoresAllReady(): boolean {
  return [
    useTaskStore.getState().status,
    useGoalStore.getState().status,
    useNoteStore.getState().status,
    useFocusStore.getState().status,
    useMoneyStore.getState().status,
    useChatStore.getState().status,
    useKnowledgeStore.getState().status,
  ].every(status => status === 'ready');
}

function checkStoresHaveFailures(): boolean {
  return [
    useTaskStore.getState().status,
    useGoalStore.getState().status,
    useNoteStore.getState().status,
    useFocusStore.getState().status,
    useMoneyStore.getState().status,
    useChatStore.getState().status,
    useKnowledgeStore.getState().status,
  ].some(status => status === 'error');
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

    // 2. Already in Firebase repository mode
    if (RepositoryFactory.getDataSource() === 'firebase') {
      if (checkStoresHaveFailures()) {
        set({ storageState: 'failed', isSyncing: false, lastError: 'Some stores failed to load from cloud' });
        return 'failed';
      }
      if (!checkStoresAllReady()) {
        set({ storageState: 'failed', isSyncing: false, lastError: 'Some stores are not ready' });
        return 'failed';
      }
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
      }
    } catch (err: unknown) {
      console.warn('[WorkspaceContinuityService] Could not check migration status:', err);
    }

    // Default for permanent user currently in local repository mode
    set({ storageState: 'local', isSyncing: false, lastError: null });
    return 'local';
  },

  syncWorkspaceToCloud: async (user?: User | null): Promise<{ success: boolean; error?: string }> => {
    // 1. Precondition: Reject unauthenticated or anonymous users safely
    if (!user || user.isAnonymous || !user.uid) {
      return { success: false, error: 'guest_not_allowed' };
    }

    // 2. Concurrency barrier: Guard before the first asynchronous operation
    if (get().isSyncing) {
      return { success: false, error: 'Sync already in progress' };
    }

    const targetUid = user.uid;

    // Ensure AuthLifecycle matches target identity before capturing epoch guard
    if (AuthLifecycle.getUid() !== targetUid) {
      AuthLifecycle.reset(targetUid);
    }
    const guard = AuthLifecycle.createGuard();

    // Synchronously claim in_progress state
    set({ isSyncing: true, storageState: 'in_progress', lastError: null });

    try {
      // 3. Branch based on RepositoryFactory mode
      const currentProvider = RepositoryFactory.getDataSource();

      if (currentProvider === 'local') {
        // --- LOCAL REPOSITORY MODE ---
        // Run MigrationService even if a previous marker was COMPLETED.
        // This re-evaluates current local workspace data:
        // - identical cloud data is skipped idempotently,
        // - differing same-ID or remote-only data fails closed,
        // - new local items are safely migrated.
        await MigrationService.migrateCurrentUserToFirestore();

        if (guard.isStale() || AuthLifecycle.getUid() !== targetUid) {
          throw new Error('Auth identity changed during migration.');
        }

        // Verify that migration completed for the same authenticated UID
        const marker = await MigrationService.getMigrationStatus();
        if (guard.isStale() || AuthLifecycle.getUid() !== targetUid) {
          throw new Error('Auth identity changed during verification.');
        }

        if (!marker || marker.status !== 'COMPLETED') {
          throw new Error(`Migration did not complete successfully (status: ${marker?.status || 'none'}).`);
        }

        // Invoke cutover only after verified migration completion.
        // Note: CutoverCoordinator internally calls resetAuthIdentity(uid), which bumps the auth epoch
        // to cancel pending local ops, while preserving AuthLifecycle.getUid() === targetUid.
        await CutoverCoordinator.cutoverCurrentUserToFirebase();

        if (AuthLifecycle.getUid() !== targetUid) {
          throw new Error('Auth identity changed during cutover.');
        }

        set({ isSyncing: false, storageState: 'cloud_synced', lastError: null });
        return { success: true };

      } else {
        // --- FIREBASE REPOSITORY MODE ---
        // NEVER invoke local migration engine in Firebase mode.
        const marker = await MigrationService.getMigrationStatus();

        if (guard.isStale() || AuthLifecycle.getUid() !== targetUid) {
          throw new Error('Auth identity changed during status check.');
        }

        // Check if marker is missing or non-COMPLETED: fail safely, do NOT switch to local
        if (!marker || marker.status !== 'COMPLETED') {
          const errorMsg = `Cloud sync failed: Migration marker is not COMPLETED (found: ${marker?.status || 'none'}). Cannot hydrate.`;
          set({ isSyncing: false, storageState: 'failed', lastError: errorMsg });
          return { success: false, error: errorMsg };
        }

        // Check if already healthy and cloud_synced:
        // Immediate healthy no-op is allowed ONLY when:
        // 1. storageState === 'cloud_synced'
        // 2. current authenticated user's migration marker is COMPLETED (verified above)
        // 3. current identity remains valid (guard.isStale() and AuthLifecycle.getUid() verified above)
        // 4. all seven domain stores have status 'ready'
        const allStoresReady = checkStoresAllReady();
        if (get().storageState === 'cloud_synced' && allStoresReady) {
          set({ isSyncing: false, lastError: null });
          return { success: true };
        }

        // Stores need recovery: retry hydration through CutoverCoordinator
        await CutoverCoordinator.cutoverCurrentUserToFirebase();

        if (AuthLifecycle.getUid() !== targetUid) {
          throw new Error('Auth identity changed during hydration retry.');
        }

        set({ isSyncing: false, storageState: 'cloud_synced', lastError: null });
        return { success: true };
      }

    } catch (err: unknown) {
      // If auth identity changed or user signed out, do NOT overwrite continuity state of newer identity
      if (AuthLifecycle.getUid() !== targetUid) {
        return { success: false, error: 'Auth identity changed during operation.' };
      }

      const errorMsg = err instanceof Error ? err.message : 'Unknown sync error';
      set({ isSyncing: false, storageState: 'failed', lastError: errorMsg });
      return { success: false, error: errorMsg };

    } finally {
      // Clean up isSyncing only if still owned by the current target identity
      if (AuthLifecycle.getUid() === targetUid && get().isSyncing) {
        set({ isSyncing: false });
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
