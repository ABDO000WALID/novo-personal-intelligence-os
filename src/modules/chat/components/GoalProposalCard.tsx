import React, { useState, useRef } from 'react';
import { GoalActionProposal } from '../../../core/commands/commandTypes';
import { useGoalStore } from '../../../core/state/goalStore';
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
} from 'lucide-react';

export interface GoalProposalCardProps {
  proposal: GoalActionProposal;
  language?: 'ar' | 'en';
  onResolved?: (status: 'confirmed' | 'cancelled') => void;
}

export const GoalProposalCard: React.FC<GoalProposalCardProps> = ({
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
    if (isActionLockedRef.current || status !== 'pending') {
      return;
    }

    isActionLockedRef.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await useGoalStore
        .getState()
        .createGoal(proposal.title, proposal.description || '', proposal.initialProgress || 0);

      setStatus('confirmed');
      proposal.status = 'confirmed';
      if (onResolved) {
        onResolved('confirmed');
      }
    } catch (err: any) {
      console.error('[GoalProposalCard] Confirmation failed:', err);
      const msg =
        err?.message ||
        (isAr ? 'فشل إنشاء الهدف. يرجى المحاولة مرة أخرى.' : 'Failed to create goal. Please try again.');
      setErrorMessage(msg);
      // Unlock so user can retry
      isActionLockedRef.current = false;
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
      data-testid={`goal-proposal-card-${proposal.id}`}
      className="p-4 rounded-2xl bg-zinc-900/90 border border-violet-500/30 shadow-lg shadow-black/30 backdrop-blur-sm space-y-3 transition-all"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-violet-950/60 border border-violet-800/40 text-violet-300">
            <Target className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <span className="text-xs font-semibold text-violet-200">
              {isAr ? 'اقتراح إنشاء هدف' : 'Goal Proposal'}
            </span>
            <span className="text-[10px] text-zinc-400 block">
              {isAr ? 'إنشاء هدف جديد في مساحة العمل' : 'Create new goal in workspace'}
            </span>
          </div>
        </div>

        {/* Status Badge */}
        {status === 'confirmed' ? (
          <Badge
            data-testid={`goal-proposal-status-${proposal.id}`}
            variant="outline"
            className="bg-emerald-950/60 text-emerald-300 border-emerald-800/60 gap-1 text-[11px] py-0.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isAr ? 'تم الإنشاء' : 'Created'}</span>
          </Badge>
        ) : status === 'cancelled' ? (
          <Badge
            data-testid={`goal-proposal-status-${proposal.id}`}
            variant="outline"
            className="bg-zinc-800 text-zinc-400 border-zinc-700 gap-1 text-[11px] py-0.5"
          >
            <XCircle className="w-3.5 h-3.5 text-zinc-400" />
            <span>{isAr ? 'ملغي' : 'Cancelled'}</span>
          </Badge>
        ) : (
          <Badge
            data-testid={`goal-proposal-status-${proposal.id}`}
            variant="outline"
            className="bg-amber-950/60 text-amber-300 border-amber-800/60 text-[11px] py-0.5"
          >
            {isAr ? 'بانتظار التأكيد' : 'Pending Confirmation'}
          </Badge>
        )}
      </div>

      {/* Goal Title */}
      <div className="space-y-1 bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-800/50">
        <span className="text-[10px] uppercase tracking-wider text-zinc-300 font-semibold block">
          {isAr ? 'عنوان الهدف' : 'Goal Title'}
        </span>
        <div
          data-testid={`goal-proposal-title-${proposal.id}`}
          className="text-sm font-semibold text-zinc-100 leading-snug"
        >
          {proposal.title}
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Action Buttons (Pending only) */}
      {status === 'pending' && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            data-testid={`goal-proposal-cancel-${proposal.id}`}
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="flex-1 border-zinc-700/80 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 text-xs py-1.5 h-auto rounded-xl gap-1.5 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-zinc-400" />
            <span>{isAr ? 'إلغاء' : 'Cancel'}</span>
          </Button>

          <Button
            data-testid={`goal-proposal-confirm-${proposal.id}`}
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-medium text-xs py-1.5 h-auto rounded-xl gap-1.5 shadow-md shadow-violet-950/40 transition-colors"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{isAr ? 'جاري الإنشاء...' : 'Creating...'}</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>{isAr ? 'تأكيد الإنشاء' : 'Confirm Goal'}</span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};
