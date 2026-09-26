import React, { useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { useGoalStore } from '../../../core/state/goalStore';
import { useTaskStore } from '../../../core/state/taskStore';
import { RepositoryFactory } from '../../../core/data/RepositoryFactory';
import { Goal } from '../../../types/data';
import { Wrench, CheckCircle2, Trash2, AlertCircle } from 'lucide-react';

export const GATE_17_4_FIXTURE_MARKER = '[GATE17.4 TEST] Stalled Goal - DELETE ME';

interface Gate174Tier2FixtureSectionProps {
  isAr: boolean;
}

export const Gate174Tier2FixtureSection: React.FC<Gate174Tier2FixtureSectionProps> = ({ isAr }) => {
  const goals = useGoalStore((state) => state.goals);
  const tasks = useTaskStore((state) => state.tasks);
  const deleteGoal = useGoalStore((state) => state.deleteGoal);
  const deleteTask = useTaskStore((state) => state.deleteTask);

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Locate fixture goal if it already exists
  const fixtureGoal = goals.find((g) => g && g.title === GATE_17_4_FIXTURE_MARKER);
  const linkedTasks = fixtureGoal ? tasks.filter((t) => t && t.goalId === fixtureGoal.id) : [];

  const handleCreateFixture = async () => {
    if (fixtureGoal) {
      setFeedback(isAr ? 'البيئة الاختبارية موجودة بالفعل.' : 'Fixture already exists.');
      return;
    }

    setLoading(true);
    setFeedback(null);
    try {
      const now = Date.now();
      const twentyDaysAgo = new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString();
      const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();

      const newFixtureGoal: Goal = {
        id: `goal-fixture-${now}-${Math.random().toString(36).substring(2, 6)}`,
        title: GATE_17_4_FIXTURE_MARKER,
        description: 'Temporary dev fixture for Gate 17.4 Tier 2 manual testing',
        progress: 20,
        createdAt: twentyDaysAgo,
        updatedAt: tenDaysAgo,
      };

      // Persist directly through the standard GoalRepository abstraction
      await RepositoryFactory.getGoalRepository().create(newFixtureGoal);

      // Update goalStore state so all subscribers immediately reflect the new goal
      useGoalStore.setState((state) => ({
        goals: [newFixtureGoal, ...state.goals.filter((g) => g.id !== newFixtureGoal.id)],
        lastUpdated: Date.now(),
      }));

      setFeedback(
        isAr
          ? 'تم إنشاء بيئة اختبار الهدف الراكد بنجاح (updatedAt قبل 10 أيام).'
          : 'Gate 17.4 Tier 2 fixture created successfully (updatedAt 10 days ago).'
      );
    } catch (err: any) {
      console.error('[Gate17.4 Fixture] Failed to create fixture:', err);
      setFeedback(err?.message || (isAr ? 'فشل إنشاء البيئة الاختبارية' : 'Failed to create fixture'));
    } finally {
      setLoading(false);
    }
  };

  const handleCleanupFixture = async () => {
    if (!fixtureGoal) {
      setFeedback(isAr ? 'لا توجد بيئة اختبارية لحذفها.' : 'No fixture goal found to cleanup.');
      return;
    }

    setLoading(true);
    setFeedback(null);
    try {
      const targetGoalId = fixtureGoal.id;

      // 1. Delete tasks explicitly linked to this fixture goal (e.g. created by confirming proposal)
      const tasksToDelete = tasks.filter((t) => t && t.goalId === targetGoalId);
      for (const t of tasksToDelete) {
        await deleteTask(t.id);
      }

      // 2. Delete the fixture goal via the normal goalStore/repository
      await deleteGoal(targetGoalId);

      setFeedback(
        isAr
          ? `تم حذف البيئة الاختبارية بنجاح وتطهير ${tasksToDelete.length} مهمة مرتبطة بها.`
          : `Fixture cleaned up successfully and purged ${tasksToDelete.length} linked task(s).`
      );
    } catch (err: any) {
      console.error('[Gate17.4 Fixture] Failed to cleanup fixture:', err);
      setFeedback(err?.message || (isAr ? 'فشل تطهير البيئة الاختبارية' : 'Failed to cleanup fixture'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="space-y-4 border border-amber-500/40 bg-amber-950/10">
      <div className="flex items-center justify-between border-b border-amber-500/20 pb-3">
        <div className="flex items-center gap-2.5">
          <Wrench className="w-4 h-4 text-amber-400" />
          <div>
            <h2 className="text-sm font-medium text-amber-200">
              {isAr ? 'أدوات المطور: بيئة اختبار Gate 17.4 (المستوى الثاني)' : 'Dev Tools: Gate 17.4 Tier 2 Fixture'}
            </h2>
            <p className="text-xs text-amber-400/70">
              {isAr
                ? 'بيئة اختبار مؤقتة للتحقق من رادار الانتباه (الهدف الراكد > 7 أيام) - بيئة التطوير فقط'
                : 'Temporary fixture to verify Attention Radar (Stalled Goal > 7 days) - DEV only'}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="border-amber-600/50 text-amber-300 bg-amber-950/40">
          TEST / TEMPORARY
        </Badge>
      </div>

      {/* Status Details */}
      <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/80 p-3 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">{isAr ? 'حالة البيئة الاختبارية:' : 'Fixture Status:'}</span>
          <span className={fixtureGoal ? 'text-emerald-400 font-semibold flex items-center gap-1' : 'text-zinc-500'}>
            {fixtureGoal ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isAr ? 'موجودة ونشطة' : 'Active / Exists'}
              </>
            ) : (
              isAr ? 'غير موجودة' : 'Does not exist'
            )}
          </span>
        </div>

        {fixtureGoal && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">{isAr ? 'معرف الهدف (ID):' : 'Fixture Goal ID:'}</span>
              <span className="font-mono text-zinc-300 text-[11px]">{fixtureGoal.id}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">{isAr ? 'تاريخ آخر تحديث (updatedAt):' : 'Fixture updatedAt:'}</span>
              <span className="font-mono text-amber-300 text-[11px]">{fixtureGoal.updatedAt}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">{isAr ? 'نسبة الإنجاز:' : 'Progress:'}</span>
              <span className="font-mono text-zinc-300 text-[11px]">{fixtureGoal.progress}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">{isAr ? 'المهام المرتبطة بالهدف:' : 'Linked Tasks:'}</span>
              <span className="font-mono text-zinc-300 text-[11px]">
                {linkedTasks.length > 0 ? (
                  <span className="text-cyan-400">{linkedTasks.length} {isAr ? 'مهمة' : 'task(s)'}</span>
                ) : (
                  <span className="text-zinc-500">{isAr ? 'لا توجد مهام (راكد)' : 'None (stalled)'}</span>
                )}
              </span>
            </div>
          </>
        )}
      </div>

      {feedback && (
        <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/40 p-2.5 rounded-lg border border-amber-800/40">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Buttons */}
      <div className="flex flex-wrap gap-2.5 pt-1">
        <Button
          id="btn-create-gate174-fixture"
          variant="outline"
          size="sm"
          onClick={handleCreateFixture}
          disabled={loading || !!fixtureGoal}
          className="border-amber-600/50 text-amber-200 hover:bg-amber-950/40 hover:text-amber-100"
        >
          <Wrench className="w-3.5 h-3.5 me-1.5" />
          <span>Create Gate 17.4 Tier 2 Fixture</span>
        </Button>

        <Button
          id="btn-cleanup-gate174-fixture"
          variant="outline"
          size="sm"
          onClick={handleCleanupFixture}
          disabled={loading || !fixtureGoal}
          className="border-rose-600/50 text-rose-300 hover:bg-rose-950/40 hover:text-rose-200"
        >
          <Trash2 className="w-3.5 h-3.5 me-1.5" />
          <span>Cleanup Gate 17.4 Tier 2 Fixture</span>
        </Button>
      </div>
    </Card>
  );
};
