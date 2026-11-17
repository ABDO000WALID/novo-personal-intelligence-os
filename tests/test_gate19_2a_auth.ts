import './test_env.ts';
import assert from 'assert';
import fs from 'fs';
import {
  getLocalizedAuthError,
  signUpWithEmail,
  signInWithEmail,
  linkAnonymousWithEmail,
  signOutUser,
  signInAnonymousUser,
} from './src/core/auth/authService';
import { useAuthStore } from './src/core/auth/authStore';
import { handleAuthStateChange, lastUid } from './src/core/auth/initAuth';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';

async function runTests() {
  console.log('====================================================');
  console.log('STARTING GATE 19.2A AUTHENTICATION & IDENTITY TESTS');
  console.log('====================================================');

  let passed = 0;

  // --- SECTION 1: Localized Firebase Auth Error Mapping ---
  console.log('\n--- Section 1: Localized Error Mapping ---');

  const errorCases: Array<{ code: string; arKeyword: string; enKeyword: string }> = [
    { code: 'auth/email-already-in-use', arKeyword: 'مستخدم بالفعل', enKeyword: 'already in use' },
    { code: 'auth/invalid-credential', arKeyword: 'غير صالحة', enKeyword: 'Invalid credentials' },
    { code: 'auth/wrong-password', arKeyword: 'كلمة المرور غير صحيحة', enKeyword: 'Incorrect password' },
    { code: 'auth/user-not-found', arKeyword: 'لم يتم العثور على حساب', enKeyword: 'No account found' },
    { code: 'auth/weak-password', arKeyword: 'ضعيفة', enKeyword: 'too weak' },
    { code: 'auth/too-many-requests', arKeyword: 'تكرار المحاولات', enKeyword: 'too many failed attempts' },
    { code: 'auth/network-request-failed', arKeyword: 'الشبكة', enKeyword: 'Network error' },
    { code: 'auth/invalid-email', arKeyword: 'بريد إلكتروني صالح', enKeyword: 'valid email address' },
    { code: 'auth/credential-already-in-use', arKeyword: 'مرتبطة بالفعل', enKeyword: 'already linked' },
    { code: 'auth/no-current-user', arKeyword: 'لا توجد جلسة ضيف', enKeyword: 'No active guest session' },
    { code: 'auth/not-anonymous', arKeyword: 'دائم بالفعل', enKeyword: 'already a permanent account' },
  ];

  for (const tc of errorCases) {
    const arMsg = getLocalizedAuthError(tc.code, 'ar');
    const enMsg = getLocalizedAuthError(tc.code, 'en');
    assert(arMsg.includes(tc.arKeyword), `Arabic error for ${tc.code} should contain "${tc.arKeyword}", got: "${arMsg}"`);
    assert(enMsg.includes(tc.enKeyword), `English error for ${tc.code} should contain "${tc.enKeyword}", got: "${enMsg}"`);
  }
  passed++;
  console.log(`  ✓ [PASS ${passed}] 1.1: All standard error codes mapped accurately in Arabic and English`);

  // Error object handling (e.g. FirebaseError with code or message)
  const objError = { code: 'auth/email-already-in-use', message: 'The email address is already in use.' };
  assert(getLocalizedAuthError(objError, 'en').includes('already in use'), 'Should extract code from object');
  const unknownError = getLocalizedAuthError({ code: 'auth/unknown-error-code' }, 'en');
  assert(unknownError.includes('An authentication error occurred'), 'Should fall back gracefully');
  passed++;
  console.log(`  ✓ [PASS ${passed}] 1.2: Handles error objects and fallback smoothly`);

  // --- SECTION 2: Mock Firebase Auth Implementation for Service Testing ---
  console.log('\n--- Section 2: Email & Password Service Logic ---');

  // Build a test-isolated mock auth environment
  interface MockFirebaseUser {
    uid: string;
    email: string | null;
    isAnonymous: boolean;
    getIdToken: () => Promise<string>;
  }

  const registeredUsers: Map<string, { email: string; pass: string; uid: string }> = new Map();
  let currentMockUser: MockFirebaseUser | null = null;

  const mockAuth: any = {
    get currentUser() {
      return currentMockUser;
    }
  };

  // Unit test input validation in authService
  await assert.rejects(
    async () => signUpWithEmail('', 'password123', mockAuth),
    (err: any) => err.message === 'auth/invalid-email',
    'Should reject empty email on sign-up'
  );
  await assert.rejects(
    async () => signUpWithEmail('user@test.com', '123', mockAuth),
    (err: any) => err.message === 'auth/weak-password',
    'Should reject weak password on sign-up'
  );
  passed++;
  console.log(`  ✓ [PASS ${passed}] 2.1: signUpWithEmail validates email format and password strength`);

  await assert.rejects(
    async () => signInWithEmail('', 'password123', mockAuth),
    (err: any) => err.message === 'auth/invalid-email',
    'Should reject empty email on sign-in'
  );
  passed++;
  console.log(`  ✓ [PASS ${passed}] 2.2: signInWithEmail validates email format`);

  // --- SECTION 3: Anonymous Account Creation and Representation ---
  console.log('\n--- Section 3: Anonymous Guest Representation ---');

  const anonUid = 'anon_guest_xyz_123';
  currentMockUser = {
    uid: anonUid,
    email: null,
    isAnonymous: true,
    getIdToken: async () => 'mock_token_anon',
  };

  // Simulate Firebase auth notifying initAuth
  await handleAuthStateChange(currentMockUser as any);
  assert.strictEqual(useAuthStore.getState().user?.uid, anonUid);
  assert.strictEqual(useAuthStore.getState().user?.isAnonymous, true);
  assert.strictEqual(AuthLifecycle.getUid(), anonUid);
  passed++;
  console.log(`  ✓ [PASS ${passed}] 3.1: Anonymous user state initialized with isAnonymous=true and matching UID`);

  // --- SECTION 4: Anonymous to Permanent Account Linking ---
  console.log('\n--- Section 4: Anonymous-to-Permanent Account Linking ---');

  // Verify linking validations
  await assert.rejects(
    async () => linkAnonymousWithEmail('test@novo.com', 'short', currentMockUser as any, mockAuth),
    (err: any) => err.message === 'auth/weak-password',
    'Should reject weak password on linking'
  );
  await assert.rejects(
    async () => linkAnonymousWithEmail('', 'validpass123', currentMockUser as any, mockAuth),
    (err: any) => err.message === 'auth/invalid-email',
    'Should reject empty email on linking'
  );
  passed++;
  console.log(`  ✓ [PASS ${passed}] 4.1: linkAnonymousWithEmail enforces email and password requirements`);

  // Create local user data while anonymous
  useTaskStore.getState().clearState();
  await useTaskStore.getState().createTask('Anonymous task before linking', 'high');
  const tasksBeforeLink = useTaskStore.getState().tasks;
  assert.strictEqual(tasksBeforeLink.length, 1);
  const initialEpoch = AuthLifecycle.getEpoch();

  // Mock successful linkWithCredential behavior
  const emailToLink = 'guest_upgraded@novo.com';
  // Simulate successful in-place credential link: UID stays identical, isAnonymous becomes false, email updated
  const upgradedUser: MockFirebaseUser = {
    uid: anonUid, // CRITICAL: UID MUST REMAIN IDENTICAL
    email: emailToLink,
    isAnonymous: false,
    getIdToken: async () => 'mock_token_upgraded',
  };

  // Trigger auth state change with the updated user instance
  await handleAuthStateChange(upgradedUser as any);

  // Invariant 1: UID before linking === UID after linking
  assert.strictEqual(AuthLifecycle.getUid(), anonUid, 'UID must be identical before and after linking');
  assert.strictEqual(useAuthStore.getState().user?.uid, anonUid, 'Store user UID must match');

  // Invariant 2: isAnonymous updated
  assert.strictEqual(useAuthStore.getState().user?.isAnonymous, false, 'isAnonymous must now be false');
  assert.strictEqual(useAuthStore.getState().user?.email, emailToLink, 'email must be populated');

  // Invariant 3: AuthLifecycle epoch must NOT reset or bump unnecessarily during in-place linking
  assert.strictEqual(AuthLifecycle.getEpoch(), initialEpoch, 'AuthLifecycle epoch should remain stable during in-place link');

  // Invariant 4: Existing workspace data (tasks/goals) remain attached and intact
  assert.strictEqual(useTaskStore.getState().tasks.length, 1, 'In-memory tasks must NOT be cleared during account link');
  assert.strictEqual(useTaskStore.getState().tasks[0].title, 'Anonymous task before linking');
  passed++;
  console.log(`  ✓ [PASS ${passed}] 4.2: Anonymous -> permanent linking strictly preserves UID and workspace data`);

  // Verify non-anonymous user cannot be re-linked
  await assert.rejects(
    async () => linkAnonymousWithEmail('another@novo.com', 'password123', upgradedUser as any, mockAuth),
    (err: any) => err.message === 'auth/not-anonymous',
    'Should reject linking an already permanent account'
  );
  passed++;
  console.log(`  ✓ [PASS ${passed}] 4.3: Reject linking when account is already permanent`);

  // --- SECTION 5: Sign-out and Epoch Teardown ---
  console.log('\n--- Section 5: Sign-Out and Lifecycle Teardown ---');

  let resetListenerCalled = false;
  const unregisterListener = AuthLifecycle.onReset(() => {
    resetListenerCalled = true;
  });

  const staleGuardBeforeSignOut = AuthLifecycle.createGuard();

  // Simulate Sign Out (user becomes null)
  await handleAuthStateChange(null);

  assert.strictEqual(useAuthStore.getState().user, null, 'User should be null after sign-out');
  assert.strictEqual(AuthLifecycle.getUid(), null, 'AuthLifecycle UID should be null');
  assert(AuthLifecycle.getEpoch() > initialEpoch, 'Epoch must increment on sign out');
  assert(staleGuardBeforeSignOut.isStale(), 'Pre-signout guard must become stale');
  assert(resetListenerCalled, 'AuthLifecycle onReset listeners must be notified');
  assert.strictEqual(useTaskStore.getState().tasks.length, 0, 'In-memory stores must be cleared on sign out');
  unregisterListener();
  passed++;
  console.log(`  ✓ [PASS ${passed}] 5.1: Sign-out increments epoch, notifies listeners, and clears in-memory stores`);

  // --- SECTION 6: User A -> User B State Isolation ---
  console.log('\n--- Section 6: User A -> User B State Isolation ---');

  // User A logs in
  const userA: MockFirebaseUser = {
    uid: 'user_alice',
    email: 'alice@novo.com',
    isAnonymous: false,
    getIdToken: async () => 'alice_token',
  };
  await handleAuthStateChange(userA as any);
  await useTaskStore.getState().createTask('Alice secret task', 'high');
  assert.strictEqual(useTaskStore.getState().tasks.length, 1);

  const aliceGuard = AuthLifecycle.createGuard();
  const aliceEpoch = AuthLifecycle.getEpoch();

  // User B logs in (direct switch)
  const userB: MockFirebaseUser = {
    uid: 'user_bob',
    email: 'bob@novo.com',
    isAnonymous: false,
    getIdToken: async () => 'bob_token',
  };
  await handleAuthStateChange(userB as any);

  // Invariant: Alice's guard is now stale
  assert(aliceGuard.isStale(), 'Alice async guard must be stale after Bob logs in');
  assert(AuthLifecycle.getEpoch() > aliceEpoch, 'Epoch must increment on user change');
  assert.strictEqual(AuthLifecycle.getUid(), 'user_bob');

  // Invariant: Alice's in-memory tasks do not leak to Bob
  assert.strictEqual(useTaskStore.getState().tasks.length, 0, 'Alice tasks must not be visible in Bob session');
  passed++;
  console.log(`  ✓ [PASS ${passed}] 6.1: Zero state leakage between User A and User B`);

  // --- SECTION 7: UI Verification (No Raw UID Exposure & Clean Distinctions) ---
  console.log('\n--- Section 7: UI & Code Grounding Invariants ---');

  const settingsContent = fs.readFileSync('src/modules/settings/SettingsView.tsx', 'utf-8');

  // Rule 1 & 7: Never display raw Firebase UID in the user-facing UI
  assert(!settingsContent.includes('{authUser.uid}'), 'Raw authUser.uid must NOT be displayed in SettingsView');
  passed++;
  console.log(`  ✓ [PASS ${passed}] 7.1: Zero raw Firebase UID exposure in SettingsView`);

  // Rule 2: Clearly distinguish "Upgrade / Link this workspace" and "Sign in to another account"
  assert(settingsContent.includes('Upgrade / Link this workspace'), 'Must include English "Upgrade / Link this workspace"');
  assert(settingsContent.includes('ترقية / ربط مساحة العمل'), 'Must include Arabic "ترقية / ربط مساحة العمل"');
  assert(settingsContent.includes('Sign in to another account'), 'Must include English "Sign in to another account"');
  assert(settingsContent.includes('تسجيل الدخول بحساب آخر'), 'Must include Arabic "تسجيل الدخول بحساب آخر"');
  passed++;
  console.log(`  ✓ [PASS ${passed}] 7.2: SettingsView clearly distinguishes Workspace Link vs Account Switch`);

  // Verify authService is utilized
  assert(settingsContent.includes('linkAnonymousWithEmail'), 'SettingsView must integrate linkAnonymousWithEmail');
  assert(settingsContent.includes('signUpWithEmail'), 'SettingsView must integrate signUpWithEmail');
  assert(settingsContent.includes('signInWithEmail'), 'SettingsView must integrate signInWithEmail');
  assert(settingsContent.includes('signOutUser'), 'SettingsView must integrate signOutUser');
  passed++;
  console.log(`  ✓ [PASS ${passed}] 7.3: SettingsView integrates all authService operations`);

  console.log('\n====================================================');
  console.log(`ALL ${passed} GATE 19.2A TESTS PASSED PERFECTLY!`);
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('\n❌ Gate 19.2A Test Failed:', err);
  process.exit(1);
});
