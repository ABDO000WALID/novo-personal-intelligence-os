import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../../../core/providers/AppContext';
import { useTaskStore } from '../../../core/state/taskStore';
import { useGoalStore } from '../../../core/state/goalStore';
import { useFocusStore } from '../../../core/state/focusStore';
import { Task, TaskPriority } from '../../../types/data';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import {
  Sparkles,
  Loader2,
  AlertCircle,
  Check,
  X,
  RefreshCw,
  Calendar,
  CheckSquare,
  Square,
  AlertTriangle,
  ArrowRight,
  PlusCircle,
  SlidersHorizontal,
  Target,
} from 'lucide-react';
import {
  planAssistService,
  PlanAssistService,
  isDuplicateSuggestion,
} from '../services/planAssistService';
import {
  PlanAssistSuggestion,
  PlanAssistPlanningContext,
} from '../services/planAssistTypes';

export interface EditableSuggestionItem {
  id: string; // unique key in UI
  originalIndex: number;
  type: 'new_task' | 'priority_change';
  selected: boolean;
  // new_task fields
  title?: string;
  goalId?: string;
  // priority_change fields
  taskId?: string;
  existingTaskTitle?: string;
  currentPriority?: TaskPriority;
  // common fields
  priority: TaskPriority;
  reason: string;
  // validity & staleness
  isStale: boolean;
  staleReason?: string;
  isDuplicate: boolean;
}

export interface PlanAssistApplyResult {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  totalApplied: number;
  summaryMessage: string;
}

export interface PlanAssistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string;
  onApplyComplete?: (result: PlanAssistApplyResult) => void;
  service?: PlanAssistService;
}

