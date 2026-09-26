import { AuthLifecycle } from '../../auth/authLifecycle';
import { MigrationService } from '../migration/MigrationService';
import { RepositoryFactory } from '../RepositoryFactory';
import { resetAuthIdentity } from '../../auth/authOrchestrator';
import { useTaskStore } from '../../state/taskStore';
import { useGoalStore } from '../../state/goalStore';
import { useNoteStore } from '../../state/noteStore';
import { useFocusStore } from '../../state/focusStore';
import { useMoneyStore } from '../../state/moneyStore';
import { useChatStore } from '../../state/chatStore';
import { useKnowledgeStore } from '../../state/knowledgeStore';

export class CutoverCoordinator {
  static async cutoverCurrentUserToFirebase(): Promise<void> {
    const uid = AuthLifecycle.getUid();
    if (!uid) {
      throw new Error('Cutover failed: No authenticated user.');
    }

    const preGuard = AuthLifecycle.createGuard();
    const marker = await MigrationService.getMigrationStatus();

    if (preGuard.isStale()) {
      throw new Error('Cutover aborted: Auth identity changed during verification.');
    }

    if (!marker || marker.status !== 'COMPLETED') {
      throw new Error(`Cutover failed: Migration is not COMPLETED (found: ${marker?.status || 'none'}).`);
    }

    // 1. Provider Switch (Single point of transition)
    RepositoryFactory.setDataSource('firebase');

    // 2. Store Reset (Bumps epoch, cancels pending Local ops, clears all 7 stores synchronously)
    resetAuthIdentity(uid);

    // 3. Capture new guard post-reset for hydration
    const postGuard = AuthLifecycle.createGuard();

    // 4. Hydration (Trigger existing initialization lifecycle on Firebase provider)
    const initPromises = [
      useTaskStore.getState().initialize(),
      useGoalStore.getState().initialize(),
      useNoteStore.getState().initialize(),
      useFocusStore.getState().initialize(),
      useMoneyStore.getState().initialize(),
      useChatStore.getState().initialize(),
      useKnowledgeStore.getState().initialize(),
    ];

    const results = await Promise.all(initPromises);

    if (postGuard.isStale()) {
      throw new Error('Cutover aborted: Auth identity changed during hydration.');
    }

    if (RepositoryFactory.getDataSource() !== 'firebase') {
      throw new Error('Cutover failed: Provider mismatch after hydration.');
    }

    const failures = [
      useTaskStore.getState().status,
      useGoalStore.getState().status,
      useNoteStore.getState().status,
      useFocusStore.getState().status,
      useMoneyStore.getState().status,
      useChatStore.getState().status,
      useKnowledgeStore.getState().status,
    ].filter(status => status === 'error');

    if (failures.length > 0) {
      // Do NOT silently revert to Local. Remain on Firebase but surface the error.
      throw new Error(`Cutover partial failure: ${failures.length} store(s) failed to hydrate.`);
    }
  }
}
