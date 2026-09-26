import React, { useState, useRef } from 'react';
import { GoalProgressActionProposal } from '../../../core/commands/commandTypes';
import { useGoalStore } from '../../../core/state/goalStore';
import { RepositoryFactory } from '../../../core/data/RepositoryFactory';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import {
  Target,
  Check,
  X,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  TrendingUp,
} from 'lucide-react';

export interface GoalProgressProposalCardProps {
  proposal: GoalProgressActionProposal;
  language?: 'ar' | 'en';
  onResolved?: (status: 'confirmed' | 'cancelled') => void;
}

export const GoalProgressProposalCard: React.FC<GoalProgressProposalCardProps> = ({
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
      // 1. Fetch the authoritative persisted goal directly from the repository
      // to protect against cross-tab or concurrent background modifications.
      // ZERO fallback to local Zustand state for safety decision!
      let authoritativeGoal = null;
      try {
        const repo = RepositoryFactory.getGoalRepository();
        authoritativeGoal = await repo.getById(proposal.goalId);
      } catch (repoErr) {
        console.error('[GoalProgressProposalCard] Authoritative repository read failed:', repoErr);
        throw new Error(
          isAr
            ? 'تعذر التحقق من حالة الهدف من قاعدة البيانات. يرجى التحقق من الاتصال والمحاولة مرة أخرى.'
            : 'Could not verify goal state from database. Please check your connection and try again.'
        );
      }

      // 2. Stale Goal Safety: Verify the goal exists in repository
      if (!authoritativeGoal) {
        throw new Error(
          isAr
            ? 'تعذر العثور على الهدف المشار إليه. ربما تم حذفه مسبقاً.'
            : 'Referenced goal was not found. It may have been deleted.'
        );
      }

      // 3. Stale Progress Safety: Verify authoritative progress has not changed since proposal creation
      if (authoritativeGoal.progress !== proposal.currentProgress) {
        // Synchronize local goalStore if it held a stale in-memory snapshot
        const inStoreGoal = useGoalStore.getState().goals.find((g) => g && g.id === proposal.goalId);
        if (inStoreGoal && inStoreGoal.progress !== authoritativeGoal.progress) {
          useGoalStore.setState((state) => ({
            goals: state.goals.map((g) => (g.id === proposal.goalId ? authoritativeGoal! : g)),
            lastUpdated: Date.now(),
          }));
        }

        throw new Error(
          isAr
            ? 'تقدم الهدف تغيّر منذ إنشاء الاقتراح. راجع القيمة الحالية ثم أعد المحاولة.'
            : 'Goal progress has changed since this proposal was created. Review current value and try again.'
        );
      }

      // 4. Call existing goalStore.updateProgress
      await useGoalStore.getState().updateProgress(proposal.goalId, proposal.newProgress);

      setStatus('confirmed');
      proposal.status = 'confirmed';
      if (onResolved) {
        onResolved('confirmed');
      }
    } catch (err: any) {
      // Release lock on failure to allow retry if appropriate
      isActionLockedRef.current = false;
      const msg =
        err?.message ||
        (isAr ? 'فشل تحديث تقدم الهدف' : 'Failed to update goal progress');
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
      data-testid={`goal-progress-proposal-card-${proposal.id}`}
      className={`p-3.5 rounded-xl border transition-all my-2 text-xs shadow-md ${
        status === 'confirmed'
          ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
          : status === 'cancelled'
          ? 'bg-zinc-900/40 border-zinc-800/40 text-zinc-400 opacity-60'
          : 'bg-zinc-900/80 border-violet-500/30 text-zinc-200'
      }`}
    >
      {/* Header with Icon, Title and Status */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5 font-medium text-zinc-200">
          <Target className="w-4 h-4 text-violet-400 shrink-0" />
          <span>{isAr ? 'مقترح تحديث تقدم الهدف' : 'Goal Progress Proposal'}</span>
        </div>
        <div>
          {status === 'pending' && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-violet-950/60 text-violet-300 border border-violet-800/40 font-mono"
              data-testid={`goal-progress-status-${proposal.id}`}
            >
              {isAr ? 'في انتظار التأكيد' : 'Pending Confirmation'}
            </span>
          )}
          {status === 'confirmed' && (
            <Badge
              variant="success"
              className="text-[10px] py-0 px-2 flex items-center gap-1 font-mono"
              data-testid={`goal-progress-status-${proposal.id}`}
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>{isAr ? 'تم التحديث' : 'Updated'}</span>
            </Badge>
          )}
          {status === 'cancelled' && (
            <Badge
              variant="muted"
              className="text-[10px] py-0 px-2 flex items-center gap-1 font-mono text-zinc-400"
              data-testid={`goal-progress-status-${proposal.id}`}
            >
              <XCircle className="w-3 h-3 text-zinc-400" />
              <span>{isAr ? 'تم الإلغاء' : 'Cancelled'}</span>
            </Badge>
          )}
        </div>
      </div>

      {/* Goal Title Display */}
      <div className="bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/70 mb-2.5 space-y-2">
        <div>
          <span className="text-[10px] text-zinc-400 block mb-0.5">
            {isAr ? 'الهدف' : 'Goal'}
          </span>
          <span className="font-semibold text-zinc-100 text-sm block">
            {proposal.goalTitle}
          </span>
        </div>

        {/* Progress Comparison Display */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-800/50">
          <div>
            <span className="text-[10px] text-zinc-500 block">
              {isAr ? 'التقدم الحالي' : 'Current Progress'}
            </span>
            <span className="font-mono text-xs text-zinc-300">
              {proposal.currentProgress}%
            </span>
          </div>
          <div>
            <span className="text-[10px] text-violet-400 block font-medium">
              {isAr ? 'التقدم الجديد' : 'New Progress'}
            </span>
            <span className="font-mono text-xs text-violet-300 font-bold flex items-center gap-1">
              <TrendingUp className="w-3 h-3 inline" />
              {proposal.newProgress}%
            </span>
          </div>
        </div>

        {/* Visual Progress Bar preview */}
        <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden mt-1">
          <div
            className="h-full bg-violet-500 transition-all duration-300 rounded-full"
            style={{ width: `${proposal.newProgress}%` }}
          />
        </div>
      </div>

      {/* Error Message if Stale or Failed */}
      {errorMessage && (
        <div className="flex items-center gap-1.5 p-2 rounded-lg bg-rose-950/40 border border-rose-800/50 text-[11px] text-rose-300 mb-2.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
          <span className="leading-tight">{errorMessage}</span>
        </div>
      )}

      {/* Actions: Confirm & Cancel */}
      {status === 'pending' && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="text-zinc-400 hover:text-zinc-200 text-xs h-7 px-2.5"
          >
            <X className="w-3.5 h-3.5 me-1" />
            <span>{isAr ? 'إلغاء' : 'Cancel'}</span>
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="bg-violet-600 hover:bg-violet-500 text-white text-xs h-7 px-3 flex items-center gap-1.5 shadow-sm shadow-violet-950"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{isAr ? 'جاري التحديث...' : 'Updating...'}</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>{isAr ? 'تأكيد وتحديث' : 'Confirm and Update'}</span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};
