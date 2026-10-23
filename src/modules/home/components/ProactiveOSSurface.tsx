import { useState } from "react";
import { useIntelligence } from "../../../core/intelligence/useIntelligence";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

function readText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const record = asRecord(value);
  if (!record) return null;

  const preferredKeys = [
    "title", "headline", "summary", "message", "description",
    "text", "recommendation", "reason", "label", "name",
  ];

  for (const key of preferredKeys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function readItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return [];

  for (const key of ["items", "insights", "actions", "alerts", "goals"]) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }
  return [];
}

function IntelligenceContent({ value }: { value: unknown }) {
  const text = readText(value);
  if (text) {
    return (
      <p className="whitespace-pre-wrap text-sm leading-6 text-white/80">
        {text}
      </p>
    );
  }

  const items = readItems(value)
    .map(readText)
    .filter((item): item is string => Boolean(item))
    .slice(0, 5);

  if (items.length > 0) {
    return (
      <ul className="list-inside list-disc space-y-2 text-sm leading-6 text-white/80">
        {items.map((item, index) => (
          <li key={`${index}-${item}`}>{item}</li>
        ))}
      </ul>
    );
  }

  return (
    <p className="text-sm leading-6 text-white/50">
      لا توجد معلومات متاحة في هذا القسم حاليًا.
    </p>
  );
}

function IntelligenceSection({
  title,
  question,
  value,
  testId,
  emphasis = false,
  children,
}: {
  title: string;
  question: string;
  value: unknown;
  testId: string;
  emphasis?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section
      dir="rtl"
      aria-label={title}
      data-testid={testId}
      className={
        emphasis
          ? "min-w-0 rounded-2xl border border-violet-400/30 bg-violet-500/[0.09] p-5 sm:p-6"
          : "min-w-0 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5"
      }
    >
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-white/55">{question}</p>
      <div className="mt-3">
        <IntelligenceContent value={value} />
        {children}
      </div>
    </section>
  );
}

export default function ProactiveOSSurface({
  onExecuteNextAction,
}: {
  onExecuteNextAction?: (taskId: string) => void | Promise<void>;
}) {
  const { getContext } = useIntelligence();
  const context = getContext();
  
  const [confirmingNextAction, setConfirmingNextAction] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const nextAction = context.nextAction;
  const canExecuteNextAction =
    nextAction.type === "existing_task" &&
    typeof nextAction.selectedTaskId === "string" &&
    typeof onExecuteNextAction === "function";

  const handleConfirmNextAction = async () => {
    // Handler Protection: Prevent double execution
    if (!canExecuteNextAction || isExecuting) {
      return;
    }

    setIsExecuting(true);
    setExecutionError(null);

    try {
      await onExecuteNextAction(nextAction.selectedTaskId);
      setConfirmingNextAction(false); // Only close on success
    } catch (error) {
      setExecutionError("تعذر إكمال المهمة. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCancelConfirmation = () => {
    if (isExecuting) return;
    setConfirmingNextAction(false);
    setExecutionError(null);
  };

  return (
    <div
      dir="rtl"
      data-testid="proactive-os-surface"
      className="w-full min-w-0 space-y-4"
    >
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
          NOVO Intelligence
        </p>
        <h1 className="text-xl font-semibold text-white sm:text-2xl">
          الصورة الكاملة ليومك
        </h1>
        <p className="text-sm leading-6 text-white/60">
          افهم وضعك الحالي، وحدد ما يستحق انتباهك، واختر خطوتك التالية.
        </p>
      </header>

      <IntelligenceSection question="ما الذي يحدث في مساحة عملك؟" testId="briefing-section" title="ملخص اليوم" value={context.briefing}/>
      <IntelligenceSection question="الأمور التي قد تحتاج إلى متابعة." testId="attention-radar-section" title="ما الذي يحتاج انتباهك؟" value={context.attentionRadar}/>

      <IntelligenceSection
        emphasis
        question="ما الإجراء الذي يستحق أن تبدأ به الآن؟"
        testId="next-action-section"
        title="الخطوة التالية المقترحة"
        value={context.nextAction}
      >
        {canExecuteNextAction && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {!confirmingNextAction ? (
                <button
                  type="button"
                  data-testid="next-action-execute-btn"
                  onClick={() => setConfirmingNextAction(true)}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
                >
                  تنفيذ الخطوة
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    data-testid="next-action-confirm-btn"
                    onClick={handleConfirmNextAction}
                    disabled={isExecuting}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
                      isExecuting
                        ? "bg-emerald-600/50 cursor-not-allowed"
                        : "bg-emerald-600 hover:bg-emerald-500"
                    }`}
                  >
                    {isExecuting ? "جاري التنفيذ..." : "تأكيد التنفيذ"}
                  </button>

                  <button
                    type="button"
                    data-testid="next-action-cancel-btn"
                    onClick={handleCancelConfirmation}
                    disabled={isExecuting}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                      isExecuting
                        ? "border-white/5 bg-white/[0.02] text-white/40 cursor-not-allowed"
                        : "border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
                    }`}
                  >
                    إلغاء
                  </button>
                </>
              )}
            </div>

            {/* Error Message UI */}
            {executionError && (
              <p data-testid="next-action-error" className="text-sm font-medium text-rose-400">
                {executionError}
              </p>
            )}
          </div>
        )}
      </IntelligenceSection>

      <IntelligenceSection question="هل تتحرك في الاتجاه الذي يهمك؟" testId="goal-pacing-section" title="تقدّم الأهداف" value={context.goalPacing}/>
      <IntelligenceSection question="أنماط وملاحظات قد تساعدك على اتخاذ قرار أفضل." testId="insights-section" title="رؤى إضافية" value={context.insights}/>
    </div>
  );
}