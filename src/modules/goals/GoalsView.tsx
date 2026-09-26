import { useState, FormEvent, useEffect } from 'react';
import { useApp } from '../../core/providers/AppContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useGoalStore } from '../../core/state/goalStore';
import { useTaskStore } from '../../core/state/taskStore';
import { useFocusStore } from '../../core/state/focusStore';
import { getGoalTaskActivity } from '../../core/intelligence/goalEngine';
import { calculateGoalPacing } from '../../core/intelligence/goalVelocityEngine';
import {
  Target,
  Plus,
  Trash2,
  CheckCircle2,
  TrendingUp,
  Award,
  Edit2,
  X,
  Check,
  CheckSquare,
  Clock,
  Gauge,
  Activity,
} from 'lucide-react';

export function GoalsView() {
  const { language } = useApp();
  const isAr = language === 'ar';
  const status = useGoalStore(state => state.status);
  const initialize = useGoalStore(state => state.initialize);
  useEffect(() => {
    if (status === 'idle') {
      initialize();
    }
  }, [status, initialize]);

  const tasks = useTaskStore(state => state.tasks);
  const taskStatus = useTaskStore(state => state.status);
  const initializeTasks = useTaskStore(state => state.initialize);
  useEffect(() => {
    if (taskStatus === 'idle') {
      initializeTasks();
    }
  }, [taskStatus, initializeTasks]);

  const focusSessions = useFocusStore(state => state.sessions);
  const focusStatus = useFocusStore(state => state.status);
  const initializeFocus = useFocusStore(state => state.initialize);
  useEffect(() => {
    if (focusStatus === 'idle') {
      initializeFocus();
    }
  }, [focusStatus, initializeFocus]);

  const goals = useGoalStore(state => state.goals);
  const createGoal = useGoalStore(state => state.createGoal);
  const updateGoal = useGoalStore(state => state.updateGoal);
  const updateProgress = useGoalStore(state => state.updateProgress);
  const deleteGoal = useGoalStore(state => state.deleteGoal);

  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createGoal(newTitle, newDescription, 0);
    setNewTitle('');
    setNewDescription('');
    setIsCreating(false);
  };

  const startEdit = (id: string, currentTitle: string, currentDesc: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
    setEditDesc(currentDesc);
  };

  const saveEdit = (id: string) => {
    if (!editTitle.trim()) return;
    updateGoal(id, { title: editTitle, description: editDesc });
    setEditingId(null);
  };

  // Metrics
  const totalGoals = goals.length;
  const completedGoals = goals.filter((g) => g.progress >= 100).length;
  const avgProgress =
    totalGoals > 0
      ? Math.round(goals.reduce((acc, g) => acc + g.progress, 0) / totalGoals)
      : 0;

  const progressPresets = [0, 25, 50, 75, 100];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-600/20 to-violet-900/10 border border-violet-500/30 text-violet-400 shadow-sm shadow-violet-950/40">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-zinc-100">
                {isAr ? 'الأهداف والمحطات' : 'Goals & Milestones'}
              </h1>
              <Badge variant="violet" className="text-[10px] py-0 px-2">
                {isAr ? 'تتبع محلي مباشر' : 'Active Tracking'}
              </Badge>
            </div>
            <p className="text-xs text-zinc-400">
              {isAr
                ? 'إدارة الأهداف الاستراتيجية، قياس نسب الإنجاز، والتحديث التلقائي'
                : 'Track long-term vision, monitor milestone completion, and update progress'}
            </p>
          </div>
        </div>

        <Button
          onClick={() => setIsCreating(true)}
          size="sm"
          className="flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{isAr ? 'هدف جديد' : 'New Goal'}</span>
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-3.5 bg-zinc-900/60 border-zinc-800/80">
          <div className="p-2 rounded-lg bg-zinc-800 text-zinc-300">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] text-zinc-500 block">
              {isAr ? 'إجمالي الأهداف' : 'Total Goals'}
            </span>
            <span className="text-lg font-semibold text-zinc-100 font-mono">
              {totalGoals}
            </span>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3.5 bg-zinc-900/60 border-zinc-800/80">
          <div className="p-2 rounded-lg bg-emerald-950/50 border border-emerald-800/40 text-emerald-400">
            <Award className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] text-zinc-500 block">
              {isAr ? 'المحطات المكتملة' : 'Completed Goals'}
            </span>
            <span className="text-lg font-semibold text-emerald-400 font-mono">
              {completedGoals} / {totalGoals}
            </span>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3.5 bg-zinc-900/60 border-zinc-800/80">
          <div className="p-2 rounded-lg bg-violet-950/50 border border-violet-800/40 text-violet-400">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] text-zinc-500 block">
              {isAr ? 'متوسط الإنجاز الكلي' : 'Average Progress'}
            </span>
            <span className="text-lg font-semibold text-violet-300 font-mono">
              {avgProgress}%
            </span>
          </div>
        </Card>
      </div>

      {/* New Goal Form Dialog / Card */}
      {isCreating && (
        <Card className="p-5 border-violet-500/40 bg-zinc-900/90 shadow-lg shadow-violet-950/30 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <h3 className="text-xs font-semibold text-zinc-200">
              {isAr ? 'إضافة هدف جديد' : 'Add New Milestone Goal'}
            </h3>
            <button
              onClick={() => setIsCreating(false)}
              className="p-1 rounded text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                {isAr ? 'عنوان الهدف' : 'Goal Title'}
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={isAr ? 'مثلاً: إتقان تقنية جديدة أو ادخار مبلغ معين...' : 'e.g. Master a new skill or save an emergency fund...'}
                autoFocus
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/60"
              />
            </div>

            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                {isAr ? 'وصف تفصيلي (اختياري)' : 'Description (Optional)'}
              </label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
                placeholder={isAr ? 'تفاصيل ومعايير قياس نجاح الهدف...' : 'Details and milestones for success...'}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/60 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsCreating(false)}
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button type="submit" size="sm">
                {isAr ? 'حفظ الهدف' : 'Save Goal'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Goals List */}
      <div className="space-y-3">
        {goals.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-zinc-900/30 border border-zinc-800/40 space-y-3">
            <Target className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-xs text-zinc-400">
              {isAr
                ? 'لا توجد أهداف مسجلة حالياً. أنشئ هدفك الأول وابدأ في تتبع تقدمك!'
                : 'No goals recorded yet. Create your first goal and track progress!'}
            </p>
            <Button onClick={() => setIsCreating(true)} size="sm" variant="secondary">
              <Plus className="w-3.5 h-3.5 me-1" />
              <span>{isAr ? 'إضافة هدف' : 'Add Goal'}</span>
            </Button>
          </div>
        ) : (
          goals.map((goal) => {
            const isEditing = editingId === goal.id;
            const isCompleted = goal.progress >= 100;
            const activity = getGoalTaskActivity(goal.id, tasks);
            const pacing = calculateGoalPacing(goal, tasks, focusSessions, new Date());

            const getActivityBadgeStyle = (state: string) => {
              switch (state) {
                case 'Active':
                  return 'bg-emerald-950/40 text-emerald-300 border-emerald-700/40';
                case 'Steady':
                  return 'bg-blue-950/40 text-blue-300 border-blue-700/40';
                case 'Pacing Deficit':
                  return 'bg-amber-950/40 text-amber-300 border-amber-700/40';
                case 'Dormant / Stalled':
                  return 'bg-rose-950/40 text-rose-300 border-rose-700/40';
                case 'No Execution Data':
                default:
                  return 'bg-zinc-800/80 text-zinc-400 border-zinc-700/60';
              }
            };

            return (
              <Card
                key={goal.id}
                className={`p-4 border transition-all space-y-3 ${
                  isCompleted
                    ? 'bg-zinc-900/80 border-emerald-500/30'
                    : 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700/80'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 flex-1">
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-700 rounded px-2.5 py-1 text-xs text-zinc-100 focus:outline-none"
                        />
                        <textarea
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          rows={2}
                          className="w-full bg-zinc-950 border border-zinc-700 rounded px-2.5 py-1 text-xs text-zinc-100 focus:outline-none resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(goal.id)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white text-[11px]"
                          >
                            <Check className="w-3 h-3" />
                            <span>{isAr ? 'حفظ' : 'Save'}</span>
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px]"
                          >
                            {isAr ? 'إلغاء' : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <h3
                            className={`text-sm font-medium ${
                              isCompleted ? 'text-zinc-200 line-through decoration-zinc-600' : 'text-zinc-100'
                            }`}
                          >
                            {goal.title}
                          </h3>
                          {isCompleted && (
                            <Badge variant="success" className="text-[10px] py-0 px-1.5 gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{isAr ? 'مكتمل' : 'Achieved'}</span>
                            </Badge>
                          )}
                        </div>
                        {goal.description && (
                          <p className="text-xs text-zinc-400 leading-relaxed">
                            {goal.description}
                          </p>
                        )}
                        {/* Linked Tasks Activity Indicator */}
                        <div className="flex items-center gap-2 pt-1" data-testid={`goal-task-activity-${goal.id}`}>
                          {activity.total > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-800/80 border border-zinc-700/60 font-mono text-[10px] text-zinc-300">
                              <CheckSquare className="w-3 h-3 text-violet-400" />
                              <span>
                                {isAr
                                  ? `${activity.completed}/${activity.total} مهام مكتملة`
                                  : `${activity.completed}/${activity.total} tasks completed`}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {isAr ? '0 مهام مرتبطة' : '0 linked tasks'}
                            </span>
                          )}
                        </div>

                        {/* Lightweight Structural Pacing Row (Gate 17.5A) */}
                        <div
                          className="flex flex-wrap items-center gap-2 pt-2 text-[10px]"
                          data-testid={`goal-pacing-${goal.id}`}
                        >
                          {/* Activity State Badge */}
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-medium ${getActivityBadgeStyle(
                              pacing.activityState
                            )}`}
                          >
                            <Activity className="w-2.5 h-2.5" />
                            <span>
                              {isAr
                                ? pacing.activityState === 'Active'
                                  ? 'نشط'
                                  : pacing.activityState === 'Steady'
                                  ? 'مستقر'
                                  : pacing.activityState === 'Pacing Deficit'
                                  ? 'تأخر في الإنجاز'
                                  : pacing.activityState === 'Dormant / Stalled'
                                  ? 'راكد / غير مفعل'
                                  : 'لا توجد بيانات تنفيذ'
                                : pacing.activityState}
                            </span>
                          </span>

                          {/* Lifetime Pace */}
                          <span
                            className="inline-flex items-center gap-1 text-zinc-400 font-mono bg-zinc-950/60 px-2 py-0.5 rounded border border-zinc-800/60"
                            title={
                              isAr
                                ? 'متوسط وتيرة التقدم على مدار عمر الهدف (% في اليوم)'
                                : 'Lifetime progress pace (% points per day since creation)'
                            }
                          >
                            <Gauge className="w-2.5 h-2.5 text-violet-400" />
                            <span>
                              {isAr ? 'وتيرة العمر:' : 'Lifetime Pace:'}{' '}
                              <strong className="text-zinc-200">{pacing.lifetimePace}%/d</strong>
                            </span>
                          </span>

                          {/* Execution Completion Ratio */}
                          <span
                            className="inline-flex items-center gap-1 text-zinc-400 font-mono bg-zinc-950/60 px-2 py-0.5 rounded border border-zinc-800/60"
                            title={
                              isAr
                                ? 'نسبة إنجاز المهام المرتبطة بالهدف'
                                : 'Execution completion ratio of linked tasks'
                            }
                          >
                            <Check className="w-2.5 h-2.5 text-emerald-400" />
                            <span>
                              {isAr ? 'نسبة الإنجاز:' : 'Exec Ratio:'}{' '}
                              <strong className="text-zinc-200">
                                {pacing.executionCompletionRatio === 'no_data'
                                  ? isAr
                                    ? 'غير متوفر'
                                    : 'No data'
                                  : `${pacing.executionCompletionRatio}%`}
                              </strong>
                            </span>
                          </span>

                          {/* Focus Investment */}
                          {pacing.focusMinutes > 0 && (
                            <span
                              className="inline-flex items-center gap-1 text-zinc-400 font-mono bg-zinc-950/60 px-2 py-0.5 rounded border border-zinc-800/60"
                              title={
                                isAr
                                  ? 'إجمالي دقائق التركيز المسجلة لهذا الهدف'
                                  : 'Total focus minutes logged for this goal'
                              }
                            >
                              <Clock className="w-2.5 h-2.5 text-amber-400" />
                              <span>
                                {isAr ? 'التركيز:' : 'Focus:'}{' '}
                                <strong className="text-zinc-200">{pacing.focusMinutes}m</strong>
                              </span>
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  {!isEditing && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(goal.id, goal.title, goal.description)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
                        title={isAr ? 'تعديل الهدف' : 'Edit goal'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {confirmDeleteId === goal.id ? (
                        <div className="flex items-center gap-1 bg-rose-950/60 border border-rose-800/60 p-1 rounded-lg">
                          <button
                            onClick={() => {
                              deleteGoal(goal.id);
                              setConfirmDeleteId(null);
                            }}
                            className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px]"
                          >
                            {isAr ? 'تأكيد' : 'Delete'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-1.5 py-0.5 rounded text-zinc-400 text-[10px]"
                          >
                            {isAr ? 'إلغاء' : 'No'}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(goal.id)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                          title={isAr ? 'حذف الهدف' : 'Delete goal'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Progress Bar & Interactive Preset Toggles */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] text-zinc-500">
                      {isAr ? 'مستوى الإنجاز' : 'Milestone Progress'}
                    </span>
                    <span className="font-mono font-semibold text-zinc-200">
                      {goal.progress}%
                    </span>
                  </div>

                  {/* Smooth Bar */}
                  <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${
                        isCompleted
                          ? 'bg-emerald-500'
                          : goal.progress >= 50
                            ? 'bg-gradient-to-r from-violet-600 to-violet-500'
                            : 'bg-violet-600'
                      }`}
                      style={{ width: `${goal.progress}%` }}
                    />
                  </div>

                  {/* Progress Preset Quick Buttons */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5">
                      {progressPresets.map((pct) => (
                        <button
                          key={pct}
                          onClick={() => updateProgress(goal.id, pct)}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                            goal.progress === pct
                              ? 'bg-violet-600 text-white font-medium shadow-xs shadow-violet-950'
                              : 'bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1 text-[11px]">
                      <button
                        onClick={() => updateProgress(goal.id, Math.max(0, goal.progress - 5))}
                        disabled={goal.progress <= 0}
                        className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center font-mono"
                      >
                        -
                      </button>
                      <button
                        onClick={() => updateProgress(goal.id, Math.min(100, goal.progress + 5))}
                        disabled={goal.progress >= 100}
                        className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center font-mono"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
