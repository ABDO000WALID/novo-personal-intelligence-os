import React from 'react';
import { useGoalStore } from '../../core/state/goalStore';
import { useTaskStore } from '../../core/state/taskStore';
import { useApp } from '../../core/providers/AppContext';
import { useFocusStore } from '../../core/state/focusStore';
import { useKnowledgeStore } from '../../core/state/knowledgeStore';
import { useNoteStore } from '../../core/state/noteStore';
import { useIntelligence } from '../../core/intelligence';
import {
  X,
  CheckCircle2,
  Play,
  Pause,
  Target,
  Flame,
  Volume2,
  Quote,
  TrendingUp,
  Check,
  Database,
  Pin,
  Sparkles,
  Clock,
} from 'lucide-react';

export function RightPanel() {
  const { isRightPanelOpen, setIsRightPanelOpen, language, setActiveRoute } = useApp();
  const isAr = language === 'ar';

  const tasks = useTaskStore(state => state.tasks);
  const toggleTask = useTaskStore(state => state.toggleTask);
  const goals = useGoalStore(state => state.goals);
  const initializeFocus = useFocusStore(state => state.initialize);
  const initializeTasks = useTaskStore(state => state.initialize);
  const initializeGoals = useGoalStore(state => state.initialize);
  const initializeNotes = useNoteStore(state => state.initialize);
  
  React.useEffect(() => {
    initializeFocus();
    initializeTasks();
    initializeGoals();
    initializeNotes();
  }, [initializeFocus, initializeTasks, initializeGoals, initializeNotes]);
  const activeState = useFocusStore(state => state.activeState);
  const displaySeconds = useFocusStore(state => state.displaySeconds);
  const startSession = useFocusStore(state => state.startSession);
  const pauseTimer = useFocusStore(state => state.pauseTimer);
  const resumeTimer = useFocusStore(state => state.resumeTimer);
  const sessions = useFocusStore(state => state.sessions);
  const knowledgeItems = useKnowledgeStore(state => state.knowledge);
  const pinnedKnowledge = React.useMemo(() => knowledgeItems.filter(k => k.pinned), [knowledgeItems]);
  const {
    productivity,
    goalHealth,
    focus: focusSummary,
    productivityScore,
    novoScore,
    topInsight,
    activityTimeline,
  } = useIntelligence();

  const topTasks = tasks.slice(0, 4);
  const topGoals = goals.slice(0, 3);
  const primaryKnowledge = pinnedKnowledge.length > 0 ? pinnedKnowledge[0] : knowledgeItems[0];

  const hours = Math.floor(displaySeconds / 3600);
  const minutes = Math.floor((displaySeconds % 3600) / 60);
  const seconds = displaySeconds % 60;
  const formattedTimer = hours > 0 
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  if (!isRightPanelOpen) {
    return null;
  }

  return (
    <>
      {/* Mobile Backdrop for Right Panel */}
      <div
        className="fixed inset-0 z-40 bg-black/75 backdrop-blur-xs xl:hidden"
        onClick={() => setIsRightPanelOpen(false)}
      />

      {/* Right Intelligence Panel Container */}
      <aside
        id="right-context-panel"
        className={`fixed xl:sticky top-0 z-50 h-screen w-72 shrink-0 border-s border-zinc-800/50 bg-[#07080f]/95 xl:bg-[#07080f]/75 backdrop-blur-md p-3 flex flex-col gap-3 overflow-y-auto transition-transform duration-200 scrollbar-thin ${
          isAr ? 'left-0 xl:left-auto' : 'right-0 xl:right-auto'
        }`}
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800/50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-zinc-300">
              {isAr ? 'لوحة المعلومات' : 'Personal Intelligence'}
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveRoute('home')}
              className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-violet-950/60 border border-violet-800/50 text-violet-300 font-bold hover:bg-violet-900/60 transition-colors cursor-pointer flex items-center gap-1"
              title={isAr ? `نتيجة NOVO: ${novoScore.labelAr}` : `NOVO Score: ${novoScore.label}`}
            >
              <span>{productivityScore}/100</span>
              <span className="text-[8px] opacity-75">• {isAr ? novoScore.labelAr : novoScore.label}</span>
            </button>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-800/30 text-emerald-300">
              {isAr ? 'مباشر' : 'Live'}
            </span>
            <button
              id="close-right-panel-btn"
              type="button"
              onClick={() => setIsRightPanelOpen(false)}
              className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60 transition-colors cursor-pointer"
              title={isAr ? 'إغلاق اللوحة' : 'Close Panel'}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 1. Today's Overview & Priorities Widget (Today's Progress) */}
        <div className="p-3 rounded-xl bg-zinc-900/30 border border-zinc-800/50 space-y-2.5">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setActiveRoute('planner')}
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-200 hover:text-violet-300 transition-colors text-start"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-violet-400" />
              <span>{isAr ? 'أولويات اليوم' : "Today's Priorities"}</span>
            </button>
            <span className="text-[10px] text-zinc-500 font-mono">
              {productivity.completedTasks}/{productivity.totalTasks}
              {productivity.todayTasks > 0 && ` (${productivity.todayCompletedTasks}/${productivity.todayTasks})`}
            </span>
          </div>

          <div className="space-y-1.5">
            {topTasks.length === 0 ? (
              <p className="text-[11px] text-zinc-500 py-1 text-center">
                {isAr ? 'لا توجد مهام مسجلة' : 'No tasks recorded'}
              </p>
            ) : (
              topTasks.map((task) => {
                const isDone = task.completed;
                return (
                  <div
                    key={task.id}
                    onClick={() => toggleTask(task.id)}
                    className={`p-2 rounded-lg border transition-all duration-150 flex items-start gap-2 cursor-pointer select-none group ${
                      isDone
                        ? 'bg-zinc-950/30 border-zinc-800/30 text-zinc-500 opacity-70'
                        : 'bg-zinc-900/40 hover:bg-zinc-900/70 border-zinc-800/50 hover:border-zinc-700 text-zinc-200'
                    }`}
                  >
                    <button
                      type="button"
                      className={`mt-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                        isDone
                          ? 'bg-emerald-600 text-white'
                          : 'border border-zinc-600 group-hover:border-violet-400'
                      }`}
                    >
                      {isDone && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-[11px] font-normal leading-snug truncate ${
                          isDone ? 'line-through text-zinc-500' : 'text-zinc-200'
                        }`}
                      >
                        {task.title}
                      </p>
                      <div className="flex items-center justify-between pt-0.5 text-[9px] text-zinc-500">
                        <span className="font-mono">{task.date}</span>
                        <span
                          className={`px-1 py-0.2 rounded font-mono border ${
                            task.priority === 'high'
                              ? 'bg-rose-950/40 text-rose-300 border-rose-800/40'
                              : task.priority === 'medium'
                                ? 'bg-amber-950/40 text-amber-300 border-amber-800/40'
                                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          {task.priority}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 2. Focus Activity (Focus Timer & Today's Activity) */}
        <div className="p-2.5 rounded-xl bg-zinc-900/25 border border-zinc-800/40 flex items-center justify-between gap-2">
          <div
            onClick={() => setActiveRoute('focus')}
            className="flex items-center gap-2 cursor-pointer"
          >
            <div className="p-1.5 rounded-lg bg-amber-950/30 border border-amber-800/30 text-amber-400">
              <Flame className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-zinc-200">
                {isAr ? 'جلسة التركيز' : 'Focus Session'}
              </div>
              <div className="text-[10px] text-zinc-500 font-mono">
                {focusSummary.todayFocusMinutes > 0
                  ? `${focusSummary.todayFocusMinutes} ${isAr ? 'د اليوم' : 'min today'}`
                  : `${sessions.length} ${isAr ? 'مكتملة' : 'done'}`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-bold font-mono text-zinc-100">
              {formattedTimer}
            </span>
            <button
              type="button"
              onClick={() => {
                if (!activeState) {
                  startSession('stopwatch');
                } else if (activeState.status === 'running') {
                  pauseTimer();
                } else {
                  resumeTimer();
                }
              }}
              className={`w-7 h-7 rounded-full text-white flex items-center justify-center transition-all cursor-pointer ${
                activeState?.status === 'running'
                  ? 'bg-amber-600 hover:bg-amber-500'
                  : 'bg-violet-600 hover:bg-violet-500'
              }`}
              title={activeState?.status === 'running' ? 'إيقاف' : 'بدء التركيز'}
            >
              {activeState?.status === 'running' ? (
                <Pause className="w-3 h-3 fill-white" />
              ) : (
                <Play className="w-3 h-3 fill-white translate-x-0.5" />
              )}
            </button>
          </div>
        </div>

        {/* 3. Active Goals Progress */}
        <div className="p-3 rounded-xl bg-zinc-900/25 border border-zinc-800/40 space-y-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setActiveRoute('goals')}
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-200 hover:text-indigo-300 transition-colors text-start"
            >
              <Target className="w-3.5 h-3.5 text-indigo-400" />
              <span>{isAr ? 'الأهداف النشطة' : 'Active Goals'}</span>
            </button>
            <div className="flex items-center gap-1.5">
              <span
                className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full border ${
                  goalHealth.healthStatus === 'excellent'
                    ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40'
                    : goalHealth.healthStatus === 'good'
                      ? 'bg-indigo-950/40 text-indigo-300 border-indigo-800/40'
                      : goalHealth.healthStatus === 'needs_attention'
                        ? 'bg-amber-950/40 text-amber-300 border-amber-800/40'
                        : 'bg-rose-950/40 text-rose-300 border-rose-800/40'
                }`}
              >
                {isAr
                  ? goalHealth.healthStatus === 'excellent'
                    ? 'ممتاز'
                    : goalHealth.healthStatus === 'good'
                      ? 'جيد'
                      : goalHealth.healthStatus === 'needs_attention'
                        ? 'تنبيه'
                        : 'خطر'
                  : goalHealth.healthStatus.replace('_', ' ')}
              </span>
              <TrendingUp className="w-3 h-3 text-emerald-400" />
            </div>
          </div>

          <div className="space-y-2 text-xs">
            {topGoals.length === 0 ? (
              <p className="text-[11px] text-zinc-500 py-1 text-center">
                {isAr ? 'لا توجد أهداف مسجلة' : 'No goals recorded'}
              </p>
            ) : (
              topGoals.map((g) => (
                <div
                  key={g.id}
                  onClick={() => setActiveRoute('goals')}
                  className="space-y-1 p-2 rounded-lg bg-zinc-950/40 border border-zinc-800/40 cursor-pointer hover:border-zinc-700 transition-all"
                >
                  <div className="flex items-center justify-between text-zinc-300">
                    <span className="text-[11px] font-normal truncate">{g.title}</span>
                    <span className="text-violet-300 font-mono text-[10px]">
                      {g.progress}%
                    </span>
                  </div>
                  <div className="w-full h-1 bg-zinc-800/80 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        g.progress >= 100
                          ? 'bg-emerald-500'
                          : 'bg-gradient-to-r from-violet-600 to-indigo-500'
                      }`}
                      style={{ width: `${g.progress}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 4. Important Insight Widget (Top Insight) */}
        {topInsight && (
          <div
            onClick={() => setActiveRoute((topInsight.module || topInsight.relatedModule || 'planner') as any)}
            className="p-2.5 rounded-xl bg-violet-950/20 border border-violet-800/30 hover:border-violet-700/50 space-y-1.5 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-violet-400" />
                <span className="text-[11px] font-medium text-violet-200">
                  {isAr ? 'توجيه ذكي' : 'Smart Insight'}
                </span>
              </div>
              <span
                className={`text-[8px] font-mono px-1.5 py-0.2 rounded uppercase border ${
                  topInsight.priority === 'high'
                    ? 'bg-rose-950/50 text-rose-300 border-rose-800/40'
                    : topInsight.priority === 'medium'
                      ? 'bg-amber-950/50 text-amber-300 border-amber-800/40'
                      : 'bg-violet-950/50 text-violet-300 border-violet-800/40'
                }`}
              >
                {topInsight.priority}
              </span>
            </div>
            <p className="text-[11px] font-medium text-zinc-200 truncate">
              {isAr ? topInsight.titleAr : topInsight.title}
            </p>
            <p className="text-[10px] text-zinc-400 leading-relaxed line-clamp-2">
              {isAr ? topInsight.descriptionAr : topInsight.description}
            </p>
            {topInsight.actionLabel && (
              <div className="pt-0.5 flex justify-end">
                <span className="text-[10px] text-violet-300 hover:text-violet-200 font-medium">
                  {isAr ? topInsight.actionLabelAr : topInsight.actionLabel} &rarr;
                </span>
              </div>
            )}
          </div>
        )}

        {/* 5. Knowledge & Personal Memory Widget (Compact supporting) */}
        <div className="p-3 rounded-xl bg-zinc-900/25 border border-zinc-800/40 space-y-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setActiveRoute('knowledge')}
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-200 hover:text-violet-300 transition-colors text-start cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 text-violet-400" />
              <span>{isAr ? 'الذاكرة والمعرفة' : 'Knowledge Memory'}</span>
            </button>
            <span className="text-[10px] text-zinc-500 font-mono">
              {knowledgeItems.length} {isAr ? 'عنصر' : 'items'}
            </span>
          </div>

          {primaryKnowledge ? (
            <div
              onClick={() => setActiveRoute('knowledge')}
              className="p-2 rounded-lg bg-zinc-950/40 border border-zinc-800/40 hover:border-violet-700/40 transition-all cursor-pointer space-y-1"
            >
              <div className="flex items-center justify-between gap-1 text-[11px] font-medium text-zinc-200">
                <span className="truncate">{primaryKnowledge.title}</span>
                {primaryKnowledge.pinned && (
                  <Pin className="w-3 h-3 text-amber-400 fill-amber-400/20 shrink-0" />
                )}
              </div>
              <p className="text-[10px] text-zinc-500 line-clamp-2 leading-relaxed">
                {primaryKnowledge.content}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500 py-1 text-center">
              {isAr ? 'لا توجد عناصر محفوظة' : 'No memories saved'}
            </p>
          )}
        </div>

        {/* 6. Recent Activity Indicator (Connected to Activity Engine) */}
        {activityTimeline.length > 0 && (
          <div className="p-2.5 rounded-xl bg-zinc-900/15 border border-zinc-800/30 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-500">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-zinc-400" />
                <span className="font-medium text-zinc-400">
                  {isAr ? 'آخر نشاط' : 'Recent Activity'}
                </span>
              </div>
              <span className="font-mono text-[9px] text-zinc-500 uppercase">
                {activityTimeline[0].module}
              </span>
            </div>
            <p className="text-[11px] text-zinc-300 truncate">
              {isAr ? (activityTimeline[0].titleAr || activityTimeline[0].title) : activityTimeline[0].title}
            </p>
            <p className="text-[10px] text-zinc-500 truncate">
              {isAr ? (activityTimeline[0].descriptionAr || activityTimeline[0].description) : activityTimeline[0].description}
            </p>
          </div>
        )}

        {/* 7. NOVO Live Audio Intelligence Widget (Compact Supporting) */}
        <div className="p-2.5 rounded-xl bg-zinc-900/20 border border-zinc-800/40 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-medium text-zinc-300">NOVO Live</span>
            </div>
            <Volume2 className="w-3 h-3 text-violet-400" />
          </div>

          {/* Styled Audio Waveform Simulation */}
          <div className="flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-zinc-950/50 border border-zinc-800/40">
            <span className="w-0.5 h-2 bg-violet-400 rounded-full animate-pulse" />
            <span className="w-0.5 h-3 bg-violet-500 rounded-full" />
            <span className="w-0.5 h-1.5 bg-violet-400 rounded-full" />
            <span className="w-0.5 h-4 bg-indigo-400 rounded-full animate-pulse" />
            <span className="w-0.5 h-2.5 bg-violet-400 rounded-full" />
            <span className="w-0.5 h-4.5 bg-violet-300 rounded-full" />
            <span className="w-0.5 h-2 bg-violet-500 rounded-full animate-pulse" />
            <span className="w-0.5 h-3 bg-indigo-400 rounded-full" />
            <span className="w-0.5 h-1.5 bg-violet-400 rounded-full" />
          </div>
        </div>

        {/* 8. Daily Insight Widget (Tertiary & Subtle) */}
        <div className="p-2.5 rounded-xl bg-transparent border-t border-zinc-800/40 space-y-1">
          <div className="flex items-center gap-1 text-zinc-500 text-[10px]">
            <Quote className="w-3 h-3 text-violet-400 rotate-180" />
            <span className="font-medium text-zinc-400">
              {isAr ? 'مقتطف اليوم' : 'Daily Insight'}
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 italic leading-relaxed">
            {isAr
              ? '"الخطوات الصغيرة كل يوم تصنع فرقاً كبيراً ومستداماً في النهاية."'
              : '"Small consistent steps each day compound into extraordinary mastery."'}
          </p>
        </div>
      </aside>
    </>
  );
}
