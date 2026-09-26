import React, { useState, useRef } from 'react';
import { TaskActionProposal } from '../../../core/commands/commandTypes';
import { useTaskStore } from '../../../core/state/taskStore';
import { useGoalStore } from '../../../core/state/goalStore';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import {
  ListTodo,
  Check,
  X,
  Calendar,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Target,
} from 'lucide-react';

export interface TaskProposalCardProps {
  proposal: TaskActionProposal;
  language?: 'ar' | 'en';
  onResolved?: (status: 'confirmed' | 'cancelled') => void;
}

/**
 * Authoritative task proposal confirmation executor.
 * Enforces Gate 16 stale-goal fail-closed invariant for align_day proposals,
 * while preserving Gate 14 unlinked-task safety for general task proposals.
 */
export async function executeTaskProposalConfirm(
  proposal: TaskActionProposal,
  language: 'ar' | 'en' = 'ar'
): Promise<{ success: boolean; error?: string }> {
  const isAr = language === 'ar';
  const isAlignmentProposal = proposal.source === 'align_day' || proposal.requiresGoal;

  let validatedGoalId: string | undefined = undefined;

  if (isAlignmentProposal) {
    const currentGoals = useGoalStore.getState().goals;
    const goalStillExists = proposal.goalId
      ? currentGoals.some((g) => g && g.id === proposal.goalId)
      : false;

    if (!goalStillExists) {
      const errMsg = isAr
        ? 'الهدف المرتبط لم يعد موجوداً أو تم حذفه. تعذر تأكيد مواءمة اليوم.'
        : 'The linked goal no longer exists or was deleted. Cannot confirm day alignment.';
      return { success: false, error: errMsg };
    }
    validatedGoalId = proposal.goalId;
  } else {
    if (proposal.goalId) {
      const currentGoals = useGoalStore.getState().goals;
      const goalStillExists = currentGoals.some((g) => g && g.id === proposal.goalId);
      if (goalStillExists) {
        validatedGoalId = proposal.goalId;
      }
    }
  }

  await useTaskStore
    .getState()
    .createTask(proposal.title, proposal.priority, proposal.date, validatedGoalId);

  proposal.status = 'confirmed';
  return { success: true };
}

