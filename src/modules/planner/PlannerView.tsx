import { useState, useMemo, FormEvent } from 'react';
import { useApp } from '../../core/providers/AppContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { usePlanner } from './hooks/usePlanner';
import { TaskPriority } from '../../types/data';
import {
  CalendarDays,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  ListTodo,
  Calendar,
  Sparkles,
} from 'lucide-react';

export function PlannerView() {
  const { language } = useApp();
  const isAr = language === 'ar';
  const { tasks, createTask, toggleTask, deleteTask } = usePlanner();

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('medium');
  const [filter, setFilter] = useState<'all' | 'today' | 'active' | 'completed'>('all');

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    createTask(newTaskTitle, newTaskPriority, todayStr);
    setNewTaskTitle('');
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === 'today') return t.date === todayStr;
      if (filter === 'active') return !t.completed;
      if (filter === 'completed') return t.completed;
      return true;
    });
  }, [tasks, filter, todayStr]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.completed).length;
    const pending = total - completed;
    const todayCount = tasks.filter((t) => t.date === todayStr).length;
    return { total, completed, pending, todayCount };
  }, [tasks, todayStr]);

  const priorityLabels: Record<TaskPriority, { ar: string; en: string; variant: 'rose' | 'amber' | 'muted' }> = {
    high: { ar: 'أولوية قصوى', en: 'High', variant: 'rose' },
    medium: { ar: 'متوسطة', en: 'Medium', variant: 'amber' },
    low: { ar: 'اعتيادية', en: 'Low', variant: 'muted' },
  };

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

      {/* Task Creation Bar */}
      <Card className="p-4 bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border-zinc-800/90 shadow-sm">
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder={isAr ? 'أضف مهمة جديدة لهذا اليوم...' : 'Add a new task for today...'}
              className="w-full bg-zinc-950/90 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs md:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/60 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <select
              value={newTaskPriority}
              onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-300 focus:outline-none focus:border-violet-500"
            >
              <option value="high">{isAr ? 'أولوية قصوى' : 'High Priority'}</option>
              <option value="medium">{isAr ? 'أولوية متوسطة' : 'Medium Priority'}</option>
              <option value="low">{isAr ? 'أولوية عادية' : 'Low Priority'}</option>
            </select>

            <Button type="submit" size="sm" className="flex items-center gap-1.5 shrink-0">
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
            {(['all', 'today', 'active', 'completed'] as const).map((tab) => {
              const labels = {
                all: isAr ? 'الكل' : 'All',
                today: isAr ? 'اليوم' : 'Today',
                active: isAr ? 'قيد التنفيذ' : 'Active',
                completed: isAr ? 'المكتملة' : 'Completed',
              };
              const isSelected = filter === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
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
            {filteredTasks.length} {isAr ? 'مهمة' : 'tasks'}
          </span>
        </div>

        {/* Task List */}
        <div className="space-y-2">
          {filteredTasks.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-zinc-900/30 border border-zinc-800/40 space-y-2">
              <ListTodo className="w-8 h-8 text-zinc-600 mx-auto" />
              <p className="text-xs text-zinc-400">
                {filter === 'completed'
                  ? isAr
                    ? 'لم تكمل أية مهام في هذا التصنيف بعد'
                    : 'No completed tasks yet in this view'
                  : isAr
                    ? 'لا توجد مهام مدرجة في هذه القائمة. أضف مهمتك الأولى!'
                    : 'No tasks listed in this view. Add your first task!'}
              </p>
            </div>
          ) : (
            filteredTasks.map((task) => {
              const priorityConfig = priorityLabels[task.priority];

              return (
                <div
                  key={task.id}
                  className={`group flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                    task.completed
                      ? 'bg-zinc-900/40 border-zinc-850 opacity-70'
                      : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700/80'
                  }`}
                >
                  {/* Task Checkbox & Title */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      onClick={() => toggleTask(task.id)}
                      className="text-zinc-400 hover:text-violet-400 transition-colors shrink-0 p-0.5"
                    >
                      {task.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Circle className="w-4 h-4 text-zinc-500 hover:text-violet-400" />
                      )}
                    </button>

                    <span
                      onClick={() => toggleTask(task.id)}
                      className={`text-xs md:text-sm cursor-pointer select-none truncate ${
                        task.completed
                          ? 'line-through text-zinc-500 decoration-zinc-600'
                          : 'text-zinc-200 font-normal'
                      }`}
                    >
                      {task.title}
                    </span>
                  </div>

                  {/* Priority Badge, Date & Delete */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span
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

                    <span className="text-[10px] text-zinc-500 font-mono hidden md:inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-zinc-600" />
                      <span>{task.date}</span>
                    </span>

                    <button
                      onClick={() => deleteTask(task.id)}
                      className="p-1 rounded text-zinc-600 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                      title={isAr ? 'حذف المهمة' : 'Delete task'}
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
    </div>
  );
}
