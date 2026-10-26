import { useState } from "react";
import { useIntelligence } from "../../../core/intelligence/useIntelligence";
import { useTaskStore } from "../../../core/state/taskStore";

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
  onCreateNextAction,
}: {
  onExecuteNextAction?: (taskId: string) => void | Promise<void>;
  onCreateNextAction?: (title: string) => void | Promise<void>;
}) {
  const { getContext } = useIntelligence();
  const context = getContext();
  
  const [confirmingNextAction, setConfirmingNextAction] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  
  // GATE 27: Ambiguous state lock for prolonged timeouts
  const [isAmbiguous, setIsAmbiguous] = useState(false);
  
  // Phase 4C: Local state for new task input
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const nextAction = context.nextAction;
  
  // GATE 25: Real Authenticated Mutation Check
  const canExecuteExisting =
    nextAction?.type === "existing_task" &&
    typeof nextAction.selectedTaskId === "string";

  // Gate 22 Phase 4C: New Task Execution
  const canExecuteNew =
    nextAction?.type === "new_task_required" &&
    typeof onCreateNextAction === "function";

  const handleConfirmExisting = async () => {
    // Prevent duplicate clicks or clicks while in an ambiguous state
    if (!canExecuteExisting || isExecuting || isAmbiguous) return;

    setIsExecuting(true);
    setExecutionError(null);

    try {
      const taskId = nextAction.selectedTaskId as string;
      
      // GATE 27: Timeout Race (8 seconds)
      const mutationPromise = useTaskStore.getState().completeTask(taskId);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT_AMBIGUOUS")), 8000)
      );

      await Promise.race([mutationPromise, timeoutPromise]);
      
      setConfirmingNextAction(false); 
      setIsExecuting(false);
    } catch (error: any) {
      if (error.message === "TIMEOUT_AMBIGUOUS") {
        // GATE 27: Prolonged execution fallback
        setExecutionError("لم نتمكن من تأكيد النتيجة بسبب ضعف الاتصال. يرجى تحديث الصفحة لاحقاً.");
        setIsAmbiguous(true);
        // We deliberately do NOT set isExecuting(false) here to permanently lock the button for this session
      } else {
        setExecutionError("تعذر إكمال المهمة. يرجى المحاولة مرة أخرى.");
        setIsExecuting(false);
      }
    }
  };

  const handleConfirmNew = async () => {
    if (!canExecuteNew || isExecuting) return;
    
    const trimmedTitle = newTaskTitle.trim();
    if (!trimmedTitle) return;

    setIsExecuting(true);
    setExecutionError(null);

    try {
      await onCreateNextAction(trimmedTitle);
      setNewTaskTitle(""); // Clear input only on success
      setConfirmingNextAction(false);
    } catch (error) {
      setExecutionError("تعذر إنشاء المهمة. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCancelConfirmation = () => {
    if (isExecuting) return;
    setConfirmingNextAction(false);
    setExecutionError(null);
    setNewTaskTitle("");
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
        {/* Phase 4B: Existing Task UI */}
        {canExecuteExisting && (
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
                    onClick={handleConfirmExisting}
                    disabled={isExecuting || isAmbiguous}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
                      (isExecuting || isAmbiguous)
                        ? "bg-emerald-600/50 cursor-not-allowed"
                        : "bg-emerald-600 hover:bg-emerald-500"
                    }`}
                  >
                    {isExecuting && !isAmbiguous ? "جاري التنفيذ..." : isAmbiguous ? "غير مؤكد" : "تأكيد التنفيذ"}
                  </button>

                  <button
                    type="button"
                    data-testid="next-action-cancel-btn"
                    onClick={handleCancelConfirmation}
                    disabled={isExecuting || isAmbiguous}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                      (isExecuting || isAmbiguous)
                        ? "border-white/5 bg-white/[0.02] text-white/40 cursor-not-allowed"
                        : "border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
                    }`}
                  >
                    إلغاء
                  </button>
                </>
              )}
            </div>

            {executionError && (
              <p data-testid="next-action-error" className={`text-sm font-medium ${isAmbiguous ? "text-amber-400" : "text-rose-400"}`}>
                {executionError}
              </p>
            )}
          </div>
        )}

        {/* Phase 4C: New Task UI */}
        {canExecuteNew && (
          <div className="mt-4 flex flex-col gap-3">
            {!confirmingNextAction ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="new-task-execute-btn"
                  onClick={() => setConfirmingNextAction(true)}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
                >
                  إضافة المهمة
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="اكتب عنوان المهمة هنا..."
                  disabled={isExecuting}
                  autoFocus
                  className="w-full sm:w-2/3 rounded-lg border border-white/10 bg-black/20 p-2.5 text-sm text-white placeholder-white/40 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && newTaskTitle.trim()) {
                      e.preventDefault();
                      handleConfirmNew();
                    }
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-testid="new-task-confirm-btn"
                    onClick={handleConfirmNew}
                    disabled={isExecuting || !newTaskTitle.trim()}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
                      isExecuting || !newTaskTitle.trim()
                        ? "bg-emerald-600/50 cursor-not-allowed"
                        : "bg-emerald-600 hover:bg-emerald-500"
                    }`}
                  >
                    {isExecuting ? "جاري الإنشاء..." : "تأكيد الإنشاء"}
                  </button>

                  <button
                    type="button"
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
                </div>
              </div>
            )}
            
            {executionError && (
              <p className="text-sm font-medium text-rose-400">
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