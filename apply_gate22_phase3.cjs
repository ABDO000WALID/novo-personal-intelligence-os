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

  if (!record) {
    return null;
  }

  const preferredKeys = [
    "title",
    "headline",
    "summary",
    "message",
    "description",
    "text",
    "recommendation",
    "reason",
    "label",
    "name",
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
  if (Array.isArray(value)) {
    return value;
  }

  const record = asRecord(value);

  if (!record) {
    return [];
  }

  for (const key of ["items", "insights", "actions", "alerts", "goals"]) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }

  return [];
}

function IntelligenceContent({
  value,
}: {
  value: unknown;
}) {
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
          <li key={`${index}-${item}`}>
            {item}
          </li>
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
}: {
  title: string;
  question: string;
  value: unknown;
  testId: string;
  emphasis?: boolean;
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
      <h2 className="text-base font-semibold text-white">
        {title}
      </h2>

      <p className="mt-1 text-sm text-white/55">
        {question}
      </p>

      <div className="mt-3">
        <IntelligenceContent value={value} />
      </div>
    </section>
  );
}

export default function ProactiveOSSurface() {
  const { getContext } = useIntelligence();
  const context = getContext();

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

      <IntelligenceSection
        title="ملخص اليوم"
        question="ما الذي يحدث في مساحة عملك؟"
        value={context.briefing}
        testId="briefing-section"
      />

      <IntelligenceSection
        title="ما الذي يحتاج انتباهك؟"
        question="الأمور التي قد تحتاج إلى متابعة."
        value={context.attentionRadar}
        testId="attention-radar-section"
      />

      <IntelligenceSection
        title="الخطوة التالية المقترحة"
        question="ما الإجراء الذي يستحق أن تبدأ به الآن؟"
        value={context.nextAction}
        testId="next-action-section"
        emphasis
      />

      <IntelligenceSection
        title="تقدّم الأهداف"
        question="هل تتحرك في الاتجاه الذي يهمك؟"
        value={context.goalPacing}
        testId="goal-pacing-section"
      />

      <IntelligenceSection
        title="رؤى إضافية"
        question="أنماط وملاحظات قد تساعدك على اتخاذ قرار أفضل."
        value={context.insights}
        testId="insights-section"
      />
    </div>
  );
}