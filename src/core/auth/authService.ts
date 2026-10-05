import {
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  linkWithCredential,
  EmailAuthProvider,
  User,
  Auth,
} from 'firebase/auth';
import { auth } from './firebase';

/**
 * Localized Firebase Auth error mapping for English and Arabic.
 */
export const getLocalizedAuthError = (
  error: unknown,
  lang: 'ar' | 'en' = 'en'
): string => {
  let code = '';
  if (typeof error === 'string') {
    code = error;
  } else if (error && typeof error === 'object' && 'code' in error) {
    code = String((error as { code: unknown }).code);
  } else if (error && typeof error === 'object' && 'message' in error) {
    code = String((error as { message: unknown }).message);
  }

  const isAr = lang === 'ar';

  if (code.includes('auth/email-already-in-use') || code.includes('email-already-in-use')) {
    return isAr
      ? 'عنوان البريد الإلكتروني هذا مستخدم بالفعل بحساب آخر.'
      : 'This email address is already in use by another account.';
  }

  if (code.includes('auth/invalid-credential') || code.includes('invalid-credential')) {
    return isAr
      ? 'بيانات الاعتماد غير صالحة. يرجى التحقق من البريد الإلكتروني وكلمة المرور.'
      : 'Invalid credentials. Please verify your email and password.';
  }

  if (code.includes('auth/wrong-password') || code.includes('wrong-password')) {
    return isAr
      ? 'كلمة المرور غير صحيحة. يرجى المحاولة مرة أخرى.'
      : 'Incorrect password. Please try again.';
  }

  if (code.includes('auth/user-not-found') || code.includes('user-not-found')) {
    return isAr
      ? 'لم يتم العثور على حساب بهذا البريد الإلكتروني.'
      : 'No account found with this email address.';
  }

  if (code.includes('auth/weak-password') || code.includes('weak-password')) {
    return isAr
      ? 'كلمة المرور ضعيفة جداً. يجب أن تتكون من 6 أحرف على الأقل.'
      : 'Password is too weak. Please use at least 6 characters.';
  }

  if (code.includes('auth/too-many-requests') || code.includes('too-many-requests')) {
    return isAr
      ? 'تم تعطيل الوصول مؤقتاً بسبب تكرار المحاولات. يرجى المحاولة لاحقاً.'
      : 'Access temporarily disabled due to too many failed attempts. Please try again later.';
  }

  if (code.includes('auth/network-request-failed') || code.includes('network-request-failed')) {
    return isAr
      ? 'خطأ في الشبكة. يرجى التحقق من اتصال الإنترنت.'
      : 'Network error. Please check your internet connection.';
  }

  if (code.includes('auth/invalid-email') || code.includes('invalid-email')) {
    return isAr
      ? 'يرجى إدخال عنوان بريد إلكتروني صالح.'
      : 'Please enter a valid email address.';
  }

  if (code.includes('auth/credential-already-in-use') || code.includes('credential-already-in-use')) {
    return isAr
      ? 'بيانات الاعتماد هذه مرتبطة بالفعل بحساب مستخدم آخر.'
      : 'This credential is already linked to another account.';
  }

  if (code.includes('auth/no-current-user') || code.includes('no-current-user')) {
    return isAr
      ? 'لا توجد جلسة ضيف نشطة لترقيتها أو ربطها.'
      : 'No active guest session found to upgrade or link.';
  }

  if (code.includes('auth/not-anonymous') || code.includes('not-anonymous')) {
    return isAr
      ? 'الحساب الحالي دائم بالفعل ولا يحتاج إلى ربط.'
      : 'Current account is already a permanent account.';
  }

  return isAr
    ? 'حدث خطأ أثناء المصادقة. يرجى المحاولة مرة أخرى.'
    : 'An authentication error occurred. Please try again.';
};

/**
 * Sign in anonymously (guest workspace).
 */
export const signInAnonymousUser = async (
  authInstance: Auth | null = auth
): Promise<User> => {
  if (!authInstance) {
    throw new Error('Firebase Auth is not initialized');
  }
  const result = await signInAnonymously(authInstance);
  return result.user;
};

/**
 * Create a new account with email and password.
 */
export const signUpWithEmail = async (
  email: string,
  pass: string,
  authInstance: Auth | null = auth
): Promise<User> => {
  if (!authInstance) {
    throw new Error('Firebase Auth is not initialized');
  }
  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    throw new Error('auth/invalid-email');
  }
  if (!pass || pass.length < 6) {
    throw new Error('auth/weak-password');
  }
  const result = await createUserWithEmailAndPassword(authInstance, trimmedEmail, pass);
  return result.user;
};

/**
 * Sign in with email and password to an existing account.
 */
export const signInWithEmail = async (
  email: string,
  pass: string,
  authInstance: Auth | null = auth
): Promise<User> => {
  if (!authInstance) {
    throw new Error('Firebase Auth is not initialized');
  }
  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    throw new Error('auth/invalid-email');
  }
  const result = await signInWithEmailAndPassword(authInstance, trimmedEmail, pass);
  return result.user;
};

/**
 * Link an existing anonymous account with email and password credentials.
 * Preserves the exact same Firebase UID.
 */
export const linkAnonymousWithEmail = async (
  email: string,
  pass: string,
  currentUser: User | null = auth?.currentUser || null,
  authInstance: Auth | null = auth
): Promise<User> => {
  const user = currentUser || authInstance?.currentUser;
  if (!user) {
    throw new Error('auth/no-current-user');
  }
  if (!user.isAnonymous) {
    throw new Error('auth/not-anonymous');
  }
  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    throw new Error('auth/invalid-email');
  }
  if (!pass || pass.length < 6) {
    throw new Error('auth/weak-password');
  }

  const credential = EmailAuthProvider.credential(trimmedEmail, pass);
  const userCredential = await linkWithCredential(user, credential);
  return userCredential.user;
};

/**
 * Sign out the current user.
 */
export const signOutUser = async (
  authInstance: Auth | null = auth
): Promise<void> => {
  if (!authInstance) return;
  await signOut(authInstance);
};
