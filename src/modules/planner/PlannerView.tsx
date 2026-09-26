import { useState, useMemo, FormEvent, useEffect, ChangeEvent } from 'react';
import { useApp } from '../../core/providers/AppContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useTaskStore } from '../../core/state/taskStore';
import { useGoalStore } from '../../core/state/goalStore';
import { Task, TaskPriority } from '../../types/data';
import {
  CalendarDays,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  ListTodo,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Check,
  X,
  Sparkles,
  Target,
} from 'lucide-react';
import { PlanAssistDrawer, PlanAssistApplyResult } from './components/PlanAssistDrawer';
import { PlanAssistService } from './services/planAssistService';

export function getLocalTodayString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatLocalDateString(d);
}

export function PlannerView({ service }: { service?: PlanAssistService } = {}) {
  const { language } = useApp();
  const isAr = language === 'ar';
  const status = useTaskStore(state => state.status);
  const initialize = useTaskStore(state => state.initialize);

  const goals = useGoalStore(state => state.goals);
  const goalStatus = useGoalStore(state => state.status);
  const initializeGoals = useGoalStore(state => state.initialize);

  useEffect(() => {
    if (status === 'idle') {
      initialize();
    }
  }, [status, initialize]);

  useEffect(() => {
    if (goalStatus === 'idle') {
      initializeGoals();
    }
  }, [goalStatus, initializeGoals]);

  const tasks = useTaskStore(state => state.tasks);
  const createTask = useTaskStore(state => state.createTask);
  const updateTask = useTaskStore(state => state.updateTask);
  const toggleTask = useTaskStore(state => state.toggleTask);
  const deleteTask = useTaskStore(state => state.deleteTask);
  const updateGoalProgress = useGoalStore(state => state.updateProgress);

  const todayStr = useMemo(() => getLocalTodayString(), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Goal progress feedback state
  interface GoalProgressPromptState {
    taskId: string;
    goalId: string;
    goalTitle: string;
    currentProgress: number;
  }
  const [goalPrompt, setGoalPrompt] = useState<GoalProgressPromptState | null>(null);

  // Plan Assist state
  const [isPlanAssistOpen, setIsPlanAssistOpen] = useState(false);
  const [planAssistFeedback, setPlanAssistFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (planAssistFeedback) {
      const timer = setTimeout(() => setPlanAssistFeedback(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [planAssistFeedback]);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('medium');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'today'>('all');

  // Inline editing state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPriority, setEditPriority] = useState<TaskPriority>('medium');
  const [editDate, setEditDate] = useState('');

  // Date navigation handlers
  const handlePrevDay = () => {
    setSelectedDate(curr => addDaysToDateString(curr, -1));
  };

  const handleNextDay = () => {
    setSelectedDate(curr => addDaysToDateString(curr, 1));
  };

  const handleToday = () => {
    setSelectedDate(todayStr);
  };

  const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      setSelectedDate(e.target.value);
    }
  };

  // Task creation handler: binds to selectedDate
  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    createTask(newTaskTitle.trim(), newTaskPriority, selectedDate);
    setNewTaskTitle('');
  };

  // Inline edit handlers
  const startEditing = (task: Task) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditPriority(task.priority);
    setEditDate(task.date);
  };

  const cancelEditing = () => {
    setEditingTaskId(null);
    setEditTitle('');
    setEditDate('');
  };

  const saveEditing = async (taskId: string) => {
    if (!editTitle.trim()) return;
    try {
      await updateTask(taskId, {
        title: editTitle.trim(),
        priority: editPriority,
        date: editDate || selectedDate,
      });
      setEditingTaskId(null);
    } catch (err) {
      console.error('[PlannerView] Failed to update task:', err);
    }
  };

  // Task toggle with human-confirmed goal progress prompt
  const handleToggleTask = async (taskId: string) => {
    const currentTask = tasks.find(t => t.id === taskId);
    if (!currentTask) return;

    const wasCompleted = currentTask.completed;

    // Case 1: Reopening a completed task (completed: true -> false)
    if (wasCompleted) {
      if (goalPrompt?.taskId === taskId) {
        setGoalPrompt(null);
      }
      // Reopening does NOT subtract Goal.progress and does NOT show a negative prompt
      await toggleTask(taskId);
      return;
    }

    // Case 2: Completing an incomplete task (completed: false -> true)
    try {
      await toggleTask(taskId);

      // Verify task state in store after toggle
      const updatedTask = useTaskStore.getState().tasks.find(t => t.id === taskId);
      if (!updatedTask || !updatedTask.completed) {
        if (goalPrompt?.taskId === taskId) {
          setGoalPrompt(null);
        }
        return;
      }

      // Check if task has a goalId
      if (!updatedTask.goalId) {
        if (goalPrompt?.taskId === taskId) {
          setGoalPrompt(null);
        }
        return;
      }

      // Check if goal can be resolved in goalStore
      const currentGoals = useGoalStore.getState().goals;
      const targetGoal = currentGoals.find(g => g.id === updatedTask.goalId);
      if (!targetGoal) {
        // Task with invalid/orphaned goalId: show no prompt
        if (goalPrompt?.taskId === taskId) {
          setGoalPrompt(null);
        }
        return;
      }

      // If goal is already at 100% or more, do not show progress increment options
      if (targetGoal.progress >= 100) {
        if (goalPrompt?.taskId === taskId) {
          setGoalPrompt(null);
        }
        return;
      }

      // Show human-confirmed progress prompt
      setGoalPrompt({
        taskId: updatedTask.id,
        goalId: targetGoal.id,
        goalTitle: targetGoal.title,
        currentProgress: targetGoal.progress,
      });
    } catch (err) {
      console.error('[PlannerView] Task completion failed:', err);
      if (goalPrompt?.taskId === taskId) {
        setGoalPrompt(null);
      }
    }
  };

  const handleApplyGoalProgress = async (increment: number | 'max') => {
    if (!goalPrompt) return;
    const targetGoal = useGoalStore.getState().goals.find(g => g.id === goalPrompt.goalId);
    if (targetGoal) {
      const newProgress = increment === 'max' ? 100 : Math.min(100, targetGoal.progress + increment);
      await updateGoalProgress(targetGoal.id, newProgress);
    }
    setGoalPrompt(null);
  };

  const handleDismissGoalPrompt = () => {
    setGoalPrompt(null);
  };

  const handleDeleteTask = async (taskId: string) => {
    if (goalPrompt?.taskId === taskId) {
      setGoalPrompt(null);
    }
    await deleteTask(taskId);
  };

  // Filter tasks: composed with selectedDate
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === 'today') {
        if (t.date !== todayStr) return false;
      } else {
        if (t.date !== selectedDate) return false;
      }

      if (filter === 'active') return !t.completed;
      if (filter === 'completed') return t.completed;
      return true;
    });
  }, [tasks, filter, selectedDate, todayStr]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.completed).length;
    const pending = total - completed;
    const dateTasks = tasks.filter((t) => t.date === selectedDate);
    const dateCompleted = dateTasks.filter((t) => t.completed).length;
    return { total, completed, pending, dateTotal: dateTasks.length, dateCompleted };
  }, [tasks, selectedDate]);

  const priorityLabels: Record<TaskPriority, { ar: string; en: string; variant: 'rose' | 'amber' | 'muted' }> = {
    high: { ar: 'أولوية قصوى', en: 'High', variant: 'rose' },
    medium: { ar: 'متوسطة', en: 'Medium', variant: 'amber' },
    low: { ar: 'اعتيادية', en: 'Low', variant: 'muted' },
  };

  const formattedDateTitle = useMemo(() => {
    const isToday = selectedDate === todayStr;
    const isTomorrow = selectedDate === addDaysToDateString(todayStr, 1);
    const isYesterday = selectedDate === addDaysToDateString(todayStr, -1);

    const parsed = parseLocalDate(selectedDate);
    const formatted = parsed.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    if (isToday) return `${isAr ? 'اليوم' : 'Today'} • ${formatted}`;
    if (isTomorrow) return `${isAr ? 'غداً' : 'Tomorrow'} • ${formatted}`;
    if (isYesterday) return `${isAr ? 'أمس' : 'Yesterday'} • ${formatted}`;
    return formatted;
  }, [selectedDate, todayStr, isAr]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-600/20 to-violet-900/10 border border-violet-500/30 text-violet-400 shadow-sm shadow-violet-950/40">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-zinc-100">
                {isAr ? 'المخطط والمهام اليومية' : 'Planner & Daily Tasks'}
              </h1>
              <Badge variant="violet" className="text-[10px] py-0 px-2">
                {isAr ? 'إدارة محلية' : 'Local Tasks'}
              </Badge>
            </div>
            <p className="text-xs text-zinc-400">
              {isAr
                ? 'تنظيم مهام اليوم، تحديد الأولويات، ومتابعة قائمة الإنجازات'
                : 'Organize daily priorities, set importance levels, and track progress'}
            </p>
          </div>
        </div>

        {/* Quick Summary Pill */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-2.5 py-1 rounded-lg bg-emerald-950/50 border border-emerald-800/40 text-emerald-400">
            {stats.completed} {isAr ? 'منجز' : 'done'}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400">
            {stats.pending} {isAr ? 'متبقٍ' : 'pending'}
          </span>
        </div>
      </div>

      {/* Date Navigator Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevDay}
            className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-colors"
            title={isAr ? 'اليوم السابق' : 'Previous day'}
            aria-label={isAr ? 'اليوم السابق' : 'Previous day'}
            data-testid="date-prev"
          >
            <ChevronLeft className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleNextDay}
            className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-colors"
            title={isAr ? 'اليوم التالي' : 'Next day'}
            aria-label={isAr ? 'اليوم التالي' : 'Next day'}
            data-testid="date-next"
          >
            <ChevronRight className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleToday}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors border ${
              selectedDate === todayStr
                ? 'bg-violet-600/20 text-violet-300 border-violet-500/40'
                : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
            }`}
            title={isAr ? 'الانتقال إلى اليوم' : 'Jump to Today'}
            data-testid="date-today"
          >
            {isAr ? 'اليوم' : 'Today'}
          </button>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2.5 flex-wrap">
          <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-zinc-200" data-testid="selected-date-label">
            <Calendar className="w-4 h-4 text-violet-400 shrink-0" />
            <span>{formattedDateTitle}</span>
          </div>

          <input
            type="date"
            value={selectedDate}
            onChange={handleDateChange}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-300 focus:outline-none focus:border-violet-500 transition-colors"
            title={isAr ? 'اختر التاريخ' : 'Select date'}
            aria-label={isAr ? 'اختر التاريخ' : 'Select date'}
            data-testid="date-picker"
          />

          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setIsPlanAssistOpen(true)}
            className="flex items-center gap-1.5 border-violet-500/40 text-violet-300 hover:text-violet-200 bg-violet-950/30 hover:bg-violet-900/40 shrink-0"
            data-testid="plan-assist-trigger-btn"
            title={isAr ? 'المساعد الذكي للتخطيط' : 'AI Plan Assist'}
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span>{isAr ? 'المساعد الذكي للتخطيط' : 'AI Plan Assist'}</span>
          </Button>
        </div>
      </div>

      {/* Plan Assist Feedback Banner */}
      {planAssistFeedback && (
        <div
          className="flex items-center justify-between px-4 py-3 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs shadow-xs animate-in fade-in duration-200"
          data-testid="planner-feedback"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span data-testid="planner-feedback-text">{planAssistFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setPlanAssistFeedback(null)}
            className="text-emerald-400 hover:text-emerald-200 p-0.5 rounded transition-colors"
            aria-label={isAr ? 'إغلاق الإشعار' : 'Dismiss notification'}
            data-testid="planner-feedback-dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Task Creation Bar */}
      <Card className="p-4 bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border-zinc-800/90 shadow-sm">
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder={isAr ? 'أضف مهمة جديدة لهذا اليوم...' : 'Add a new task for this day...'}
              className="w-full bg-zinc-950/90 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs md:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/60 transition-colors"
              data-testid="new-task-input"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <select
              value={newTaskPriority}
              onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-300 focus:outline-none focus:border-violet-500"
              data-testid="new-task-priority"
            >
              <option value="high">{isAr ? 'أولوية قصوى' : 'High Priority'}</option>
              <option value="medium">{isAr ? 'أولوية متوسطة' : 'Medium Priority'}</option>
              <option value="low">{isAr ? 'أولوية اعتيادية' : 'Low Priority'}</option>
            </select>

            <Button type="submit" size="sm" className="flex items-center gap-1.5 shrink-0" data-testid="add-task-btn">
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة المهمة' : 'Add Task'}</span>
            </Button>
          </div>
        </form>
      </Card>

      {/* Filter Tabs & Content */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-900/70 border border-zinc-800/70 text-xs">
            {(['all', 'active', 'completed'] as const).map((tab) => {
              const labels = {
                all: isAr ? 'الكل' : 'All',
                active: isAr ? 'قيد التنفيذ' : 'Active',
                completed: isAr ? 'المكتملة' : 'Completed',
              };
              const isSelected = filter === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  data-testid={`filter-${tab}`}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    isSelected
                      ? 'bg-zinc-800 text-zinc-100 shadow-xs border border-zinc-700/60'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>

          <span className="text-[11px] text-zinc-500 font-mono hidden sm:inline-block">
            {filteredTasks.length} {isAr ? 'مهمة لهذا اليوم' : 'tasks for this day'}
          </span>
        </div>

        {/* Task List */}
        <div className="space-y-2">
          {filteredTasks.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-zinc-900/30 border border-zinc-800/40 space-y-2" data-testid="empty-task-list">
              <ListTodo className="w-8 h-8 text-zinc-600 mx-auto" />
              <p className="text-xs text-zinc-400">
                {filter === 'completed'
                  ? isAr
                    ? 'لم تكمل أية مهام في هذا التصنيف لهذا اليوم'
                    : 'No completed tasks yet for this date'
                  : isAr
                    ? 'لا توجد مهام مدرجة في هذا التاريخ. أضف مهمتك الأولى!'
                    : 'No tasks scheduled for this date. Add your first task!'}
              </p>
            </div>
          ) : (
            filteredTasks.map((task) => {
              const priorityConfig = priorityLabels[task.priority];
              const isEditing = editingTaskId === task.id;

              if (isEditing) {
                return (
                  <div
                    key={task.id}
                    className="p-3.5 rounded-xl border border-violet-500/40 bg-zinc-900/95 shadow-sm space-y-3"
                    data-testid={`task-edit-row-${task.id}`}
                  >
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="flex-1 bg-zinc-950/90 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs md:text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
                        placeholder={isAr ? 'عنوان المهمة' : 'Task title'}
                        data-testid={`task-edit-title-${task.id}`}
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={editPriority}
                          onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
                          className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
                          data-testid={`task-edit-priority-${task.id}`}
                        >
                          <option value="high">{isAr ? 'أولوية قصوى' : 'High Priority'}</option>
                          <option value="medium">{isAr ? 'أولوية متوسطة' : 'Medium Priority'}</option>
                          <option value="low">{isAr ? 'أولوية اعتيادية' : 'Low Priority'}</option>
                        </select>
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
                          title={isAr ? 'تاريخ المهمة' : 'Task date'}
                          data-testid={`task-edit-date-${task.id}`}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-800/60">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={cancelEditing}
                        className="text-xs px-2.5 py-1 text-zinc-400 hover:text-zinc-200"
                        data-testid={`task-edit-cancel-${task.id}`}
                      >
                        <X className="w-3.5 h-3.5 mr-1" />
                        <span>{isAr ? 'إلغاء' : 'Cancel'}</span>
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveEditing(task.id)}
                        disabled={!editTitle.trim()}
                        className="text-xs px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white"
                        data-testid={`task-edit-save-${task.id}`}
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        <span>{isAr ? 'حفظ' : 'Save'}</span>
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={task.id}
                  data-testid={`task-row-${task.id}`}
                  className={`group flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                    task.completed
                      ? 'bg-zinc-900/40 border-zinc-850 opacity-70'
                      : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700/80'
                  }`}
                >
                  {/* Task Checkbox & Title */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      onClick={() => handleToggleTask(task.id)}
                      className="text-zinc-400 hover:text-violet-400 transition-colors shrink-0 p-0.5"
                      aria-label={task.completed ? (isAr ? 'تحديد كغير منجز' : 'Mark as incomplete') : (isAr ? 'تحديد كمنجز' : 'Mark as complete')}
                      data-testid={`task-toggle-${task.id}`}
                    >
                      {task.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Circle className="w-4 h-4 text-zinc-500 hover:text-violet-400" />
                      )}
                    </button>

                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span
                        onClick={() => handleToggleTask(task.id)}
                        data-testid={`task-title-${task.id}`}
                        className={`text-xs md:text-sm cursor-pointer select-none truncate ${
                          task.completed
                            ? 'line-through text-zinc-500 decoration-zinc-600'
                            : 'text-zinc-200 font-normal'
                        }`}
                      >
                        {task.title}
                      </span>

                      {task.goalId && (() => {
                        const linkedGoal = goals.find(g => g.id === task.goalId);
                        if (!linkedGoal) return null;
                        return (
                          <span
                            data-testid={`task-goal-badge-${task.id}`}
                            title={isAr ? `مرتبط بالهدف: ${linkedGoal.title}` : `Linked to: ${linkedGoal.title}`}
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-violet-950/40 text-violet-300 border border-violet-800/40 shrink-0 select-none"
                          >
                            <Target className="w-2.5 h-2.5 text-violet-400 shrink-0" />
                            <span className="truncate max-w-[120px] sm:max-w-[180px]">{linkedGoal.title}</span>
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Actions: Priority Badge, Date, Edit, Delete */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      data-testid={`task-priority-${task.id}`}
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                        task.priority === 'high'
                          ? 'bg-rose-950/40 text-rose-300 border-rose-800/40'
                          : task.priority === 'medium'
                            ? 'bg-amber-950/40 text-amber-300 border-amber-800/40'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      {isAr ? priorityConfig.ar : priorityConfig.en}
                    </span>

                    <span className="text-[10px] text-zinc-500 font-mono hidden md:inline-flex items-center gap-1" data-testid={`task-date-${task.id}`}>
                      <Calendar className="w-3 h-3 text-zinc-600" />
                      <span>{task.date}</span>
                    </span>

                    <button
                      onClick={() => startEditing(task)}
                      className="p-1 rounded text-zinc-500 hover:text-violet-300 hover:bg-violet-950/30 transition-colors"
                      title={isAr ? 'تعديل المهمة' : 'Edit task'}
                      aria-label={isAr ? 'تعديل المهمة' : 'Edit task'}
                      data-testid={`task-edit-btn-${task.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-1 rounded text-zinc-600 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                      title={isAr ? 'حذف المهمة' : 'Delete task'}
                      aria-label={isAr ? 'حذف المهمة' : 'Delete task'}
                      data-testid={`task-delete-btn-${task.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Human-Confirmed Goal Progress Feedback Surface */}
      {goalPrompt && (
        <div
          role="region"
          aria-label={isAr ? 'تأكيد تقدم الهدف' : 'Goal Progress Confirmation'}
          data-testid="goal-progress-prompt"
          className="sticky bottom-4 z-20 mt-4 mx-auto max-w-xl p-3.5 rounded-xl bg-zinc-900/95 border border-violet-500/40 shadow-xl shadow-black/40 backdrop-blur-md transition-all"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0 text-violet-400">
                <Target className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-200 truncate" data-testid="goal-prompt-title">
                  {isAr
                    ? `تم إنجاز مهمة مرتبطة بالهدف: ${goalPrompt.goalTitle}`
                    : `Task completed for goal: ${goalPrompt.goalTitle}`}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-zinc-400">
                    {isAr ? 'التقدم الحالي:' : 'Current progress:'}
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-violet-300" data-testid="goal-prompt-current-progress">
                    {(() => {
                      const liveGoal = goals.find(g => g.id === goalPrompt.goalId);
                      return `${liveGoal ? liveGoal.progress : goalPrompt.currentProgress}%`;
                    })()}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleDismissGoalPrompt}
              className="text-zinc-400 hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-800 transition-colors shrink-0"
              aria-label={isAr ? 'إغلاق' : 'Dismiss'}
              data-testid="goal-prompt-dismiss-btn"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-zinc-800/80 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-zinc-400 mr-1">
                {isAr ? 'تحديث الإنجاز:' : 'Record progress:'}
              </span>
              <button
                onClick={() => handleApplyGoalProgress(5)}
                className="px-2.5 py-1 rounded bg-violet-950/60 hover:bg-violet-900/80 border border-violet-800/60 text-violet-200 text-[11px] font-mono font-medium transition-colors"
                data-testid="goal-prompt-plus5-btn"
              >
                +5%
              </button>
              <button
                onClick={() => handleApplyGoalProgress(10)}
                className="px-2.5 py-1 rounded bg-violet-950/60 hover:bg-violet-900/80 border border-violet-800/60 text-violet-200 text-[11px] font-mono font-medium transition-colors"
                data-testid="goal-prompt-plus10-btn"
              >
                +10%
              </button>
              <button
                onClick={() => handleApplyGoalProgress('max')}
                className="px-2.5 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800/60 text-emerald-200 text-[11px] font-medium transition-colors"
                data-testid="goal-prompt-max-btn"
              >
                {isAr ? 'تحديد 100%' : 'Mark 100%'}
              </button>
            </div>

            <button
              onClick={handleDismissGoalPrompt}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
              data-testid="goal-prompt-keep-btn"
            >
              {isAr ? 'الإبقاء على المهمة فقط' : 'Keep Task Completed'}
            </button>
          </div>
        </div>
      )}

      {/* AI Plan Assist Review Drawer */}
      <PlanAssistDrawer
        isOpen={isPlanAssistOpen}
        onClose={() => setIsPlanAssistOpen(false)}
        selectedDate={selectedDate}
        onApplyComplete={(res: PlanAssistApplyResult) => {
          setPlanAssistFeedback(res.summaryMessage);
        }}
        service={service}
      />
    </div>
  );
}

