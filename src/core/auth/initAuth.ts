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
let authEventSequence = 0;

export const handleAuthStateChange = async (user: User | null) => {
  const currentUid = user?.uid || null;

  // If the identity has changed (A->B, null->A, A->null), invalidate and reset state.
  // We enforce this synchronously so the epoch ticks BEFORE any UI unmounts or
  // new operations can spawn.
  if (currentUid !== lastUid) {
    // Advance event sequence ONLY when identity actually changes
    const eventId = ++authEventSequence;

    // Always default back to local provider on any identity change/sign out
    RepositoryFactory.setDataSource('local');
    
    // Synchronously clear stores and bump epoch
    resetAuthIdentity(currentUid);
    
    lastUid = currentUid;

    // For unauthenticated (sign-out) or guest / anonymous sessions:
    // Release loading gate immediately; no cloud migration marker check or cutover needed.
    if (!currentUid || user?.isAnonymous) {
      if (eventId !== authEventSequence) return;
      useAuthStore.getState().setUser(user);
      useAuthStore.getState().setLoading(false);
      return;
    }

    // For permanent authenticated users:
    // Keep the application's auth-loading gate active while resolving migration marker and cutover.
    useAuthStore.getState().setUser(user);
    useAuthStore.getState().setLoading(true);

    try {
      const marker = await MigrationService.getMigrationStatus();
      
      // Fence: If another auth event fired or identity drifted during lookup, abort flow
      if (eventId !== authEventSequence || AuthLifecycle.getUid() !== currentUid) {
        return;
      }

      if (marker && marker.status === 'COMPLETED') {
        await CutoverCoordinator.cutoverCurrentUserToFirebase();

        // Fence: Check again post-cutover
        if (eventId !== authEventSequence || AuthLifecycle.getUid() !== currentUid) {
          return;
        }
      }
    } catch (err) {
      // If marker retrieval or cutover fails, safely remain on current state
      console.error('[initAuth] Cutover flow failed:', err);
    } finally {
      // Release loading gate ONLY if this event is still the authoritative current event.
      // Do NOT overwrite user state here, preserving any newer user object provided by same-identity events.
      if (eventId === authEventSequence && AuthLifecycle.getUid() === currentUid) {
        useAuthStore.getState().setLoading(false);
      }
    }
  } else {
    // Same identity (e.g. token refresh, profile update, or repeated event).
    // Update user reference without invalidating in-flight marker lookup or cutover.
    useAuthStore.getState().setUser(user);

    // If not authenticated or not in an active cutover wait, ensure loading is released
    if (!currentUid) {
      useAuthStore.getState().setLoading(false);
    }
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


