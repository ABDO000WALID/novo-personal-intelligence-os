import { useState, KeyboardEvent } from 'react';
import { useApp } from '../../core/providers/AppContext';
import { useChatStore } from '../../core/state/chatStore';
import { useTaskStore } from '../../core/state/taskStore';
import { useIntelligence } from '../../core/intelligence';
import { parseCommand } from '../../core/commands';
import ProactiveOSSurface from "./components/ProactiveOSSurface";
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
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Calendar,
  Activity,
  Award,
  BarChart3,
  Lightbulb,
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

  const createConversation = useChatStore(state => state.createConversation);
  
  const {
    productivity,
    productivityScore,
    novoScore,
    briefing,
    weeklyReview,
    dailyGoalAlignment,
    insights,
    activityTimeline,
    nextAction,
  } = useIntelligence();

  // جلبنا دالة إنشاء المهمة هنا
  const toggleTask = useTaskStore(state => state.toggleTask);
  const createTask = useTaskStore(state => state.createTask);

  const handleExecuteNextAction = async () => {
    if (nextAction.type !== 'existing_task') {
      return;
    }
    await toggleTask(nextAction.selectedTaskId);
  };

  // دالة التعامل مع إنشاء مهمة جديدة
  const handleCreateNextAction = async (title: string) => {
    await createTask(title);
  };

  const handleSendPrompt = () => {
    const trimmed = inputPrompt.trim();
    if (!trimmed) return;

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
      <section className="space-y-4">
        <div className="text-center space-y-2 pt-1">
          <div className="relative inline-flex items-center justify-center">
            <div className="absolute -inset-2 bg-gradient-to-tr from-violet-600/25 via-indigo-500/15 to-cyan-500/15 rounded-3xl blur-lg -z-10" />
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 p-[1.5px] shadow-lg shadow-violet-950/60">
              <div className="w-full h-full rounded-2xl bg-[#090a14] flex items-center justify-center">
                <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-violet-300"/>
              </div>
            </div>
          </div>

          <div className="space-y-1 max-w-lg mx-auto">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-violet-950/50 border border-violet-800/40 text-violet-300 text-[11px] font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>{isAr ? briefing.greetingAr : briefing.greeting}</span>
              </span>

              <button
                id="btn-toggle-score-breakdown"
                onClick={() => setShowScoreBreakdown(!showScoreBreakdown)}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-900/80 hover:bg-zinc-850 border border-zinc-700/60 text-zinc-200 text-[11px] font-mono shadow-xs cursor-pointer transition-colors"
                title={isAr ? 'عرض تفاصيل نتيجة NOVO' : 'View score breakdown'}
              >
                <TrendingUp className="w-3 h-3 text-violet-400"/>
                <span>{isAr ? 'نتيجة NOVO:' : 'NOVO Score:'}</span>
                <span className="font-bold text-violet-300">{productivityScore}/100</span>
                <span className="text-[10px] text-zinc-400">
                  • {isAr ? novoScore.labelAr : novoScore.label}
                </span>
                {showScoreBreakdown ? (
                  <ChevronUp className="w-3 h-3 text-zinc-400"/>
                ) : (
                  <ChevronDown className="w-3 h-3 text-zinc-400"/>
                )}
              </button>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {isAr ? 'مساحة ذكائك الشخصي' : 'Personal Intelligence Workspace'}
            </h1>
          </div>
        </div>

        {showScoreBreakdown && (
          <div
            id="novo-score-breakdown-card"
            className="p-4 rounded-xl bg-zinc-900/80 border border-violet-500/40 shadow-lg space-y-3 animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-violet-400"/>
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

        {/* تم تمرير الدالة الجديدة هنا */}
        <ProactiveOSSurface 
          onExecuteNextAction={handleExecuteNextAction} 
          onCreateNextAction={handleCreateNextAction} 
        />

        {/* Home metrics and additional panels */}
      </section>
    </div>
  );
}