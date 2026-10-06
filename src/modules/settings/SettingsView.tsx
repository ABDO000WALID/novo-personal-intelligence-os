import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { useApp } from '../../core/providers/AppContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../core/auth/authStore';
import {
  signInAnonymousUser,
  signInWithEmail,
  signUpWithEmail,
  linkAnonymousWithEmail,
  signInWithGoogle,
  linkAnonymousWithGoogle,
  signOutUser,
  getLocalizedAuthError,
} from '../../core/auth/authService';
import {
  backupService,
  BackupStats,
  NovoBackup,
  ValidationResult,
} from '../../core/storage/backupService';
import { NOVO_STORAGE_EVENT } from '../../core/storage/storageService';
import {
  Settings,
  Languages,
  Server,
  Shield,
  Layers,
  CheckCircle2,
  HardDrive,
  Download,
  Upload,
  AlertTriangle,
  FileCheck,
  Check,
  X,
  Database,
  FileText,
  Target,
  CheckSquare,
  Clock,
  DollarSign,
  MessageSquare,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import { Gate174Tier2FixtureSection } from './components/Gate174Tier2FixtureSection';

export function SettingsView() {
  const { language, setLanguage } = useApp();
  const isAr = language === 'ar';
  const { user: authUser, loading: authLoading } = useAuthStore();

  // Auth Form State
  const [authMode, setAuthMode] = useState<'none' | 'link' | 'signin' | 'signup'>('none');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const handleSignInAnonymous = async () => {
    try {
      setAuthSubmitting(true);
      setAuthError(null);
      await signInAnonymousUser();
      setAuthMode('none');
    } catch (err) {
      setAuthError(getLocalizedAuthError(err, language));
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignInGoogle = async () => {
    try {
      setAuthSubmitting(true);
      setAuthError(null);
      await signInWithGoogle();
      setAuthMode('none');
    } catch (err) {
      setAuthError(getLocalizedAuthError(err, language));
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLinkGoogle = async () => {
    try {
      setAuthSubmitting(true);
      setAuthError(null);
      await linkAnonymousWithGoogle(authUser);
      setAuthMode('none');
    } catch (err) {
      setAuthError(getLocalizedAuthError(err, language));
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword) {
      setAuthError(isAr ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill in all required fields');
      return;
    }
    if (authPassword.length < 6) {
      setAuthError(getLocalizedAuthError('auth/weak-password', language));
      return;
    }

    try {
      setAuthSubmitting(true);
      setAuthError(null);
      if (authMode === 'link') {
        await linkAnonymousWithEmail(authEmail, authPassword, authUser);
      } else if (authMode === 'signup') {
        await signUpWithEmail(authEmail, authPassword);
      } else if (authMode === 'signin') {
        await signInWithEmail(authEmail, authPassword);
      }
      setAuthMode('none');
      setAuthEmail('');
      setAuthPassword('');
    } catch (err) {
      setAuthError(getLocalizedAuthError(err, language));
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setAuthSubmitting(true);
      setAuthError(null);
      await signOutUser();
      setAuthMode('none');
      setAuthEmail('');
      setAuthPassword('');
    } catch (err) {
      setAuthError(getLocalizedAuthError(err, language));
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Storage stats
  const [stats, setStats] = useState<BackupStats | null>(null);
  
  useEffect(() => {
    backupService.getStorageStats().then(setStats);
  }, []);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Import flow state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<NovoBackup | null>(null);
  const [pendingStats, setPendingStats] = useState<BackupStats | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  const refreshStats = async () => { setStats(await backupService.getStorageStats()); };

  useEffect(() => {
    const handleUpdate = () => {
      refreshStats();
    };
    window.addEventListener(NOVO_STORAGE_EVENT, handleUpdate);
    return () => window.removeEventListener(NOVO_STORAGE_EVENT, handleUpdate);
  }, []);

  const handleExport = async () => {
    await backupService.exportBackup();
    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 3000);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res: ValidationResult = backupService.validateBackup(content);

      if (res.valid && res.backup && res.stats) {
        setPendingBackup(res.backup);
        setPendingStats(res.stats);
        setValidationError(null);
      } else {
        setPendingBackup(null);
        setPendingStats(null);
        setValidationError(
          isAr
            ? res.errorAr || 'ملف غير صالح للاستيراد'
            : res.error || 'Invalid backup file'
        );
      }
    };
    reader.readAsText(file);
    // Reset file input so user can choose the same file again if desired
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!pendingBackup) return;

    const success = await backupService.importBackup(pendingBackup);
    if (success) {
      setImportSuccess(true);
      setPendingBackup(null);
      setPendingStats(null);
      refreshStats();
      setTimeout(() => setImportSuccess(false), 4000);
    } else {
      setValidationError(
        isAr ? 'فشلت عملية استيراد البيانات' : 'Failed to import backup data'
      );
    }
  };

  const handleCancelImport = () => {
    setPendingBackup(null);
    setPendingStats(null);
    setValidationError(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 1. Header */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-600/20 to-indigo-900/10 border border-violet-500/30 text-violet-400 shadow-sm shadow-violet-950/40">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-zinc-100">
                {isAr ? 'إعدادات مساحة العمل والبيئة' : 'Workspace & System Settings'}
              </h1>
              <Badge variant="violet" className="text-[10px] py-0 px-2">v0.2 Intelligence</Badge>
            </div>
            <p className="text-xs text-zinc-400">
              {isAr
                ? 'إدارة اللغة، النسخ الاحتياطي، وحالة التخزين المحلي'
                : 'Language preferences, local backups, and storage integrity'}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* User Account & Workspace Identity Card */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
            <div className="flex items-center gap-2.5">
              <UserIcon className="w-4 h-4 text-violet-400" />
              <div>
                <h2 className="text-sm font-medium text-zinc-200">
                  {isAr ? 'حساب المستخدم ومساحة العمل' : 'User Account & Workspace'}
                </h2>
                <p className="text-xs text-zinc-500">
                  {isAr ? 'إدارة الهوية وترقية مساحة العمل' : 'Identity and workspace management'}
                </p>
              </div>
            </div>
            {authLoading ? (
              <span className="text-xs text-zinc-500">{isAr ? 'جاري التحميل...' : 'Loading...'}</span>
            ) : authUser ? (
              <Badge variant={authUser.isAnonymous ? 'outline' : 'violet'}>
                {authUser.isAnonymous
                  ? (isAr ? 'حساب ضيف مؤقت' : 'Temporary Guest Account')
                  : (isAr ? 'حساب دائم' : 'Permanent Account')}
              </Badge>
            ) : (
              <Badge variant="default">
                {isAr ? 'غير مسجل الدخول' : 'Not Signed In'}
              </Badge>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-zinc-300">
                {authUser ? (
                  authUser.isAnonymous ? (
                    <span className="text-zinc-400">
                      {isAr
                        ? 'أنت تعمل حالياً في مساحة عمل كضيف. البيانات محفوظة محلياً.'
                        : 'Working in a guest workspace. Data is stored locally.'}
                    </span>
                  ) : (
                    <span>
                      {isAr ? 'مسجل الدخول كـ: ' : 'Signed in as: '}{' '}
                      <span className="font-medium text-zinc-200">{authUser.email || (isAr ? 'حساب دائم' : 'Permanent User')}</span>
                    </span>
                  )
                ) : (
                  <span className="text-zinc-500">
                    {isAr ? 'غير مسجل الدخول' : 'Not signed in'}
                  </span>
                )}
              </div>

              {authMode === 'none' && (
                <div className="flex flex-wrap items-center gap-2">
                  {!authUser ? (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={handleSignInGoogle}
                        disabled={authSubmitting || authLoading}
                        className="flex items-center gap-1.5"
                      >
                        {isAr ? 'المتابعة باستخدام Google' : 'Continue with Google'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSignInAnonymous}
                        disabled={authSubmitting || authLoading}
                      >
                        {isAr ? 'دخول كضيف (مجهول)' : 'Continue as Guest'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setAuthMode('signin'); setAuthError(null); }}
                        disabled={authSubmitting || authLoading}
                      >
                        {isAr ? 'تسجيل الدخول / إنشاء حساب' : 'Sign In / Register'}
                      </Button>
                    </>
                  ) : authUser.isAnonymous ? (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={handleLinkGoogle}
                        disabled={authSubmitting || authLoading}
                        className="flex items-center gap-1.5"
                      >
                        {isAr ? 'ربط حساب Google' : 'Link Google Account'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setAuthMode('link'); setAuthError(null); }}
                        disabled={authSubmitting || authLoading}
                      >
                        {isAr ? 'ترقية / ربط مساحة العمل' : 'Upgrade / Link this workspace'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setAuthMode('signin'); setAuthError(null); }}
                        disabled={authSubmitting || authLoading}
                      >
                        {isAr ? 'تسجيل الدخول بحساب آخر' : 'Sign in to another account'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSignOut}
                        disabled={authSubmitting || authLoading}
                      >
                        {isAr ? 'تسجيل الخروج' : 'Sign Out'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSignOut}
                      disabled={authSubmitting || authLoading}
                    >
                      {isAr ? 'تسجيل الخروج' : 'Sign Out'}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Inline Auth / Upgrade Form */}
            {authMode !== 'none' && (
              <form onSubmit={handleAuthSubmit} className="mt-2 p-3.5 rounded-lg border border-zinc-800 bg-zinc-900/60 space-y-3">
                <div className="border-b border-zinc-800 pb-2">
                  <h3 className="text-xs font-semibold text-zinc-200">
                    {authMode === 'link'
                      ? (isAr ? 'ترقية وربط مساحة العمل بحساب دائم' : 'Upgrade & Link Workspace to Permanent Account')
                      : authMode === 'signup'
                      ? (isAr ? 'إنشاء حساب جديد' : 'Create New Account')
                      : (isAr ? 'تسجيل الدخول بحساب آخر' : 'Sign In to Account')}
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {authMode === 'link'
                      ? (isAr
                          ? 'ستظل جميع مهامك وأهدافك وملاحظاتك ومحادثاتك الحالية مرتبطة بحسابك الجديد دون فقدان.'
                          : 'All your existing tasks, goals, notes, and chats will remain attached to your permanent account.')
                      : authMode === 'signup'
                      ? (isAr ? 'أنشئ حساباً دائماً للوصول إلى مساحة العمل الخاصة بك.' : 'Create a permanent account to access your workspace.')
                      : authUser?.isAnonymous
                      ? (isAr
                          ? 'ملاحظة: هذا الإجراء سينقلك إلى مساحة عمل الحساب المسجل بدلاً من بيانات الضيف الحالية.'
                          : 'Note: This switches to your registered account workspace rather than current guest data.')
                      : (isAr ? 'أدخل البريد الإلكتروني وكلمة المرور للمتابعة.' : 'Enter your email and password to proceed.')}
                  </p>
                </div>

                {authMode === 'signin' && (
                  <div className="pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleSignInGoogle}
                      disabled={authSubmitting}
                      className="w-full flex items-center justify-center gap-2 mb-2"
                    >
                      <span>{isAr ? 'تسجيل الدخول باستخدام Google' : 'Sign in with Google'}</span>
                    </Button>
                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-zinc-800"></div>
                      <span className="flex-shrink mx-2 text-[10px] text-zinc-500 uppercase">
                        {isAr ? 'أو عبر البريد الإلكتروني' : 'Or with Email'}
                      </span>
                      <div className="flex-grow border-t border-zinc-800"></div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">
                      {isAr ? 'البريد الإلكتروني' : 'Email Address'}
                    </label>
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="user@example.com"
                      required
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-800/80 border border-zinc-700/80 rounded text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">
                      {isAr ? 'كلمة المرور (6 أحرف على الأقل)' : 'Password (min. 6 characters)'}
                    </label>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={6}
                      required
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-800/80 border border-zinc-700/80 rounded text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>

                {authError && (
                  <div className="p-2 rounded bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                    <span>{authError}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-800/60">
                  <div className="flex items-center gap-2">
                    {authMode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => { setAuthMode('signup'); setAuthError(null); }}
                        className="text-[11px] text-violet-400 hover:text-violet-300 hover:underline"
                      >
                        {isAr ? 'ليس لديك حساب؟ أنشئ حساباً جديداً' : 'Need an account? Register'}
                      </button>
                    )}
                    {authMode === 'signup' && (
                      <button
                        type="button"
                        onClick={() => { setAuthMode('signin'); setAuthError(null); }}
                        className="text-[11px] text-violet-400 hover:text-violet-300 hover:underline"
                      >
                        {isAr ? 'لديك حساب بالفعل؟ تسجيل الدخول' : 'Already have an account? Sign in'}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => { setAuthMode('none'); setAuthError(null); }}
                      disabled={authSubmitting}
                    >
                      {isAr ? 'إلغاء' : 'Cancel'}
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      variant="primary"
                      disabled={authSubmitting}
                    >
                      {authSubmitting
                        ? (isAr ? 'جاري المعالجة...' : 'Processing...')
                        : authMode === 'link'
                        ? (isAr ? 'تأكيد الترقية والربط' : 'Confirm Upgrade & Link')
                        : authMode === 'signup'
                        ? (isAr ? 'إنشاء الحساب' : 'Create Account')
                        : (isAr ? 'تسجيل الدخول' : 'Sign In')}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </Card>

        {/* 2. Language Selection Card */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
            <div className="flex items-center gap-2.5">
              <Languages className="w-4 h-4 text-violet-400" />
              <div>
                <h2 className="text-sm font-medium text-zinc-200">
                  {isAr ? 'لغة الواجهة والاتجاه' : 'Interface Language & Direction'}
                </h2>
                <p className="text-xs text-zinc-500">
                  {isAr
                    ? 'التبديل بين العربية (RTL) والإنجليزية (LTR)'
                    : 'Switch between Arabic (RTL) and English (LTR)'}
                </p>
              </div>
            </div>
            <Badge variant="default">
              {language === 'ar' ? 'العربية (افتراضي)' : 'English'}
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            <Button
              id="settings-lang-ar-btn"
              variant={language === 'ar' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setLanguage('ar')}
              className="flex items-center gap-2"
            >
              <span>العربية (RTL)</span>
              {language === 'ar' && <CheckCircle2 className="w-3.5 h-3.5" />}
            </Button>

            <Button
              id="settings-lang-en-btn"
              variant={language === 'en' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setLanguage('en')}
              className="flex items-center gap-2"
            >
              <span>English (LTR)</span>
              {language === 'en' && <CheckCircle2 className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </Card>

        {/* 3. Data Management Card (Export, Import, Storage Stats) */}
        <Card id="settings-data-management-card" className="space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
            <div className="flex items-center gap-2.5">
              <HardDrive className="w-4 h-4 text-violet-400" />
              <div>
                <h2 className="text-sm font-medium text-zinc-200">
                  {isAr ? 'إدارة البيانات والنسخ الاحتياطي' : 'Data Management & Local Backups'}
                </h2>
                <p className="text-xs text-zinc-500">
                  {isAr
                    ? 'تصدير واستيراد بيانات NOVO محلياً بصيغة JSON بدون اتصال سحابي'
                    : 'Export and import your NOVO workspace securely in JSON format'}
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
              {stats?.sizeKb} KB
            </span>
          </div>

          {/* Storage Information Status Banner */}
          <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <div className="text-xs font-medium text-zinc-200">
                  {isAr ? 'بيانات محلية: محفوظة بأمان في هذا المتصفح' : 'Local Data: Stored securely in this browser'}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {isAr
                    ? 'لا تغادر أي معلومة جهازك. تحكم كامل وحرية تامة.'
                    : 'Zero cloud dependencies. Your data never leaves your device.'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 self-start sm:self-auto">
              <span>{isAr ? 'إجمالي العناصر:' : 'Total records:'}</span>
              <span className="px-2 py-0.5 rounded bg-violet-950/50 text-violet-300 border border-violet-800/50 font-bold">
                {stats?.totalItems}
              </span>
            </div>
          </div>

          {/* Storage Item Breakdown Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="p-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/60 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <FileText className="w-3.5 h-3.5 text-zinc-500" />
                <span>{isAr ? 'الملاحظات' : 'Notes'}</span>
              </span>
              <span className="font-mono text-zinc-200 font-semibold">{stats?.notesCount}</span>
            </div>

            <div className="p-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/60 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <Target className="w-3.5 h-3.5 text-indigo-400" />
                <span>{isAr ? 'الأهداف' : 'Goals'}</span>
              </span>
              <span className="font-mono text-zinc-200 font-semibold">{stats?.goalsCount}</span>
            </div>

            <div className="p-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/60 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isAr ? 'المهام' : 'Tasks'}</span>
              </span>
              <span className="font-mono text-zinc-200 font-semibold">{stats?.tasksCount}</span>
            </div>

            <div className="p-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/60 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>{isAr ? 'جلسات التركيز' : 'Focus'}</span>
              </span>
              <span className="font-mono text-zinc-200 font-semibold">{stats?.focusSessionsCount}</span>
            </div>

            <div className="p-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/60 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isAr ? 'المعاملات المالية' : 'Transactions'}</span>
              </span>
              <span className="font-mono text-zinc-200 font-semibold">{stats?.transactionsCount}</span>
            </div>

            <div className="p-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/60 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                <span>{isAr ? 'المحادثات' : 'Conversations'}</span>
              </span>
              <span className="font-mono text-zinc-200 font-semibold">{stats?.conversationsCount}</span>
            </div>

            <div className="p-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/60 flex items-center justify-between col-span-2">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <Database className="w-3.5 h-3.5 text-violet-400" />
                <span>{isAr ? 'المعرفة والذاكرة' : 'Knowledge & Memory'}</span>
              </span>
              <span className="font-mono text-zinc-200 font-semibold">{stats?.knowledgeCount}</span>
            </div>
          </div>

          {/* Action Buttons: Export & Import */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              id="settings-export-backup-btn"
              variant="secondary"
              size="sm"
              onClick={handleExport}
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4 text-violet-400" />
              <span>{isAr ? 'تصدير نسخة احتياطية (JSON)' : 'Export NOVO Data (JSON)'}</span>
            </Button>

            {/* Hidden file input for import */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json,application/json"
              className="hidden"
            />

            <Button
              id="settings-import-backup-btn"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2"
            >
              <Upload className="w-4 h-4 text-indigo-400" />
              <span>{isAr ? 'استيراد نسخة احتياطية' : 'Import NOVO Backup'}</span>
            </Button>

            {/* Status alerts */}
            {exportSuccess && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-800/40">
                <Check className="w-3.5 h-3.5" />
                <span>{isAr ? 'تم تنزيل ملف النسخة بنجاح!' : 'Backup exported successfully!'}</span>
              </span>
            )}

            {importSuccess && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-800/40">
                <Check className="w-3.5 h-3.5" />
                <span>{isAr ? 'تم استيراد وتحديث البيانات بنجاح!' : 'Backup imported successfully!'}</span>
              </span>
            )}

            {validationError && (
              <span className="inline-flex items-center gap-1.5 text-xs text-rose-400 bg-rose-950/40 px-2.5 py-1 rounded-lg border border-rose-800/40">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{validationError}</span>
              </span>
            )}
          </div>
        </Card>

        {/* 4. Architecture Status Card */}
        <Card className="space-y-4">
          <div className="flex items-center gap-2.5 border-b border-zinc-800/60 pb-3">
            <Layers className="w-4 h-4 text-emerald-400" />
            <div>
              <h2 className="text-sm font-medium text-zinc-200">
                {isAr ? 'حالة البنية التأسيسية للمشروع' : 'Project Architecture Status'}
              </h2>
              <p className="text-xs text-zinc-500">
                {isAr ? 'قواعد البناء والمحركات المعتمدة' : 'Approved development principles & local engines'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-zinc-950/50 border border-zinc-800/50 space-y-1">
              <div className="flex items-center gap-2 text-zinc-300 font-medium">
                <Server className="w-3.5 h-3.5 text-violet-400" />
                <span>{isAr ? 'بيئة العمل المعتمدة' : 'Standard Stack'}</span>
              </div>
              <p className="text-zinc-500">
                React 19 + TypeScript + Vite + Tailwind CSS 4
              </p>
            </div>

            <div className="p-3 rounded-lg bg-zinc-950/50 border border-zinc-800/50 space-y-1">
              <div className="flex items-center gap-2 text-zinc-300 font-medium">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isAr ? 'خصوصية كاملة وذكاء محلي' : 'Local Intelligence'}</span>
              </div>
              <p className="text-zinc-500">
                {isAr
                  ? 'محركات رياضية وقواعد محلية دون ذكاء اصطناعي خارجي'
                  : 'Deterministic rule-based engines, zero external AI APIs'}
              </p>
            </div>
          </div>
        </Card>

        {/* 5. Dev-Only: Gate 17.4 Tier 2 Test Fixture */}
        {import.meta.env.DEV && (
          <Gate174Tier2FixtureSection isAr={isAr} />
        )}
      </div>

      {/* 6. Import Confirmation Modal */}
      {pendingBackup && pendingStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div
            id="import-confirmation-dialog"
            className="w-full max-w-lg bg-zinc-900 border border-violet-500/40 rounded-2xl p-5 shadow-2xl shadow-black space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-violet-950/80 border border-violet-800/50 text-violet-400">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    {isAr ? 'تأكيد استيراد النسخة الاحتياطية' : 'Confirm Backup Import'}
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    {isAr
                      ? 'تم التحقق من سلامة الملف بنجاح. راجع المحتويات قبل المتابعة.'
                      : 'File validated successfully. Review contents before proceeding.'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCancelImport}
                className="p-1 rounded text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Warning note */}
            <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/40 text-amber-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div className="space-y-0.5">
                <span className="font-semibold">
                  {isAr ? 'تنبيه استبدال البيانات:' : 'Data Replacement Notice:'}
                </span>
                <p className="text-amber-300/80 leading-relaxed text-[11px]">
                  {isAr
                    ? 'سيؤدي هذا الإجراء إلى استبدال السجلات الحالية في هذا المتصفح بالسجلات الموجودة داخل ملف النسخة الاحتياطية.'
                    : 'This action will overwrite current browser data with records contained in the backup file.'}
                </p>
              </div>
            </div>

            {/* Breakdown of incoming data */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-zinc-300">
                {isAr ? 'محتويات ملف النسخة:' : 'Backup Contents:'}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-500">{isAr ? 'الملاحظات' : 'Notes'}</div>
                  <div className="font-mono text-zinc-100 font-bold">{pendingStats.notesCount}</div>
                </div>
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-500">{isAr ? 'الأهداف' : 'Goals'}</div>
                  <div className="font-mono text-zinc-100 font-bold">{pendingStats.goalsCount}</div>
                </div>
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-500">{isAr ? 'المهام' : 'Tasks'}</div>
                  <div className="font-mono text-zinc-100 font-bold">{pendingStats.tasksCount}</div>
                </div>
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-500">{isAr ? 'التركيز' : 'Focus'}</div>
                  <div className="font-mono text-zinc-100 font-bold">{pendingStats.focusSessionsCount}</div>
                </div>
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-500">{isAr ? 'المعاملات' : 'Transactions'}</div>
                  <div className="font-mono text-zinc-100 font-bold">{pendingStats.transactionsCount}</div>
                </div>
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-500">{isAr ? 'المحادثات' : 'Chat'}</div>
                  <div className="font-mono text-zinc-100 font-bold">{pendingStats.conversationsCount}</div>
                </div>
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800 col-span-2">
                  <div className="text-[10px] text-zinc-500">{isAr ? 'المعرفة' : 'Knowledge'}</div>
                  <div className="font-mono text-zinc-100 font-bold">{pendingStats.knowledgeCount}</div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
              <Button variant="ghost" size="sm" onClick={handleCancelImport}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                id="btn-confirm-import-backup"
                size="sm"
                onClick={handleConfirmImport}
                className="bg-violet-600 hover:bg-violet-500 text-white"
              >
                <Check className="w-4 h-4 me-1.5" />
                <span>{isAr ? 'تأكيد واستبدال البيانات' : 'Confirm & Overwrite Data'}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
