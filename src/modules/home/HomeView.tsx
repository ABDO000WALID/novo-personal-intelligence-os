import { useState, KeyboardEvent } from 'react';
import { useApp } from '../../core/providers/AppContext';
import { useChat } from '../chat/hooks/useChat';
import { useIntelligence } from '../../core/intelligence';
import { parseCommand } from '../../core/commands';
import {
  Sparkles,
  GraduationCap,
  Code2,
  Target,
  Send,
  Paperclip,
  Globe,
  Mic,
  CalendarDays,
  Flame,
  FileText,
  Database,
  Wallet,
  Settings,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  Lightbulb,
  Clock,
  ChevronDown,
  ChevronUp,
  Calendar,
  Layers,
  Activity,
  Award,
  AlertCircle,
  BarChart3,
} from 'lucide-react';
import { RouteId } from '../../types/navigation';

export function HomeView() {
  const { language, setActiveRoute } = useApp();
  const isAr = language === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  const [inputPrompt, setInputPrompt] = useState('');
  const [isWebSearchActive, setIsWebSearchActive] = useState(false);
  const [showScoreBreakdown, setShowScoreBreakdown] = useState(false);
  const [showWeeklyReview, setShowWeeklyReview] = useState(false);

  // Intelligence Layer & Local Core Hook
  const { createConversation } = useChat();
  const {
    productivity,
    goalHealth,
    focus,
    finance,
    knowledge,
    productivityScore,
    novoScore,
    briefing,
    weeklyReview,
    insights,
    topInsight,
    activityTimeline,
  } = useIntelligence();

  const handleSendPrompt = () => {
    const trimmed = inputPrompt.trim();
    if (!trimmed) return;

    // Check if user input matches a local NOVO command
    const parseResult = parseCommand(trimmed);
    if (parseResult.isCommand && parseResult.command?.targetRoute) {
      setActiveRoute(parseResult.command.targetRoute);
      setInputPrompt('');
      return;
    }

    createConversation(undefined, trimmed);
    setInputPrompt('');
    setActiveRoute('chat');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendPrompt();
    }
  };

  const handleActionCardClick = (promptAr: string, promptEn: string, targetRoute?: RouteId) => {
    if (targetRoute && targetRoute !== 'chat') {
      setActiveRoute(targetRoute);
    } else {
      createConversation(undefined, isAr ? promptAr : promptEn);
      setActiveRoute('chat');
    }
  };

  // 4 Primary Suggestion/Action Cards
  const primaryActionCards = [
    {
      id: 'action-ideas',
      titleAr: 'أفكار جديدة',
      titleEn: 'New Ideas',
      descAr: 'ساعدني في توليد أفكار لمشروع أو حلول إبداعية للمشكلات',
      descEn: 'Brainstorm creative project ideas, angles & systematic solutions',
      icon: Sparkles,
      iconBg: 'from-violet-600 to-purple-600',
      borderColor: 'hover:border-violet-500/50',
      targetRoute: 'chat' as RouteId,
    },
    {
      id: 'action-study',
      titleAr: 'الدراسة والتعلم',
      titleEn: 'Study & Learning',
      descAr: 'اشرح لي هذا الموضوع بعمق أو ساعدني في تلخيص واستيعاب المعرفة',
      descEn: 'Synthesize deep topics, break down concepts & test understanding',
      icon: GraduationCap,
      iconBg: 'from-indigo-600 to-blue-600',
      borderColor: 'hover:border-indigo-500/50',
      targetRoute: 'knowledge' as RouteId,
    },
    {
      id: 'action-code',
      titleAr: 'البرمجة والكود',
      titleEn: 'Code & Build',
      descAr: 'ساعدني في كتابة وتصحيح الأكواد وبناء الهياكل البرمجية',
      descEn: 'Write, debug, refactor code & architect clean software systems',
      icon: Code2,
      iconBg: 'from-cyan-600 to-teal-600',
      borderColor: 'hover:border-cyan-500/50',
      targetRoute: 'chat' as RouteId,
    },
    {
      id: 'action-goals',
      titleAr: 'التخطيط والأهداف',
      titleEn: 'Goals & Planning',
      descAr: 'ساعدني في وضع خطة استراتيجية وجدول زمني لتحقيق أهدافي',
      descEn: 'Design milestone roadmaps, break down priorities & habits',
      icon: Target,
      iconBg: 'from-amber-600 to-rose-600',
      borderColor: 'hover:border-amber-500/50',
      targetRoute: 'goals' as RouteId,
    },
  ];

  // Secondary modules grid
  const systemModules = [
    {
      id: 'planner' as RouteId,
      titleAr: 'المخطط اليومي',
      titleEn: 'Daily Planner',
      icon: CalendarDays,
      categoryAr: 'الإنتاجية',
      categoryEn: 'Productivity',
    },
    {
      id: 'goals' as RouteId,
      titleAr: 'الأهداف والمحطات',
      titleEn: 'Goals & Milestones',
      icon: Target,
      categoryAr: 'الإنتاجية',
      categoryEn: 'Productivity',
    },
    {
      id: 'focus' as RouteId,
      titleAr: 'جلسات التركيز',
      titleEn: 'Focus Sessions',
      icon: Flame,
      categoryAr: 'الإنتاجية',
      categoryEn: 'Productivity',
    },
    {
      id: 'notes' as RouteId,
      titleAr: 'الملاحظات والمسودات',
      titleEn: 'Notes & Scratchpad',
      icon: FileText,
      categoryAr: 'المعرفة',
      categoryEn: 'Knowledge',
    },
    {
      id: 'knowledge' as RouteId,
      titleAr: 'خزينة المعرفة',
      titleEn: 'Knowledge Vault',
      icon: Database,
      categoryAr: 'المعرفة',
      categoryEn: 'Knowledge',
    },
    {
      id: 'money' as RouteId,
      titleAr: 'المالية الذكية',
      titleEn: 'Finance Intel',
      icon: Wallet,
      categoryAr: 'المعرفة',
      categoryEn: 'Wealth',
    },
    {
      id: 'settings' as RouteId,
      titleAr: 'إعدادات النظام',
      titleEn: 'System Setup',
      icon: Settings,
      categoryAr: 'النظام',
      categoryEn: 'System',
    },
  ];

  return (
    <div className="max-w-3xl mx-auto py-3 sm:py-6 space-y-6">
      {/* 1. PRIMARY: Editorial Welcome Header & Daily Briefing */}
      <section className="space-y-4">
        {/* Emblem & Greeting */}
        <div className="text-center space-y-2 pt-1">
          <div className="relative inline-flex items-center justify-center">
            <div className="absolute -inset-2 bg-gradient-to-tr from-violet-600/25 via-indigo-500/15 to-cyan-500/15 rounded-3xl blur-lg -z-10" />
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 p-[1.5px] shadow-lg shadow-violet-950/60">
              <div className="w-full h-full rounded-2xl bg-[#090a14] flex items-center justify-center">
                <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-violet-300" />
              </div>
            </div>
          </div>

          <div className="space-y-1 max-w-lg mx-auto">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-violet-950/50 border border-violet-800/40 text-violet-300 text-[11px] font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>{isAr ? briefing.greetingAr : briefing.greeting}</span>
              </span>

              {/* Interactive NOVO Score Badge */}
              <button
                id="btn-toggle-score-breakdown"
                onClick={() => setShowScoreBreakdown(!showScoreBreakdown)}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-900/80 hover:bg-zinc-850 border border-zinc-700/60 text-zinc-200 text-[11px] font-mono shadow-xs cursor-pointer transition-colors"
                title={isAr ? 'عرض تفاصيل نتيجة NOVO' : 'View score breakdown'}
              >
                <TrendingUp className="w-3 h-3 text-violet-400" />
                <span>{isAr ? 'نتيجة NOVO:' : 'NOVO Score:'}</span>
                <span className="font-bold text-violet-300">{productivityScore}/100</span>
                <span className="text-[10px] text-zinc-400">
                  • {isAr ? novoScore.labelAr : novoScore.label}
                </span>
                {showScoreBreakdown ? (
                  <ChevronUp className="w-3 h-3 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-zinc-400" />
                )}
              </button>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {isAr ? 'مساحة ذكائك الشخصي' : 'Personal Intelligence Workspace'}
            </h1>
          </div>
        </div>

        {/* Score Breakdown Dropdown (when expanded) */}
        {showScoreBreakdown && (
          <div
            id="novo-score-breakdown-card"
            className="p-4 rounded-xl bg-zinc-900/80 border border-violet-500/40 shadow-lg space-y-3 animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-violet-400" />
                <span className="text-xs font-semibold text-zinc-200">
                  {isAr ? 'تفصيل نقاط مقياس NOVO' : 'NOVO Score Breakdown'}
                </span>
              </div>
              <span className="text-[11px] font-mono text-violet-300 font-bold">
                {productivityScore} / 100
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <div className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800">
                <div className="text-[10px] text-zinc-400">{isAr ? 'إنجاز المهام' : 'Tasks'}</div>
                <div className="font-mono text-zinc-100 font-bold mt-0.5">
                  {novoScore.breakdown.tasks} <span className="text-zinc-500 font-normal">/35</span>
                </div>
              </div>

              <div className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800">
                <div className="text-[10px] text-zinc-400">{isAr ? 'استمرارية التركيز' : 'Focus'}</div>
                <div className="font-mono text-zinc-100 font-bold mt-0.5">
                  {novoScore.breakdown.focus} <span className="text-zinc-500 font-normal">/20</span>
                </div>
              </div>

              <div className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800">
                <div className="text-[10px] text-zinc-400">{isAr ? 'تقدم الأهداف' : 'Goals'}</div>
                <div className="font-mono text-zinc-100 font-bold mt-0.5">
                  {novoScore.breakdown.goals} <span className="text-zinc-500 font-normal">/25</span>
                </div>
              </div>

              <div className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800">
                <div className="text-[10px] text-zinc-400">{isAr ? 'نشاط التخطيط' : 'Planning'}</div>
                <div className="font-mono text-zinc-100 font-bold mt-0.5">
                  {novoScore.breakdown.planning} <span className="text-zinc-500 font-normal">/10</span>
                </div>
              </div>

              <div className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800 col-span-2 sm:col-span-1">
                <div className="text-[10px] text-zinc-400">{isAr ? 'المعرفة والملاحظات' : 'Knowledge'}</div>
                <div className="font-mono text-zinc-100 font-bold mt-0.5">
                  {novoScore.breakdown.knowledge} <span className="text-zinc-500 font-normal">/10</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Daily Briefing Card */}
        <div
          id="home-daily-briefing-card"
          className="p-4 rounded-2xl bg-gradient-to-b from-zinc-900/80 via-zinc-900/50 to-zinc-950/90 border border-zinc-800/80 shadow-md space-y-3.5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/60 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-violet-950/60 border border-violet-800/40 text-violet-300">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">
                  {isAr ? 'إيجاز اليوم الذكي' : 'Daily Intelligence Briefing'}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {isAr ? briefing.summaryAr : briefing.summary}
                </p>
              </div>
            </div>

            {/* Weekly Review Quick Toggle Button */}
            <button
              id="btn-toggle-weekly-review"
              onClick={() => setShowWeeklyReview(!showWeeklyReview)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-300 hover:text-zinc-100 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/60 transition-colors self-start sm:self-auto cursor-pointer"
            >
              <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
              <span>{isAr ? 'المراجعة الأسبوعية' : 'Weekly Review'}</span>
              {showWeeklyReview ? (
                <ChevronUp className="w-3 h-3 text-zinc-400" />
              ) : (
                <ChevronDown className="w-3 h-3 text-zinc-400" />
              )}
            </button>
          </div>

          {/* Today's Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            {/* 1. Remaining Important Tasks */}
            <button
              onClick={() => setActiveRoute('planner')}
              className="p-2.5 rounded-xl bg-zinc-950/60 hover:bg-zinc-950 border border-zinc-800/70 hover:border-zinc-700 text-start transition-all cursor-pointer"
            >
              <div className="text-[10px] text-zinc-400 font-medium">
                {isAr ? 'مهام ذات أولوية' : 'Important Pending'}
              </div>
              <div className="text-sm font-bold font-mono text-rose-400 mt-0.5">
                {briefing.taskStats.remainingImportant}{' '}
                <span className="text-[10px] text-zinc-500 font-normal">
                  / {briefing.taskStats.pendingCount}
                </span>
              </div>
            </button>

            {/* 2. Tasks Completed Today */}
            <button
              onClick={() => setActiveRoute('planner')}
              className="p-2.5 rounded-xl bg-zinc-950/60 hover:bg-zinc-950 border border-zinc-800/70 hover:border-zinc-700 text-start transition-all cursor-pointer"
            >
              <div className="text-[10px] text-zinc-400 font-medium">
                {isAr ? 'منجزة اليوم' : 'Completed Today'}
              </div>
              <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                {briefing.taskStats.completedToday}{' '}
                <span className="text-[10px] text-zinc-500 font-normal">
                  / {briefing.taskStats.totalToday || productivity.totalTasks}
                </span>
              </div>
            </button>

            {/* 3. Active Goals */}
            <button
              onClick={() => setActiveRoute('goals')}
              className="p-2.5 rounded-xl bg-zinc-950/60 hover:bg-zinc-950 border border-zinc-800/70 hover:border-zinc-700 text-start transition-all cursor-pointer"
            >
              <div className="text-[10px] text-zinc-400 font-medium">
                {isAr ? 'أهداف نشطة' : 'Active Goals'}
              </div>
              <div className="text-sm font-bold font-mono text-indigo-400 mt-0.5">
                {briefing.goalStats.activeCount}{' '}
                <span className="text-[10px] text-zinc-500 font-normal">
                  ({briefing.goalStats.averageProgress}%)
                </span>
              </div>
            </button>

            {/* 4. Focus Time This Week */}
            <button
              onClick={() => setActiveRoute('focus')}
              className="p-2.5 rounded-xl bg-zinc-950/60 hover:bg-zinc-950 border border-zinc-800/70 hover:border-zinc-700 text-start transition-all cursor-pointer"
            >
              <div className="text-[10px] text-zinc-400 font-medium">
                {isAr ? 'تركيز الأسبوع' : 'Weekly Focus'}
              </div>
              <div className="text-sm font-bold font-mono text-amber-400 mt-0.5">
                {briefing.focusStats.weeklyMinutes}{' '}
                <span className="text-[10px] text-zinc-500 font-normal">
                  {isAr ? 'دقيقة' : 'min'}
                </span>
              </div>
            </button>

            {/* 5. Net Balance */}
            <button
              onClick={() => setActiveRoute('money')}
              className="p-2.5 rounded-xl bg-zinc-950/60 hover:bg-zinc-950 border border-zinc-800/70 hover:border-zinc-700 text-start transition-all cursor-pointer col-span-2 sm:col-span-1"
            >
              <div className="text-[10px] text-zinc-400 font-medium">
                {isAr ? 'الرصيد المالي' : 'Current Balance'}
              </div>
              <div className="text-sm font-bold font-mono text-zinc-100 mt-0.5">
                ${briefing.moneyStats.balance.toFixed(0)}
              </div>
            </button>
          </div>

          {/* Local Intelligent Recommendation Banner */}
          <div className="p-3 rounded-xl bg-violet-950/30 border border-violet-800/40 flex items-start gap-2.5 text-xs">
            <Sparkles className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 flex-1 min-w-0">
              <span className="font-semibold text-violet-200">
                {isAr ? 'توصية NOVO اليومية:' : 'NOVO Recommendation:'}
              </span>
              <p className="text-zinc-300 leading-relaxed text-[11px]">
                {isAr ? briefing.recommendationAr : briefing.recommendation}
              </p>
            </div>
          </div>
        </div>

        {/* Weekly Review Section (when toggled open) */}
        {showWeeklyReview && (
          <div
            id="home-weekly-review-card"
            className="p-4 rounded-2xl bg-zinc-900/90 border border-indigo-500/40 shadow-xl space-y-3.5 animate-in fade-in duration-200"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                <div>
                  <h3 className="text-xs font-semibold text-zinc-100">
                    {isAr ? 'مراجعة الأسبوع التحليلية' : 'Weekly Retrospective & Intelligence'}
                  </h3>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {weeklyReview.weekStart} – {weeklyReview.weekEnd}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowWeeklyReview(false)}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                {isAr ? 'إخفاء' : 'Close'}
              </button>
            </div>

            {/* Weekly Summary */}
            <p className="text-xs text-zinc-300 bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/80 leading-relaxed">
              {isAr ? weeklyReview.summaryAr : weeklyReview.summary}
            </p>

            {/* Weekly Metrics Matrix */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
              <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                <div className="text-[10px] text-zinc-500">{isAr ? 'إنجاز المهام' : 'Tasks Completed'}</div>
                <div className="text-sm font-bold text-emerald-400 mt-0.5">
                  {weeklyReview.tasksCompleted} / {weeklyReview.tasksCreated} ({weeklyReview.taskCompletionRate}%)
                </div>
              </div>

              <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                <div className="text-[10px] text-zinc-500">{isAr ? 'جلسات ودقائق التركيز' : 'Focus Time'}</div>
                <div className="text-sm font-bold text-amber-400 mt-0.5">
                  {weeklyReview.focusMinutes} min ({weeklyReview.focusSessions} sess)
                </div>
              </div>

              <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                <div className="text-[10px] text-zinc-500">{isAr ? 'الأهداف المحدثة' : 'Goals Updated'}</div>
                <div className="text-sm font-bold text-indigo-400 mt-0.5">
                  {weeklyReview.goalsProgressed} goals
                </div>
              </div>

              <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                <div className="text-[10px] text-zinc-500">{isAr ? 'التدفق المالي' : 'Cashflow'}</div>
                <div className="text-sm font-bold text-zinc-100 mt-0.5">
                  +${weeklyReview.income} / -${weeklyReview.expenses}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 2. UNIVERSAL NOVO INPUT (Preserved Anchor) */}
      <section className="space-y-2.5">
        <div className="relative rounded-2xl bg-gradient-to-b from-[#0e101c]/95 via-[#090b14]/95 to-[#07080f] border border-zinc-800/70 border-t-zinc-700/50 hover:border-zinc-700 focus-within:border-violet-500/50 focus-within:ring-1 focus-within:ring-violet-500/20 shadow-xl shadow-black/60 transition-all p-3.5 sm:p-4">
          <textarea
            id="home-main-chat-input"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder={
              isAr
                ? 'اكتب رسالتك لـ NOVO هنا لبدء محادثة فورية، أو اسأله عن أي مهمة أو فكرة...'
                : 'Message NOVO to launch an instant conversation, plan a project, or capture a thought...'
            }
            className="w-full bg-transparent resize-none text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none leading-relaxed"
          />

          {/* Bottom Utility Bar */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800/50 mt-2">
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors cursor-pointer"
                title={isAr ? 'إرفاق ملف' : 'Attach file'}
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setIsWebSearchActive(!isWebSearchActive)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs ${
                  isWebSearchActive
                    ? 'text-violet-300 bg-violet-950/60 border border-violet-800/50'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
                title={isAr ? 'البحث عبر الويب' : 'Search web'}
              >
                <Globe className="w-3.5 h-3.5" />
                <span className="hidden sm:inline-block text-[10px]">
                  {isAr ? 'الويب' : 'Web'}
                </span>
              </button>

              <button
                type="button"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors cursor-pointer"
                title={isAr ? 'التحدث بالصوت' : 'Voice mode'}
              >
                <Mic className="w-3.5 h-3.5" />
              </button>

              <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-900/60 border border-zinc-800/60 text-[10px] text-zinc-400 font-mono">
                <Sparkles className="w-3 h-3 text-violet-400" />
                <span>NOVO Local Core</span>
              </div>
            </div>

            {/* Send Button */}
            <button
              id="home-send-prompt-btn"
              type="button"
              onClick={handleSendPrompt}
              className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 active:scale-95 text-white flex items-center justify-center shadow-md shadow-violet-950/60 transition-all cursor-pointer"
              title={isAr ? 'إرسال وبدء المحادثة' : 'Send & Start Chat'}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-2 text-[10px] text-zinc-500 font-mono">
          <span>{isAr ? 'Enter للإرسال وبدء المحادثة' : 'Enter to send & launch thread'}</span>
          <span className="hidden sm:inline-block">
            {isAr ? 'حفظ محلي آمن ومشفر' : 'Local Persistence Active'}
          </span>
        </div>
      </section>

      {/* 3. COMPACT NOVO INSIGHTS SECTION (Max 2-3 important insights) */}
      {insights.length > 0 && (
        <section id="home-insights-section" className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-medium tracking-wide uppercase text-zinc-400 flex items-center gap-1.5 font-mono">
              <Lightbulb className="w-3.5 h-3.5 text-violet-400" />
              <span>{isAr ? 'إرشادات ورؤى NOVO' : 'NOVO Insights'}</span>
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              {Math.min(insights.length, 3)} {isAr ? 'تنبيهات محلية' : 'active insights'}
            </span>
          </div>

          <div className="space-y-2">
            {insights.slice(0, 3).map((insight) => (
              <div
                key={insight.id}
                className="relative overflow-hidden p-3 rounded-xl bg-gradient-to-r from-violet-950/15 via-zinc-900/60 to-zinc-950 border border-zinc-800/70 hover:border-violet-700/50 shadow-xs transition-all duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                  <div
                    className={`p-1.5 rounded-lg border shrink-0 mt-0.5 sm:mt-0 ${
                      insight.priority === 'high'
                        ? 'bg-rose-950/30 border-rose-800/40 text-rose-300'
                        : insight.priority === 'medium'
                          ? 'bg-amber-950/30 border-amber-800/40 text-amber-300'
                          : 'bg-violet-950/30 border-violet-800/40 text-violet-300'
                    }`}
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-200 truncate">
                        {isAr ? insight.titleAr : insight.title}
                      </span>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full border ${
                          insight.priority === 'high'
                            ? 'bg-rose-950/40 text-rose-300 border-rose-800/40'
                            : insight.priority === 'medium'
                              ? 'bg-amber-950/40 text-amber-300 border-amber-800/40'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}
                      >
                        {isAr
                          ? insight.priority === 'high'
                            ? 'أولوية'
                            : insight.priority === 'medium'
                              ? 'ملاحظة'
                              : 'توجيه'
                          : insight.priority}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-1 leading-relaxed">
                      {isAr ? insight.descriptionAr : insight.description}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setActiveRoute(
                      (insight.module || insight.relatedModule || 'planner') as RouteId
                    )
                  }
                  className="flex items-center gap-1 text-xs font-medium text-violet-300 hover:text-violet-200 transition-colors self-end sm:self-auto shrink-0 cursor-pointer"
                >
                  <span>
                    {isAr
                      ? insight.actionLabelAr || 'عرض والتنفيذ'
                      : insight.actionLabel || 'Review & Act'}
                  </span>
                  <ArrowIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. TERTIARY: Recent Activity Preview (Subtle timeline) */}
      {activityTimeline.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-medium tracking-wide uppercase text-zinc-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-violet-400" />
              <span>{isAr ? 'آخر النشاطات عبر المساحة' : 'Recent Workspace Activity'}</span>
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              {activityTimeline.length} {isAr ? 'أحداث' : 'events'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {activityTimeline.slice(0, 3).map((act) => (
              <div
                key={act.id}
                onClick={() => setActiveRoute(act.module as RouteId)}
                className="p-2.5 rounded-xl bg-zinc-900/30 hover:bg-zinc-900/60 border border-zinc-800/50 hover:border-zinc-700/70 transition-all cursor-pointer space-y-1"
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                  <span className="uppercase text-violet-300 font-semibold">{act.module}</span>
                  <span className="text-zinc-500">
                    {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="text-xs font-medium text-zinc-200 truncate">
                  {isAr ? act.titleAr || act.title : act.title}
                </div>
                <p className="text-[10px] text-zinc-400 truncate">
                  {isAr ? act.descriptionAr || act.description : act.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. Primary Actions (Quick Launch Accelerators) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium tracking-wide uppercase text-zinc-400">
            {isAr ? 'مسارات الانطلاق السريع' : 'Quick Launch Accelerators'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {primaryActionCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.id}
                id={card.id}
                onClick={() =>
                  handleActionCardClick(card.descAr, card.descEn, card.targetRoute)
                }
                className={`group p-3.5 rounded-xl bg-zinc-900/30 hover:bg-zinc-900/60 border border-zinc-800/50 hover:border-zinc-700/70 shadow-xs transition-all duration-150 cursor-pointer flex items-start gap-3 ${card.borderColor}`}
              >
                <div
                  className={`w-9 h-9 rounded-lg bg-gradient-to-tr ${card.iconBg} flex items-center justify-center text-white shrink-0 shadow-xs group-hover:scale-105 transition-transform duration-150`}
                >
                  <Icon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-zinc-200 group-hover:text-white transition-colors">
                      {isAr ? card.titleAr : card.titleEn}
                    </h2>
                    <ArrowIcon className="w-3 h-3 text-zinc-600 group-hover:text-zinc-300 transition-all group-hover:translate-x-0.5" />
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed line-clamp-2">
                    {isAr ? card.descAr : card.descEn}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 6. Secondary Navigation: System Modules */}
      <section className="pt-3 border-t border-zinc-800/50 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            {isAr ? 'أدوات ومساحات NOVO' : 'Workspace Modules'}
          </h2>
          <span className="text-[10px] text-zinc-500 font-mono">
            {systemModules.length + 2} {isAr ? 'وجهات متكاملة' : 'Destinations'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {systemModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.id}
                id={`quick-mod-${mod.id}`}
                type="button"
                onClick={() => setActiveRoute(mod.id)}
                className="p-2.5 rounded-xl bg-zinc-900/20 hover:bg-zinc-900/50 border border-zinc-800/40 hover:border-zinc-700/60 text-start transition-all duration-150 cursor-pointer group flex items-center gap-2"
              >
                <div className="p-1.5 rounded-lg bg-zinc-950/80 border border-zinc-800/50 text-zinc-400 group-hover:text-violet-300 group-hover:border-violet-800/30 transition-colors shrink-0">
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="truncate">
                  <div className="text-xs font-medium text-zinc-300 group-hover:text-zinc-100 truncate">
                    {isAr ? mod.titleAr : mod.titleEn}
                  </div>
                  <div className="text-[9px] text-zinc-500 truncate font-mono">
                    {isAr ? mod.categoryAr : mod.categoryEn}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