export function PlanAssistDrawer({
  isOpen,
  onClose,
  selectedDate,
  onApplyComplete,
  service = planAssistService,
}: PlanAssistDrawerProps) {
  const { language } = useApp();
  const isAr = language === 'ar';
  const allGoals = useGoalStore((state) => state.goals);

  const [status, setStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle');
  const [summary, setSummary] = useState<string>('');
  const [suggestions, setSuggestions] = useState<EditableSuggestionItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState<boolean>(false);

  // Keep track of active generation date to prevent cross-date leakage
  const activeDateRef = useRef<string>(selectedDate);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const priorityLabels: Record<TaskPriority, { ar: string; en: string; variant: 'rose' | 'amber' | 'muted' }> = {
    high: { ar: 'أولوية قصوى', en: 'High', variant: 'rose' },
    medium: { ar: 'متوسطة', en: 'Medium', variant: 'amber' },
    low: { ar: 'اعتيادية', en: 'Low', variant: 'muted' },
  };

  // Date formatted display
  const formattedDate = useMemo(() => {
    try {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      return d.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate, isAr]);

  // Main generation trigger function
  const triggerGeneration = async (targetDate: string) => {
    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    activeDateRef.current = targetDate;

    if (!isMountedRef.current) return;
    setStatus('generating');
    setErrorMessage(null);
    setSuggestions([]);
    setSummary('');

    // Gather latest planning context from store
    const allTasks = useTaskStore.getState().tasks;
    const dateTasks = allTasks.filter((t) => t.date === targetDate);
    const activeGoals = useGoalStore.getState().goals;
    const focusSessions = useFocusStore.getState().sessions;

    const dateFocusMinutes = focusSessions
      .filter((s) => s.completedAt && s.completedAt.startsWith(targetDate))
      .reduce((sum, s) => sum + (s.duration || 0), 0);

    const planningContext: PlanAssistPlanningContext = {
      selectedDate: targetDate,
      existingTasks: dateTasks,
      activeGoals,
      focusMinutes: dateFocusMinutes,
      language: isAr ? 'ar' : 'en',
    };

    try {
      const response = await service.getPlanSuggestions(planningContext, {
        abortSignal: controller.signal,
      });

      if (!isMountedRef.current) return;

      if (controller.signal.aborted) {
        return;
      }

      // Check if target date changed while generating
      if (activeDateRef.current !== targetDate) {
        return;
      }

      if ('error' in response) {
        if (response.error.isAborted) {
          return;
        }
        setStatus('error');
        setErrorMessage(
          isAr
            ? (response.error.messageAr || response.error.message)
            : response.error.message
        );
        return;
      }

      const rawSuggestions = response.data.suggestions;
      const currentTasks = useTaskStore.getState().tasks;
      const currentTasksForDate = currentTasks.filter((t) => t.date === targetDate);

      const reviewItems: EditableSuggestionItem[] = rawSuggestions.map((item, idx) => {
        if (item.type === 'new_task') {
          const isDup = isDuplicateSuggestion(item, currentTasksForDate);
          const currentGoals = useGoalStore.getState().goals;
          const validGoal = item.goalId ? currentGoals.find((g) => g.id === item.goalId) : undefined;
          return {
            id: `new-${idx}-${Date.now()}`,
            originalIndex: idx,
            type: 'new_task',
            selected: !isDup,
            title: item.title,
            priority: item.priority,
            goalId: validGoal ? validGoal.id : undefined,
            reason: item.reason,
            isStale: false,
            isDuplicate: isDup,
          };
        } else {
          // priority_change
          const existingTask = currentTasks.find((t) => t.id === item.taskId);
          const isStale = !existingTask;
          return {
            id: `prio-${idx}-${Date.now()}`,
            originalIndex: idx,
            type: 'priority_change',
            selected: !isStale,
            taskId: item.taskId,
            existingTaskTitle: existingTask ? existingTask.title : (isAr ? 'مهمة محذوفة' : 'Deleted task'),
            currentPriority: existingTask ? existingTask.priority : 'medium',
            priority: item.priority,
            reason: item.reason,
            isStale,
            staleReason: isStale
              ? (isAr ? 'المهمة المشار إليها لم تعد موجودة في المخطط' : 'The referenced task no longer exists in Planner')
              : undefined,
            isDuplicate: existingTask ? existingTask.priority === item.priority : false,
          };
        }
      });

      setSummary(response.data.summary);
      setSuggestions(reviewItems);
      setStatus('ready');
    } catch (err: any) {
      if (!isMountedRef.current) return;
      if (controller.signal.aborted || err?.name === 'AbortError') {
        return;
      }
      setStatus('error');
      setErrorMessage(
        isAr
          ? 'حدث خطأ غير متوقع أثناء معالجة خطة العمل. يرجى المحاولة ثانية.'
          : (err?.message || 'An unexpected error occurred while generating the plan. Please retry.')
      );
    }
  };

  // Trigger generation automatically when drawer opens
  useEffect(() => {
    if (isOpen) {
      triggerGeneration(selectedDate);
    } else {
      // Abort in-flight when closed
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setStatus('idle');
      setSuggestions([]);
      setErrorMessage(null);
    }
  }, [isOpen, selectedDate]);

  // Manual cancel / close handler
  const handleClose = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    onClose();
  };

  // Retry generation
  const handleRetry = () => {
    triggerGeneration(selectedDate);
  };

  // Suggestion item controls
  const handleToggleSelect = (id: string) => {
    setSuggestions((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          if (item.isStale) return item; // Cannot select stale items
          return { ...item, selected: !item.selected };
        }
        return item;
      })
    );
  };

  const handleUpdateTitle = (id: string, newTitle: string) => {
    setSuggestions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, title: newTitle } : item))
    );
  };

  const handleUpdatePriority = (id: string, newPriority: TaskPriority) => {
    setSuggestions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, priority: newPriority } : item))
    );
  };

  const handleRemoveGoal = (id: string) => {
    setSuggestions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, goalId: undefined } : item))
    );
  };

  const selectedValidCount = useMemo(() => {
    return suggestions.filter((s) => s.selected && !s.isStale && (s.type !== 'new_task' || s.title.trim().length > 0)).length;
  }, [suggestions]);

  // Apply approved suggestions
  const handleApply = async () => {
    if (isApplying || selectedValidCount === 0 || status !== 'ready') {
      return;
    }

    setIsApplying(true);

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    const taskStore = useTaskStore.getState();
    const currentTasks = taskStore.tasks;
    const currentTasksForDate = currentTasks.filter((t) => t.date === selectedDate);

    // Filter items selected by user
    const toApply = suggestions.filter((s) => s.selected && !s.isStale);

    for (const item of toApply) {
      if (item.type === 'new_task') {
        const cleanTitle = item.title.trim();
        if (!cleanTitle) {
          skippedCount++;
          continue;
        }

        // Duplicate check against current date tasks
        const isDup = isDuplicateSuggestion(
          { type: 'new_task', title: cleanTitle, priority: item.priority, reason: item.reason },
          currentTasksForDate
        );

        if (isDup) {
          skippedCount++;
          continue;
        }

        try {
          // Hard safety rule: authoritatively assign selectedDate and optional goalId
          await taskStore.createTask(cleanTitle, item.priority, selectedDate, item.goalId);
          createdCount++;
        } catch (err) {
          console.error('[PlanAssistDrawer] Failed to create task:', err);
          skippedCount++;
        }
      } else if (item.type === 'priority_change') {
        if (!item.taskId) {
          skippedCount++;
          continue;
        }

        // Validate target task still exists in store
        const target = useTaskStore.getState().tasks.find((t) => t.id === item.taskId);
        if (!target) {
          skippedCount++;
          continue;
        }

        // Skip if priority is already what is suggested
        if (target.priority === item.priority) {
          skippedCount++;
          continue;
        }

        try {
          await taskStore.updateTask(item.taskId, { priority: item.priority });
          updatedCount++;
        } catch (err) {
          console.error('[PlanAssistDrawer] Failed to update task priority:', err);
          skippedCount++;
        }
      }
    }

    setIsApplying(false);

    const totalApplied = createdCount + updatedCount;
    const summaryMessage = isAr
      ? `تم تطبيق ${totalApplied} تغييرات (${createdCount} مهام جديدة، ${updatedCount} تعديل أولوية)`
      : `${totalApplied} change${totalApplied === 1 ? '' : 's'} applied (${createdCount} task${createdCount === 1 ? '' : 's'} created, ${updatedCount} priority updated)`;

    if (onApplyComplete) {
      onApplyComplete({
        createdCount,
        updatedCount,
        skippedCount,
        totalApplied,
        summaryMessage,
      });
    }

    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/70 backdrop-blur-xs transition-opacity duration-200"
      data-testid="plan-assist-drawer-overlay"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div
        className="w-full max-w-xl h-full bg-zinc-950 border-s border-zinc-800 flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200"
        data-testid="plan-assist-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-assist-title"
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-600/20 border border-violet-500/40 text-violet-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 id="plan-assist-title" className="text-sm md:text-base font-semibold text-zinc-100 flex items-center gap-2">
                <span>{isAr ? 'المساعد الذكي للتخطيط' : 'AI Plan Assist'}</span>
                <Badge variant="violet" className="text-[10px] py-0 px-2">
                  {isAr ? 'مراجعة بشرية' : 'Human Review'}
                </Badge>
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-0.5" data-testid="plan-assist-target-date">
                <Calendar className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span>{formattedDate}</span>
                <span className="text-zinc-600 font-mono">({selectedDate})</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-colors"
            title={isAr ? 'إغلاق' : 'Close'}
            aria-label={isAr ? 'إغلاق' : 'Close'}
            data-testid="plan-assist-close-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 1. Loading State */}
          {status === 'generating' && (
            <div
              className="p-10 flex flex-col items-center justify-center text-center space-y-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/50"
              data-testid="plan-assist-loading"
            >
              <div className="p-3.5 rounded-full bg-violet-600/10 border border-violet-500/30 text-violet-400 animate-spin">
                <Loader2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-zinc-200">
                  {isAr ? 'جاري تحليل جدولك وأهدافك...' : 'Analyzing your schedule & goals...'}
                </h3>
                <p className="text-xs text-zinc-400 max-w-sm">
                  {isAr
                    ? `توليد اقتراحات تخطيطية ذكية مبنية على مهام يوم ${selectedDate}`
                    : `Formulating grounded suggestions for ${selectedDate} without altering your planner`}
                </p>
              </div>
            </div>
          )}

          {/* 2. Error State */}
          {status === 'error' && (
            <div
              className="p-6 rounded-2xl bg-rose-950/20 border border-rose-800/40 text-rose-300 space-y-4"
              data-testid="plan-assist-error-state"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <h3 className="text-xs md:text-sm font-semibold text-rose-200">
                    {isAr ? 'تعذر توليد خطة العمل' : 'Unable to Generate Plan'}
                  </h3>
                  <p className="text-xs text-rose-300/90" data-testid="plan-assist-error-message">
                    {errorMessage || (isAr ? 'حدث خطأ أثناء الاتصال بخدمة الذكاء الاصطناعي.' : 'An error occurred while contacting AI services.')}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-rose-900/30">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClose}
                  className="text-xs border-rose-800/40 text-rose-300 hover:bg-rose-950/40"
                  data-testid="plan-assist-error-close"
                >
                  {isAr ? 'إلغاء' : 'Dismiss'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleRetry}
                  className="text-xs flex items-center gap-1.5 bg-rose-700 hover:bg-rose-600 text-white"
                  data-testid="plan-assist-retry"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إعادة المحاولة' : 'Retry'}</span>
                </Button>
              </div>
            </div>
          )}

          {/* 3. Ready State with Empty Suggestions */}
          {status === 'ready' && suggestions.length === 0 && (
            <div
              className="p-10 flex flex-col items-center justify-center text-center space-y-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/60"
              data-testid="plan-assist-empty-state"
            >
              <div className="p-3.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">
                <Check className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-zinc-200">
                  {isAr ? 'جدولك متوازن ومكتمل!' : 'Your Schedule Looks Solid!'}
                </h3>
                <p className="text-xs text-zinc-400 max-w-sm">
                  {summary ||
                    (isAr
                      ? 'لم يجد المساعد أية مهام جديدة أو تعديلات أولويات ضرورية لهذا اليوم.'
                      : 'No additional tasks or priority adjustments needed for this date.')}
                </p>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={handleRetry}
                className="text-xs flex items-center gap-1.5"
                data-testid="plan-assist-retry"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isAr ? 'إعادة التحليل' : 'Re-analyze'}</span>
              </Button>
            </div>
          )}

          {/* 4. Ready State with Suggestions */}
          {status === 'ready' && suggestions.length > 0 && (
            <div className="space-y-4" data-testid="plan-assist-suggestions-container">
              {/* Summary Box */}
              {summary && (
                <div
                  className="p-3.5 rounded-xl bg-violet-950/20 border border-violet-800/30 text-xs text-zinc-300 space-y-1"
                  data-testid="plan-assist-summary"
                >
                  <div className="flex items-center gap-1.5 font-medium text-violet-300">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isAr ? 'تحليل المساعد الذكي' : 'AI Strategic Summary'}</span>
                  </div>
                  <p className="text-zinc-300 leading-relaxed">{summary}</p>
                </div>
              )}

              {/* Action Suggestions List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                  <span>{isAr ? 'الاقتراحات المقترحة للمراجعة:' : 'Suggestions for Review:'}</span>
                  <span className="font-mono text-[11px] text-zinc-500">
                    {selectedValidCount} / {suggestions.length} {isAr ? 'محدد' : 'selected'}
                  </span>
                </div>

                {suggestions.map((item, index) => {
                  const isNewTask = item.type === 'new_task';
                  const priorityConfig = priorityLabels[item.priority];

                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-xl border transition-all space-y-3 ${
                        item.isStale
                          ? 'bg-zinc-900/20 border-zinc-850 opacity-60'
                          : item.selected
                          ? 'bg-zinc-900/90 border-violet-500/40 shadow-xs'
                          : 'bg-zinc-900/40 border-zinc-800/80 opacity-75'
                      }`}
                      data-testid={`suggestion-card-${index}`}
                    >
                      {/* Header: Checkbox + Type Badge */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => handleToggleSelect(item.id)}
                            disabled={item.isStale}
                            className={`p-0.5 rounded transition-colors ${
                              item.isStale
                                ? 'text-zinc-600 cursor-not-allowed'
                                : item.selected
                                ? 'text-violet-400 hover:text-violet-300'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                            aria-label={item.selected ? (isAr ? 'إلغاء التحديد' : 'Deselect') : (isAr ? 'تحديد' : 'Select')}
                            data-testid={`suggestion-check-${index}`}
                          >
                            {item.selected ? (
                              <CheckSquare className="w-4 h-4" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>

                            <div className="flex items-center gap-1.5 flex-wrap">
                            {isNewTask ? (
                              <Badge variant="violet" className="text-[10px] py-0 px-2 gap-1">
                                <PlusCircle className="w-3 h-3" />
                                <span>{isAr ? 'مهمة جديدة' : 'New Task'}</span>
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] py-0 px-2 gap-1 border-amber-500/40 text-amber-300">
                                <SlidersHorizontal className="w-3 h-3" />
                                <span>{isAr ? 'تعديل أولوية' : 'Priority Change'}</span>
                              </Badge>
                            )}

                            {isNewTask && item.goalId && (() => {
                              const linkedGoal = allGoals.find((g) => g.id === item.goalId);
                              if (!linkedGoal) return null;
                              return (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-violet-950/60 text-violet-300 border border-violet-800/60 shrink-0"
                                  data-testid={`suggestion-goal-badge-${index}`}
                                  title={isAr ? `مقترح ربطه بالهدف: ${linkedGoal.title}` : `Proposed Goal: ${linkedGoal.title}`}
                                >
                                  <Target className="w-2.5 h-2.5 text-violet-400 shrink-0" />
                                  <span className="truncate max-w-[120px] sm:max-w-[180px]" data-testid={`suggestion-goal-title-${index}`}>
                                    {linkedGoal.title}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveGoal(item.id);
                                    }}
                                    className="text-violet-400 hover:text-violet-200 ml-0.5 p-0.5 rounded focus:outline-none"
                                    title={isAr ? 'إلغاء ربط الهدف' : 'Detach Goal'}
                                    aria-label={isAr ? 'إلغاء ربط الهدف' : 'Detach Goal'}
                                    data-testid={`suggestion-goal-remove-${index}`}
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </span>
                              );
                            })()}

                            {item.isDuplicate && (
                              <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.2 rounded font-mono">
                                {isAr ? 'موجودة مسبقاً' : 'Existing'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Priority Selector / Badge */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[11px] text-zinc-400 hidden sm:inline">
                            {isAr ? 'الأولوية:' : 'Priority:'}
                          </span>
                          <select
                            value={item.priority}
                            onChange={(e) => handleUpdatePriority(item.id, e.target.value as TaskPriority)}
                            disabled={item.isStale}
                            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
                            data-testid={`suggestion-priority-${index}`}
                          >
                            <option value="high">{isAr ? 'قصوى' : 'High'}</option>
                            <option value="medium">{isAr ? 'متوسطة' : 'Medium'}</option>
                            <option value="low">{isAr ? 'اعتيادية' : 'Low'}</option>
                          </select>
                        </div>
                      </div>

                      {/* Content Area */}
                      {isNewTask ? (
                        <div className="space-y-1.5">
                          <label className="block text-[11px] text-zinc-400 font-medium">
                            {isAr ? 'عنوان المهمة المقترحة (قابل للتعديل):' : 'Proposed Task Title (Editable):'}
                          </label>
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) => handleUpdateTitle(item.id, e.target.value)}
                            disabled={item.isStale}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs md:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
                            placeholder={isAr ? 'عنوان المهمة' : 'Task title'}
                            data-testid={`suggestion-title-${index}`}
                          />
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="text-xs text-zinc-300 flex flex-wrap items-center gap-2">
                            <span className="text-zinc-400">{isAr ? 'المهمة:' : 'Task:'}</span>
                            <span className="font-medium text-zinc-100 bg-zinc-950/80 px-2 py-0.5 rounded border border-zinc-800/80" data-testid={`suggestion-task-title-${index}`}>
                              {item.existingTaskTitle}
                            </span>
                            <span className="text-zinc-500 text-[11px] flex items-center gap-1 font-mono">
                              <span>{isAr ? priorityLabels[item.currentPriority || 'medium'].ar : priorityLabels[item.currentPriority || 'medium'].en}</span>
                              <ArrowRight className={`w-3 h-3 text-zinc-600 ${isAr ? 'rotate-180' : ''}`} />
                              <span className="text-violet-300 font-semibold">{isAr ? priorityConfig.ar : priorityConfig.en}</span>
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Reason / Context */}
                      <div className="text-xs text-zinc-400 bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-800/40 space-y-1">
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                          {isAr ? 'السبب الداعم:' : 'Rationale:'}
                        </div>
                        <p className="text-zinc-300 text-xs" data-testid={`suggestion-reason-${index}`}>
                          {item.reason}
                        </p>
                      </div>

                      {/* Stale Task Warning */}
                      {item.isStale && (
                        <div
                          className="flex items-center gap-1.5 text-xs text-amber-400/90 bg-amber-950/30 p-2 rounded-lg border border-amber-800/40"
                          data-testid={`suggestion-stale-${index}`}
                        >
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>{item.staleReason}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer: Actions */}
        <div className="px-5 py-4 border-t border-zinc-800/80 bg-zinc-900/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-zinc-400 order-2 sm:order-1">
            {status === 'ready' && (
              <span>
                {selectedValidCount}{' '}
                {isAr ? 'تغييرات جاهزة للتطبيق' : 'change(s) selected to apply'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end order-1 sm:order-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={isApplying}
              className="text-xs text-zinc-400 hover:text-zinc-200"
              data-testid="plan-assist-cancel-btn"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              <span>{isAr ? 'إلغاء' : 'Cancel'}</span>
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              disabled={isApplying || selectedValidCount === 0 || status !== 'ready'}
              className="text-xs flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white min-w-[120px] justify-center"
              data-testid="plan-assist-apply-btn"
            >
              {isApplying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{isAr ? 'جاري التطبيق...' : 'Applying...'}</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {isAr
                      ? `تطبيق (${selectedValidCount})`
                      : `Apply (${selectedValidCount})`}
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
