import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import { resetAuthIdentity } from './authOrchestrator';
import { useAuthStore } from './authStore';
import { RepositoryFactory } from '../data/RepositoryFactory';
import { MigrationService } from '../data/migration/MigrationService';
import { CutoverCoordinator } from '../data/cutover/CutoverCoordinator';
import { AuthLifecycle } from './authLifecycle';

let unsubscribe: (() => void) | null = null;
let initialized = false;

export let lastUid: string | null = null;

export const handleAuthStateChange = async (user: User | null) => {
  const currentUid = user?.uid || null;

  // If the identity has changed (A->B, null->A, A->null), invalidate and reset state.
  // We enforce this synchronously so the epoch ticks BEFORE any UI unmounts or
  // new operations can spawn.
  if (currentUid !== lastUid) {
    // Always default back to local provider on any identity change/sign out
    RepositoryFactory.setDataSource('local');
    
    // Synchronously clear stores and bump epoch
    resetAuthIdentity(currentUid);
    
    lastUid = currentUid;

    // Update UI state synchronously so we don't stall the app mount
    useAuthStore.getState().setUser(user);
    useAuthStore.getState().setLoading(false);

    // For authenticated users, asynchronously resolve their cutover state
    if (currentUid) {
      const guard = AuthLifecycle.createGuard();
      try {
        const marker = await MigrationService.getMigrationStatus();
        
        // If auth identity changed during marker lookup, abort flow
        if (guard.isStale()) return;

        if (marker && marker.status === 'COMPLETED') {
          await CutoverCoordinator.cutoverCurrentUserToFirebase();
        }
      } catch (err) {
        // If marker retrieval or cutover fails, safely remain on local provider
        console.error('[initAuth] Cutover flow failed:', err);
      }
    }
  } else {
    // If it's the same user (e.g. token refresh), just ensure state is updated
    useAuthStore.getState().setUser(user);
    useAuthStore.getState().setLoading(false);
  }
};

export const initFirebaseAuth = () => {
  if (initialized) return;
  initialized = true;

  if (!auth) {
    // If Firebase isn't configured, we just mark as loaded and unauthenticated
    useAuthStore.getState().setLoading(false);
    return;
  }

  unsubscribe = onAuthStateChanged(auth, handleAuthStateChange);
};