export const TaskProposalCard: React.FC<TaskProposalCardProps> = ({
  proposal,
  language = 'ar',
  onResolved,
}) => {
  const isAr = language === 'ar';
  const [status, setStatus] = useState<'pending' | 'confirmed' | 'cancelled'>(
    proposal.status || 'pending'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Synchronous mutation guard preventing race conditions & rapid double-clicks
  const isActionLockedRef = useRef(false);

  const priorityLabels = {
    high: {
      ar: 'أولوية قصوى',
      en: 'High Priority',
      badgeClass: 'bg-rose-950/60 text-rose-300 border-rose-800/60',
    },
    medium: {
      ar: 'أولوية متوسطة',
      en: 'Medium Priority',
      badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
    },
    low: {
      ar: 'أولوية اعتيادية',
      en: 'Low Priority',
      badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    },
  };

  const priorityConfig = priorityLabels[proposal.priority] || priorityLabels.medium;

  const handleConfirm = async () => {
    // Synchronous double-submission check
    if (isActionLockedRef.current || status !== 'pending') {
      return;
    }

    // Immediately acquire lock synchronously
    isActionLockedRef.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await executeTaskProposalConfirm(proposal, language);
      if (!result.success) {
        isActionLockedRef.current = false;
        setErrorMessage(
          result.error || (isAr ? 'فشل تأكيد مقترح المهمة' : 'Failed to confirm task proposal')
        );
        return;
      }

      setStatus('confirmed');
      if (onResolved) {
        onResolved('confirmed');
      }
    } catch (err: any) {
      // Release lock on failure to allow retry
      isActionLockedRef.current = false;
      const msg =
        err?.message || (isAr ? 'فشل حفظ المهمة في المخطط' : 'Failed to save task to planner');
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (isActionLockedRef.current || status !== 'pending') {
      return;
    }
    isActionLockedRef.current = true;
    setStatus('cancelled');
    proposal.status = 'cancelled';
    if (onResolved) {
      onResolved('cancelled');
    }
  };

  return (
    <div
      data-testid={`task-proposal-card-${proposal.id}`}
      className={`p-3.5 rounded-xl border transition-all my-2 text-xs shadow-md ${
        status === 'confirmed'
          ? 'bg-emerald-950/30 border-emerald-800/50 text-zinc-200'
          : status === 'cancelled'
          ? 'bg-zinc-900/60 border-zinc-800/60 text-zinc-400 opacity-80'
          : 'bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border-violet-500/40 text-zinc-100'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-zinc-800/70">
        <div className="flex items-center gap-2">
          <div
            className={`p-1.5 rounded-lg ${
              status === 'confirmed'
                ? 'bg-emerald-900/40 text-emerald-400'
                : status === 'cancelled'
                ? 'bg-zinc-800 text-zinc-500'
                : 'bg-violet-950/60 text-violet-400 border border-violet-800/40'
            }`}
          >
            <ListTodo className="w-4 h-4" />
          </div>
          <span className="font-semibold text-zinc-200 text-xs">
            {isAr ? 'مقترح إنشاء مهمة' : 'Task Creation Proposal'}
          </span>
        </div>

        {/* State Badge */}
        {status === 'confirmed' ? (
          <Badge
            variant="success"
            className="flex items-center gap-1 text-[10px] py-0 px-2 font-mono"
            data-testid={`task-proposal-status-${proposal.id}`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>{isAr ? 'تمت الإضافة للمخطط' : 'Added to Planner'}</span>
          </Badge>
        ) : status === 'cancelled' ? (
          <Badge
            variant="muted"
            className="flex items-center gap-1 text-[10px] py-0 px-2 font-mono"
            data-testid={`task-proposal-status-${proposal.id}`}
          >
            <XCircle className="w-3 h-3 text-zinc-400" />
            <span>{isAr ? 'ملغاة' : 'Cancelled'}</span>
          </Badge>
        ) : (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-violet-950/60 text-violet-300 border border-violet-800/40 font-mono"
            data-testid={`task-proposal-status-${proposal.id}`}
          >
            {isAr ? 'في انتظار التأكيد' : 'Awaiting Confirmation'}
          </span>
        )}
      </div>

      {/* Task Details */}
      <div className="space-y-2 py-1">
        <div className="flex items-start gap-2">
          <span className="text-zinc-400 shrink-0 font-medium">
            {isAr ? 'المهمة:' : 'Task:'}
          </span>
          <span
            className={`font-medium ${
              status === 'cancelled' ? 'line-through text-zinc-500' : 'text-zinc-100'
            }`}
            data-testid={`task-proposal-title-${proposal.id}`}
          >
            {proposal.title}
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap text-[11px]">
          {/* Priority */}
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400">{isAr ? 'الأولوية:' : 'Priority:'}</span>
            <span
              className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${priorityConfig.badgeClass}`}
              data-testid={`task-proposal-priority-${proposal.id}`}
            >
              {isAr ? priorityConfig.ar : priorityConfig.en}
            </span>
          </div>

          {/* Date */}
          <div className="flex items-center gap-1.5 text-zinc-300">
            <Calendar className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span className="font-mono text-[10px]" data-testid={`task-proposal-date-${proposal.id}`}>
              {proposal.date}
            </span>
          </div>

          {/* Goal Link if present */}
          {proposal.goalTitle && (
            <div
              className="flex items-center gap-1.5 text-violet-300 bg-violet-950/40 border border-violet-800/40 px-2 py-0.5 rounded-full text-[10px]"
              data-testid={`task-proposal-goal-${proposal.id}`}
            >
              <Target className="w-3 h-3 text-violet-400 shrink-0" />
              <span className="text-zinc-400">{isAr ? 'الهدف:' : 'Goal:'}</span>
              <span className="font-medium text-violet-200">{proposal.goalTitle}</span>
            </div>
          )}
        </div>

        {/* AI Reasoning / Context if present */}
        {proposal.reasoning && (
          <div
            className="text-[11px] text-zinc-400 italic pt-1 border-t border-zinc-800/40"
            data-testid={`task-proposal-reasoning-${proposal.id}`}
          >
            {proposal.reasoning}
          </div>
        )}
      </div>

      {/* Error Message if any */}
      {errorMessage && (
        <div className="flex items-center gap-1.5 p-2 mt-2 rounded bg-rose-950/60 border border-rose-800/60 text-rose-300 text-[11px]">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Action Controls */}
      {status === 'pending' && (
        <div className="flex items-center justify-end gap-2 pt-2.5 mt-2 border-t border-zinc-800/60">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="text-xs px-3 py-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
            data-testid={`task-proposal-cancel-${proposal.id}`}
          >
            <X className="w-3.5 h-3.5 mr-1" />
            <span>{isAr ? 'إلغاء' : 'Cancel'}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="text-xs px-3.5 py-1 bg-violet-600 hover:bg-violet-500 text-white flex items-center gap-1.5"
            data-testid={`task-proposal-confirm-${proposal.id}`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 mr-1" />
                <span>{isAr ? 'تأكيد وإضافة' : 'Confirm & Add'}</span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};
