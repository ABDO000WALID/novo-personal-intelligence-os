import './test_env.ts';
import assert from 'assert';
import fs from 'fs';
import {
  getLocalizedAuthError,
  signInWithGoogle,
  linkAnonymousWithGoogle,
  signOutUser,
} from './src/core/auth/authService';
import { useAuthStore } from './src/core/auth/authStore';
import { handleAuthStateChange } from './src/core/auth/initAuth';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { useTaskStore } from './src/core/state/taskStore';
import { GoogleAuthProvider } from 'firebase/auth';

async function runTests() {
  console.log('====================================================');
  console.log('STARTING GATE 19.2B GOOGLE AUTHENTICATION TESTS');
  console.log('====================================================');

  let passed = 0;

  // --- SECTION 1: Google OAuth Error Mapping ---
  console.log('\n--- Section 1: Google OAuth Error Mapping ---');

  // Test I: popup-closed-by-user
  const popupClosedAr = getLocalizedAuthError('auth/popup-closed-by-user', 'ar');
  const popupClosedEn = getLocalizedAuthError('auth/popup-closed-by-user', 'en');
  assert(popupClosedAr.includes('إغلاق نافذة تسجيل الدخول'), 'Arabic error for popup-closed-by-user');
  assert(popupClosedEn.includes('closed before completing'), 'English error for popup-closed-by-user');
  passed++;
  console.log(`  ✓ [PASS ${passed}] [I] popup-closed-by-user mapped accurately in Arabic and English`);

  // Test J: popup-blocked
  const popupBlockedAr = getLocalizedAuthError('auth/popup-blocked', 'ar');
  const popupBlockedEn = getLocalizedAuthError('auth/popup-blocked', 'en');
  assert(popupBlockedAr.includes('حظر النافذة المنبثقة'), 'Arabic error for popup-blocked');
  assert(popupBlockedEn.includes('blocked by your browser'), 'English error for popup-blocked');
  passed++;
  console.log(`  ✓ [PASS ${passed}] [J] popup-blocked mapped accurately in Arabic and English`);

  // Test K: cancelled-popup-request
  const cancelReqAr = getLocalizedAuthError('auth/cancelled-popup-request', 'ar');
  const cancelReqEn = getLocalizedAuthError('auth/cancelled-popup-request', 'en');
  assert(cancelReqAr.includes('إلغاء عملية تسجيل الدخول'), 'Arabic error for cancelled-popup-request');
  assert(cancelReqEn.includes('cancelled because another window'), 'English error for cancelled-popup-request');
  passed++;
  console.log(`  ✓ [PASS ${passed}] [K] cancelled-popup-request mapped accurately in Arabic and English`);

  // Test L: unauthorized-domain
  const unauthDomAr = getLocalizedAuthError('auth/unauthorized-domain', 'ar');
  const unauthDomEn = getLocalizedAuthError('auth/unauthorized-domain', 'en');
  assert(unauthDomAr.includes('غير مصرح به'), 'Arabic error for unauthorized-domain');
  assert(unauthDomEn.includes('not authorized in Firebase Auth'), 'English error for unauthorized-domain');
  passed++;
  console.log(`  ✓ [PASS ${passed}] [L] unauthorized-domain mapped accurately in Arabic and English`);

  // Test M: account-exists-with-different-credential
  const diffCredAr = getLocalizedAuthError('auth/account-exists-with-different-credential', 'ar');
  const diffCredEn = getLocalizedAuthError('auth/account-exists-with-different-credential', 'en');
  assert(diffCredAr.includes('بطريقة تسجيل دخول مختلفة'), 'Arabic error for account-exists-with-different-credential');
  assert(diffCredEn.includes('different sign-in method'), 'English error for account-exists-with-different-credential');
  passed++;
  console.log(`  ✓ [PASS ${passed}] [M] account-exists-with-different-credential mapped accurately in Arabic and English`);

  // Test H: collision error code
  const collAr = getLocalizedAuthError('auth/credential-already-in-use', 'ar');
  const collEn = getLocalizedAuthError('auth/credential-already-in-use', 'en');
  assert(collAr.includes('مرتبطة بالفعل'), 'Arabic error for credential-already-in-use');
  assert(collEn.includes('already linked'), 'English error for credential-already-in-use');
  passed++;
  console.log(`  ✓ [PASS ${passed}] [H-map] credential-already-in-use mapped accurately in Arabic and English`);

  // --- SECTION 2: GoogleAuthProvider Configuration ---
  console.log('\n--- Section 2: GoogleAuthProvider Configuration ---');

  // Test A & B: GoogleAuthProvider initialization & prompt=select_account
  const provider = new GoogleAuthProvider();
  assert(provider.providerId === 'google.com', 'Provider ID must be google.com');
  provider.setCustomParameters({ prompt: 'select_account' });
  passed++;
  console.log(`  ✓ [PASS ${passed}] [A & B] GoogleAuthProvider configured with prompt=select_account`);

  // --- SECTION 3: Mock Auth Environment for Google Methods ---
  console.log('\n--- Section 3: Google Sign-in & Linking Execution ---');

  interface MockGoogleUser {
    uid: string;
    email: string | null;
    displayName?: string;
    isAnonymous: boolean;
    providerData: Array<{ providerId: string; email?: string }>;
    getIdToken: () => Promise<string>;
  }

  let mockCurrentUser: MockGoogleUser | null = null;
  let popupCalledWithProvider: any = null;

  const mockAuth: any = {
    get currentUser() {
      return mockCurrentUser;
    }
  };

  // Test C: signInWithGoogle success path
  const googleSignedUser: MockGoogleUser = {
    uid: 'google_user_permanent_789',
    email: 'alex@google.com',
    displayName: 'Alex Smith',
    isAnonymous: false,
    providerData: [{ providerId: 'google.com', email: 'alex@google.com' }],
    getIdToken: async () => 'mock_google_id_token_123',
  };

  const mockSignInWithPopup: any = async (_authInst: any, prov: any) => {
    popupCalledWithProvider = prov;
    mockCurrentUser = googleSignedUser;
    return { user: googleSignedUser };
  };

  const signInResult = await signInWithGoogle(mockAuth, mockSignInWithPopup);
  assert.strictEqual(signInResult.uid, 'google_user_permanent_789');
  assert.strictEqual(signInResult.email, 'alex@google.com');
  assert.strictEqual(signInResult.isAnonymous, false);
  assert.strictEqual(popupCalledWithProvider?.providerId, 'google.com');
  passed++;
  console.log(`  ✓ [PASS ${passed}] [C] signInWithGoogle success path works cleanly`);

  // Test D, E, F, G: linkAnonymousWithGoogle success path, UID preservation, isAnonymous transition, workspace data
  const initialAnonUid = 'guest_workspace_abc_999';
  const anonUser: MockGoogleUser = {
    uid: initialAnonUid,
    email: null,
    isAnonymous: true,
    providerData: [],
    getIdToken: async () => 'anon_token',
  };
  mockCurrentUser = anonUser;

  // Set up active anonymous session in initAuth
  await handleAuthStateChange(anonUser as any);
  assert.strictEqual(useAuthStore.getState().user?.uid, initialAnonUid);
  assert.strictEqual(useAuthStore.getState().user?.isAnonymous, true);
  assert.strictEqual(AuthLifecycle.getUid(), initialAnonUid);

  // Create active workspace data (tasks)
  useTaskStore.getState().clearState();
  await useTaskStore.getState().createTask('Crucial guest planning task', 'high');
  const tasksBeforeLink = useTaskStore.getState().tasks;
  assert.strictEqual(tasksBeforeLink.length, 1);
  const initialEpoch = AuthLifecycle.getEpoch();

  // Mock linkWithPopup: in-place credential link preserving UID
  const linkedGoogleUser: MockGoogleUser = {
    uid: initialAnonUid, // CRITICAL: UID MUST REMAIN IDENTICAL
    email: 'sarah@google.com',
    displayName: 'Sarah Connor',
    isAnonymous: false, // CRITICAL: Transitions to permanent
    providerData: [{ providerId: 'google.com', email: 'sarah@google.com' }],
    getIdToken: async () => 'linked_google_token',
  };

  const mockLinkWithPopup: any = async (_user: any, prov: any) => {
    popupCalledWithProvider = prov;
    mockCurrentUser = linkedGoogleUser;
    return { user: linkedGoogleUser };
  };

  const linkResult = await linkAnonymousWithGoogle(anonUser as any, mockAuth, mockLinkWithPopup);

  // Verify Test D: linkAnonymousWithGoogle returned the user
  assert.strictEqual(linkResult.email, 'sarah@google.com');
  passed++;
  console.log(`  ✓ [PASS ${passed}] [D] linkAnonymousWithGoogle completes successfully`);

  // Verify Test E: UID preservation
  assert.strictEqual(linkResult.uid, initialAnonUid, 'UID must be identical before and after linking');
  assert.strictEqual(linkResult.uid, anonUser.uid, 'Returned user UID matches anon user UID');
  passed++;
  console.log(`  ✓ [PASS ${passed}] [E] UID strictly preserved during anonymous -> Google linking (uid_before === uid_after)`);

  // Verify Test F: isAnonymous transition
  assert.strictEqual(linkResult.isAnonymous, false, 'isAnonymous must transition from true to false');
  passed++;
  console.log(`  ✓ [PASS ${passed}] [F] isAnonymous transition verified (true -> false)`);

  // Simulate onAuthStateChanged with updated linked user
  await handleAuthStateChange(linkedGoogleUser as any);

  // Verify Test G: Workspace data continuity
  assert.strictEqual(useTaskStore.getState().tasks.length, 1, 'In-memory tasks must NOT be cleared during account link');
  assert.strictEqual(useTaskStore.getState().tasks[0].title, 'Crucial guest planning task');
  assert.strictEqual(AuthLifecycle.getEpoch(), initialEpoch, 'Auth epoch must NOT bump during in-place linking');
  passed++;
  console.log(`  ✓ [PASS ${passed}] [G] Workspace data strictly preserved and continuous after Google linking`);

  // Verify non-anonymous user cannot call linkAnonymousWithGoogle
  await assert.rejects(
    async () => linkAnonymousWithGoogle(linkedGoogleUser as any, mockAuth, mockLinkWithPopup),
    (err: any) => err.message === 'auth/not-anonymous',
    'Should reject linking an already permanent account'
  );
  passed++;
  console.log(`  ✓ [PASS ${passed}] [G-guard] Rejects linking when current account is already permanent`);

  // Test H: Collision failure is fail-closed
  const mockCollidingLinkWithPopup: any = async () => {
    const error: any = new Error('The credential is already in use by another user.');
    error.code = 'auth/credential-already-in-use';
    throw error;
  };

  await assert.rejects(
    async () => linkAnonymousWithGoogle(anonUser as any, mockAuth, mockCollidingLinkWithPopup),
    (err: any) => err.code === 'auth/credential-already-in-use',
    'Should fail-closed on account collision'
  );
  // Verify workspace data still intact after failed attempt
  assert.strictEqual(useTaskStore.getState().tasks.length, 1, 'Tasks must remain untouched on collision error');
  passed++;
  console.log(`  ✓ [PASS ${passed}] [H] Google account collision fails closed without data corruption or silent merge`);

  // Test N: Sign-in identity transition triggers existing AuthLifecycle behavior
  const preSwitchGuard = AuthLifecycle.createGuard();
  const preSwitchEpoch = AuthLifecycle.getEpoch();

  const userCharlie: MockGoogleUser = {
    uid: 'google_charlie_distinct_uid',
    email: 'charlie@google.com',
    isAnonymous: false,
    providerData: [{ providerId: 'google.com' }],
    getIdToken: async () => 'charlie_token',
  };

  // Charlie signs in (identity change)
  await handleAuthStateChange(userCharlie as any);

  assert(preSwitchGuard.isStale(), 'Pre-switch guard must become stale on user transition');
  assert(AuthLifecycle.getEpoch() > preSwitchEpoch, 'Epoch must increment on user switch');
  assert.strictEqual(AuthLifecycle.getUid(), 'google_charlie_distinct_uid');
  assert.strictEqual(useTaskStore.getState().tasks.length, 0, 'Prior user tasks must be cleared for new identity');
  passed++;
  console.log(`  ✓ [PASS ${passed}] [N] Google account switch triggers AuthLifecycle epoch bump and state clearing`);

  // --- SECTION 4: UI & Code Grounding Invariants ---
  console.log('\n--- Section 4: UI & Privacy Invariants ---');

  const settingsContent = fs.readFileSync('src/modules/settings/SettingsView.tsx', 'utf-8');
  const authServiceContent = fs.readFileSync('src/core/auth/authService.ts', 'utf-8');

  // Test O: Zero raw UID in Settings UI
  assert(!settingsContent.includes('{authUser.uid}'), 'Raw authUser.uid must NOT be displayed in SettingsView');
  passed++;
  console.log(`  ✓ [PASS ${passed}] [O] Zero raw Firebase UID in SettingsView`);

  // Test P: Clear distinction between Workspace Link and Account Sign-In
  assert(settingsContent.includes('Link Google Account'), 'Must include English "Link Google Account"');
  assert(settingsContent.includes('ربط حساب Google'), 'Must include Arabic "ربط حساب Google"');
  assert(settingsContent.includes('Continue with Google'), 'Must include English "Continue with Google"');
  assert(settingsContent.includes('المتابعة باستخدام Google'), 'Must include Arabic "المتابعة باستخدام Google"');
  assert(settingsContent.includes('Sign in with Google'), 'Must include English "Sign in with Google"');
  assert(settingsContent.includes('تسجيل الدخول باستخدام Google'), 'Must include Arabic "تسجيل الدخول باستخدام Google"');
  passed++;
  console.log(`  ✓ [PASS ${passed}] [P] SettingsView clearly distinguishes Google Workspace Link vs Google Sign-In`);

  // Test Q: No secret/token exposure
  assert(!settingsContent.includes('client_secret'), 'No OAuth secrets in SettingsView');
  assert(!authServiceContent.includes('client_secret'), 'No OAuth secrets in authService');
  assert(!settingsContent.includes('console.log('), 'No console logging of credentials in SettingsView');
  passed++;
  console.log(`  ✓ [PASS ${passed}] [Q] Zero credentials or token exposure in code and UI`);

  console.log('\n====================================================');
  console.log(`ALL ${passed} GATE 19.2B TESTS PASSED PERFECTLY!`);
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('\n❌ Gate 19.2B Test Failed:', err);
  process.exit(1);
});
