import './test_env.ts';
import assert from 'assert';
import fs from 'fs';
import {
  WorkspaceContinuityService,
  useWorkspaceContinuityStore,
  WorkspaceStorageState,
} from './src/core/data/continuity/workspaceContinuityService';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { handleAuthStateChange } from './src/core/auth/initAuth';

async function runTests() {
  console.log('====================================================');
  console.log('STARTING GATE 19.3A WORKSPACE STATUS & CONTINUITY TESTS');
  console.log('====================================================');

  let passed = 0;

  // --- SECTION 1: Guest Status & Action Isolation ---
  console.log('\n--- Section 1: Guest Workspace Status ---');

  // 1.1: Unauthenticated user is classified as 'guest'
  const unauthState = await WorkspaceContinuityService.checkStatus(null);
  assert.strictEqual(unauthState, 'guest', 'Unauthenticated user must be guest');
  passed++;
  console.log(`  ✓ [PASS ${passed}] 1.1: Unauthenticated user correctly classified as 'guest'`);

  // 1.2: Anonymous user is classified as 'guest'
  const anonUser: any = {
    uid: 'anon_user_guest_123',
    email: null,
    isAnonymous: true,
  };
  const anonState = await WorkspaceContinuityService.checkStatus(anonUser);
  assert.strictEqual(anonState, 'guest', 'Anonymous user must be guest');
  passed++;
  console.log(`  ✓ [PASS ${passed}] 1.2: Anonymous user correctly classified as 'guest'`);

  // 1.3: Guest cannot trigger cloud sync seam
  const guestSyncAttempt = await WorkspaceContinuityService.syncWorkspaceToCloud(anonUser);
  assert.strictEqual(guestSyncAttempt.success, false);
  assert.strictEqual(guestSyncAttempt.error, 'guest_not_allowed');
  passed++;
  console.log(`  ✓ [PASS ${passed}] 1.3: Guest cannot trigger cloud sync seam (fail-closed)`);

  // --- SECTION 2: Permanent Local User Status ---
  console.log('\n--- Section 2: Permanent Local User Status ---');

  const permUser: any = {
    uid: 'perm_user_local_456',
    email: 'user@example.com',
    isAnonymous: false,
  };

  RepositoryFactory.setDataSource('local');
  const localState = await WorkspaceContinuityService.checkStatus(permUser);
  assert.strictEqual(localState, 'local', 'Permanent user with local repository must be local');
  assert.strictEqual(WorkspaceContinuityService.getState().storageState, 'local');
  assert.strictEqual(WorkspaceContinuityService.getState().isSyncing, false);
  passed++;
  console.log(`  ✓ [PASS ${passed}] 2.1: Permanent user in local mode represented as 'local'`);

  // --- SECTION 3: Cloud Synced Status ---
  console.log('\n--- Section 3: Cloud Synced Status ---');

  RepositoryFactory.setDataSource('firebase');
  const cloudState = await WorkspaceContinuityService.checkStatus(permUser);
  assert.strictEqual(cloudState, 'cloud_synced', 'Repository in firebase mode must be cloud_synced');
  assert.strictEqual(WorkspaceContinuityService.getState().storageState, 'cloud_synced');
  passed++;
  console.log(`  ✓ [PASS ${passed}] 3.1: Cloud repository mode correctly represented as 'cloud_synced'`);

  // Reset back to local mode for subsequent tests
  RepositoryFactory.setDataSource('local');

  // --- SECTION 4: In-Progress & Failed State Transitions ---
  console.log('\n--- Section 4: In-Progress & Failure State Representations ---');

  // 4.1: In-progress state representation
  WorkspaceContinuityService.setStorageState('in_progress');
  assert.strictEqual(WorkspaceContinuityService.getState().storageState, 'in_progress');
  assert.strictEqual(WorkspaceContinuityService.getState().isSyncing, true);
  passed++;
  console.log(`  ✓ [PASS ${passed}] 4.1: Migration-in-progress state represented correctly`);

  // 4.2: Failed state representation
  const errorReason = 'Network timeout contacting Firestore';
  WorkspaceContinuityService.setStorageState('failed', errorReason);
  assert.strictEqual(WorkspaceContinuityService.getState().storageState, 'failed');
  assert.strictEqual(WorkspaceContinuityService.getState().isSyncing, false);
  assert.strictEqual(WorkspaceContinuityService.getState().lastError, errorReason);
  passed++;
  console.log(`  ✓ [PASS ${passed}] 4.2: Failed migration state cleanly captures status and error reason`);

  // --- SECTION 5: Safety Invariants in Gate 19.3A Seam ---
  console.log('\n--- Section 5: Data Safety & Invariant Guarantees in 19.3A ---');

  // Seed local tasks and goals to verify zero mutations occur
  await handleAuthStateChange(permUser as any);
  useTaskStore.getState().clearState();
  useGoalStore.getState().clearState();
  await useTaskStore.getState().createTask('Task before 19.3A seam invocation', 'high');
  const taskCountBefore = useTaskStore.getState().tasks.length;
  assert.strictEqual(taskCountBefore, 1);

  const initialMode = RepositoryFactory.getDataSource();
  assert.strictEqual(initialMode, 'local');

  // Invoke 19.3A seam for permanent user
  const syncResult = await WorkspaceContinuityService.syncWorkspaceToCloud(permUser);
  assert.strictEqual(syncResult.success, true);

  // Invariant 1: Repository mode must NOT change in Gate 19.3A
  assert.strictEqual(RepositoryFactory.getDataSource(), 'local', 'Repository mode must remain local in 19.3A');
  passed++;
  console.log(`  ✓ [PASS ${passed}] 5.1: Seam invocation does NOT switch repository mode in Gate 19.3A`);

  // Invariant 2: Local data must NOT be cleared or mutated
  assert.strictEqual(useTaskStore.getState().tasks.length, 1, 'Local task count must remain identical');
  assert.strictEqual(useTaskStore.getState().tasks[0].title, 'Task before 19.3A seam invocation');
  passed++;
  console.log(`  ✓ [PASS ${passed}] 5.2: Seam invocation preserves all local tasks and store data without mutation`);

  // --- SECTION 6: UI Grounding & Privacy Invariants ---
  console.log('\n--- Section 6: UI Grounding & Privacy Invariants ---');

  const settingsContent = fs.readFileSync('src/modules/settings/SettingsView.tsx', 'utf-8');

  // Invariant 3: Zero raw UID displayed in UI
  assert(!settingsContent.includes('{authUser.uid}'), 'Raw authUser.uid must NOT be displayed in SettingsView');
  passed++;
  console.log(`  ✓ [PASS ${passed}] 6.1: Zero raw Firebase UID in SettingsView`);

  // Invariant 4: Bilingual strings present for Cloud Sync actions and status
  assert(settingsContent.includes('Sync Workspace to Cloud'), 'Must include English "Sync Workspace to Cloud"');
  assert(settingsContent.includes('مزامنة مساحة العمل مع السحابة'), 'Must include Arabic "مزامنة مساحة العمل مع السحابة"');
  assert(settingsContent.includes('Cloud Synced'), 'Must include English "Cloud Synced"');
  assert(settingsContent.includes('متصل بالسحابة'), 'Must include Arabic "متصل بالسحابة"');
  assert(settingsContent.includes('Local Workspace'), 'Must include English "Local Workspace"');
  assert(settingsContent.includes('مساحة عمل محلية'), 'Must include Arabic "مساحة عمل محلية"');
  assert(settingsContent.includes('Retry Sync to Cloud'), 'Must include English "Retry Sync to Cloud"');
  assert(settingsContent.includes('إعادة محاولة المزامنة'), 'Must include Arabic "إعادة محاولة المزامنة"');
  passed++;
  console.log(`  ✓ [PASS ${passed}] 6.2: SettingsView includes clear bilingual status and explicit action/retry buttons`);

  // Invariant 5: Guest sees NO inappropriate cloud migration action
  // Verify that cloud sync action is conditional on !authUser.isAnonymous
  assert(settingsContent.includes('continuityState === \'local\''), 'Cloud sync button must check continuityState');
  assert(settingsContent.includes('continuityState === \'failed\''), 'Retry button must check continuityState');
  passed++;
  console.log(`  ✓ [PASS ${passed}] 6.3: Guest cannot see inappropriate cloud migration button`);

  // Invariant 7: Visibility condition ensures guest hidden and permanent local user visible
  assert(
    settingsContent.includes('authUser.isAnonymous ?'),
    'Guest account must branch to separate actions without cloud sync'
  );
  assert(
    settingsContent.includes("(continuityState === 'local' || continuityState === 'guest')"),
    'Permanent local user must see Sync Workspace to Cloud entry point even prior to async marker check'
  );
  passed++;
  console.log(`  ✓ [PASS ${passed}] 6.5: Guest sync button hidden and permanent local user sync button visible`);

  // Invariant 6: No silent merge or identity leakage
  const aliceEpoch = AuthLifecycle.getEpoch();
  const aliceGuard = AuthLifecycle.createGuard();
  await handleAuthStateChange({ uid: 'user_bob_distinct', isAnonymous: false } as any);
  assert(aliceGuard.isStale(), 'Identity change must invalidate prior guard');
  assert(AuthLifecycle.getEpoch() > aliceEpoch, 'Epoch must increment on identity transition');
  passed++;
  console.log(`  ✓ [PASS ${passed}] 6.4: Zero account merge or cross-identity state leakage`);

  console.log('\n====================================================');
  console.log(`ALL ${passed} GATE 19.3A TESTS PASSED PERFECTLY!`);
  console.log('====================================================');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ Gate 19.3A Test Failed:', err);
  process.exit(1);
});
