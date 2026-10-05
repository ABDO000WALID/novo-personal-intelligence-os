import { AIProvider } from './aiProvider';
import {
  NOVOContext,
  FinanceSummary,
  ProductivitySummary,
  GoalHealthResult,
  FocusSummary,
  KnowledgeSummary,
} from '../intelligence/intelligenceTypes';

export interface GoalAlignmentContext {
  goalTitle: string;
  goalDescription?: string;
  currentProgress: number;
  targetDate?: string;
  language: 'ar' | 'en';
}

export interface AlignmentEnrichmentResult {
  suggestedTitle: string;
  reasoning: string;
  isEnriched: boolean;
}

export type AlignmentValidationResult =
  | { isValid: true; suggestedTitle: string; reasoning: string }
  | { isValid: false; reason: string };

/**
 * Builds the strictly bounded prompt sent to the AI for Gate 17.
 * Only selected-goal context is included. No financial, transaction,
 * auth, or unrelated user data is ever passed.
 */
export function buildAlignmentPrompt(context: GoalAlignmentContext): {
  systemInstruction: string;
  userPrompt: string;
} {
  const isAr = context.language === 'ar';

  const systemInstruction = isAr
    ? `أنت مساعد ذكي شخصي في تطبيق NOVO.
مهمتك: اقتراح عنوان مهمة واحدة محددة وقابلة للتنفيذ اليوم وتقديم سبب موجز في جملة واحدة، لمساعدة المستخدم على إحراز تقدم في الهدف المحدد.
القواعد الصارمة:
1. يجب أن تكون الاستجابة بصيغة JSON فقط بهذا الشكل الدقيق:
{
  "suggestedTitle": "عنوان المهمة المقترحة",
  "reasoning": "سبب موجز يوضح كيف تدعم المهمة إنجاز الهدف اليوم"
}
2. يجب أن يكون طول عنوان المهمة بين 3 و 100 حرف.
3. يجب أن تكون المهمة والسبب باللغة العربية فقط.
4. لا تُنشئ أو تُعدل أي معرّفات (IDs) أو تواريخ أو أولويات.
5. لا تُضف أي نصوص أو شروحات خارج كائن الـ JSON.`
    : `You are a personal intelligence assistant in the NOVO application.
Your task: Propose a single concrete, actionable task title for today and a brief one-sentence reasoning to help the user advance their goal.
Strict rules:
1. Respond ONLY with a valid JSON object in this exact schema:
{
  "suggestedTitle": "Actionable task title",
  "reasoning": "One concise sentence explaining how this advances the goal today"
}
2. The task title must be between 3 and 100 characters.
3. The response must be in English only.
4. Do not create or modify any IDs, dates, or priorities.
5. Do not include any commentary or text outside the JSON object.`;

  const descriptionSnippet = context.goalDescription?.trim()
    ? isAr
      ? `وصف الهدف: ${context.goalDescription.trim().substring(0, 300)}`
      : `Goal description: ${context.goalDescription.trim().substring(0, 300)}`
    : '';

  const userPrompt = isAr
    ? `الهدف المختار اليوم:
اسم الهدف: ${context.goalTitle}
${descriptionSnippet ? descriptionSnippet + '\n' : ''}نسبة الإنجاز الحالية: ${context.currentProgress}%
تاريخ التنفيذ: ${context.targetDate || 'اليوم'}

اقترح مهمة واحدة عملية ومناسبة لليوم لدعم هذا الهدف.`
    : `Selected Goal for Today:
Goal title: ${context.goalTitle}
${descriptionSnippet ? descriptionSnippet + '\n' : ''}Current progress: ${context.currentProgress}%
Target date: ${context.targetDate || 'Today'}

Propose a single practical task for today to advance this goal.`;

  return { systemInstruction, userPrompt };
}

/**
 * Validates AI response strictly against Gate 17 safety and schema rules.
 * Never silently repairs semantic AI content or truncates oversized titles.
 */
export function validateAlignmentAIResponse(
  rawText: unknown,
  expectedLanguage: 'ar' | 'en'
): AlignmentValidationResult {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return { isValid: false, reason: 'Raw response is not a non-empty string' };
  }

  let cleaned = rawText.trim();
  // Strip markdown code fences if wrapped by the model
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // Extract JSON bounds if surrounded by accidental text
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return { isValid: false, reason: 'No valid JSON object delimiters found' };
  }

  cleaned = cleaned.substring(firstBrace, lastBrace + 1);

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { isValid: false, reason: 'Failed to parse JSON' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { isValid: false, reason: 'Parsed JSON is not an object' };
  }

  // Validate suggestedTitle
  if (typeof parsed.suggestedTitle !== 'string') {
    return { isValid: false, reason: 'suggestedTitle is missing or not a string' };
  }

  const trimmedTitle = parsed.suggestedTitle.trim();
  if (trimmedTitle.length < 3) {
    return { isValid: false, reason: 'suggestedTitle is below minimum length of 3' };
  }
  if (trimmedTitle.length > 100) {
    // Contract: Do NOT truncate malformed or oversized AI titles -> reject!
    return { isValid: false, reason: 'suggestedTitle exceeds maximum length of 100' };
  }

  // Validate reasoning
  if (typeof parsed.reasoning !== 'string') {
    return { isValid: false, reason: 'reasoning is missing or not a string' };
  }

  const trimmedReasoning = parsed.reasoning.trim();
  if (trimmedReasoning.length < 3) {
    return { isValid: false, reason: 'reasoning is below minimum length of 3' };
  }
  if (trimmedReasoning.length > 250) {
    return { isValid: false, reason: 'reasoning exceeds maximum length of 250' };
  }

  // Language Validation:
  const arabicRegex = /[\u0600-\u06FF]/;
  const englishRegex = /[a-zA-Z]/;

  if (expectedLanguage === 'ar') {
    if (!arabicRegex.test(trimmedTitle)) {
      return { isValid: false, reason: 'suggestedTitle does not contain Arabic text' };
    }
    if (!arabicRegex.test(trimmedReasoning)) {
      return { isValid: false, reason: 'reasoning does not contain Arabic text' };
    }
  } else {
    // English expectation: Must contain latin letters and no Arabic text
    if (!englishRegex.test(trimmedTitle) || arabicRegex.test(trimmedTitle)) {
      return { isValid: false, reason: 'suggestedTitle does not match English language expectation' };
    }
    if (!englishRegex.test(trimmedReasoning) || arabicRegex.test(trimmedReasoning)) {
      return { isValid: false, reason: 'reasoning does not match English language expectation' };
    }
  }

  return {
    isValid: true,
    suggestedTitle: trimmedTitle,
    reasoning: trimmedReasoning,
  };
}

/**
 * Isolated context with zero private/sensitive fields to pass to the provider.
 */
export function createSafeIsolatedContext(): NOVOContext {
  const emptyFinance: FinanceSummary = {
    totalIncome: 0,
    totalExpenses: 0,
    currentBalance: 0,
    recentSpending: 0,
    expensesByCategory: [],
    largestExpenseCategory: null,
    recentTransactionCount: 0,
  };

  const emptyProductivity: ProductivitySummary = {
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    todayTasks: 0,
    todayCompletedTasks: 0,
    completionPercentage: 0,
    highPriorityPendingCount: 0,
    overdueTasksCount: 0,
    recentCompletionRate: 0,
  };

  const emptyGoalHealth: GoalHealthResult = {
    totalGoals: 0,
    activeGoals: 0,
    completedGoals: 0,
    averageProgress: 0,
    goalsBelow25: 0,
    goalsAbove75: 0,
    recentlyUpdatedGoals: 0,
    healthStatus: 'good',
  };

  const emptyFocus: FocusSummary = {
    totalSessions: 0,
    totalFocusedMinutes: 0,
    todaySessions: 0,
    todayFocusMinutes: 0,
    weeklyFocusMinutes: 0,
    averageSessionDuration: 0,
    recentActivityCount: 0,
  };

  const emptyKnowledge: KnowledgeSummary = {
    totalNotes: 0,
    recentlyCreatedNotes: 0,
    recentlyUpdatedNotes: 0,
    notesCreatedThisWeek: 0,
    latestActivity: null,
    totalKnowledgeItems: 0,
    pinnedKnowledgeCount: 0,
  };

  return {
    generatedAt: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
    todayTasks: [],
    completedTasks: [],
    overdueTasks: [],
    activeGoals: [],
    notesCount: 0,
    recentNotes: [],
    recentKnowledge: [],
    focusSessions: [],
    focusStats: emptyFocus,
    moneySummary: emptyFinance,
    tasks: [],
    goals: [],
    focusSummary: emptyFocus,
    financeSummary: emptyFinance,
    knowledgeSummary: emptyKnowledge,
    productivitySummary: emptyProductivity,
    goalHealth: emptyGoalHealth,
    productivityScore: 0,
    recentActivity: [],
    insights: [],
  };
}

/**
 * Synthesizes an AI-enriched task for the deterministically selected goal.
 * Bounded by a 6-second timeout and fails closed to the Gate 16 deterministic fallback.
 */
export async function synthesizeGoalAlignmentTask(params: {
  goalId: string;
  goalTitle: string;
  goalDescription?: string;
  currentProgress: number;
  targetDate?: string;
  language: 'ar' | 'en';
  activeProvider?: AIProvider;
  timeoutMs?: number;
}): Promise<AlignmentEnrichmentResult> {
  const fallbackTitle =
    params.language === 'ar'
      ? `متابعة ومواصلة العمل على: ${params.goalTitle}`
      : `Follow up and continue work on: ${params.goalTitle}`;

  const fallbackReasoning =
    params.language === 'ar'
      ? `مقترح تلقائي لدعم التقدم في الهدف: ${params.goalTitle}`
      : `Automated proposal to advance goal: ${params.goalTitle}`;

  // If no provider or provider unavailable, return fallback immediately
  if (!params.activeProvider || !params.activeProvider.isAvailable()) {
    return {
      suggestedTitle: fallbackTitle,
      reasoning: fallbackReasoning,
      isEnriched: false,
    };
  }

  const { systemInstruction, userPrompt } = buildAlignmentPrompt({
    goalTitle: params.goalTitle,
    goalDescription: params.goalDescription,
    currentProgress: params.currentProgress,
    targetDate: params.targetDate,
    language: params.language,
  });

  const abortController = new AbortController();
  const timeoutMs = params.timeoutMs ?? 6000;
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    const safeContext = createSafeIsolatedContext();
    const response = await params.activeProvider.generateResponse(
      userPrompt,
      safeContext,
      {
        systemInstruction,
        abortSignal: abortController.signal,
        temperature: 0.3,
        maxOutputTokens: 250,
      }
    );

    clearTimeout(timeoutId);

    const validation = validateAlignmentAIResponse(response?.text, params.language);
    if (!validation.isValid) {
      return {
        suggestedTitle: fallbackTitle,
        reasoning: fallbackReasoning,
        isEnriched: false,
      };
    }

    return {
      suggestedTitle: validation.suggestedTitle,
      reasoning: validation.reasoning,
      isEnriched: true,
    };
  } catch {
    clearTimeout(timeoutId);
    return {
      suggestedTitle: fallbackTitle,
      reasoning: fallbackReasoning,
      isEnriched: false,
    };
  }
}

export interface NextActionRationaleParams {
  taskTitle: string;
  taskPriority: string;
  taskDate: string;
  isOverdue: boolean;
  goalTitle?: string;
  goalProgress?: number;
  language: 'ar' | 'en';
  activeProvider?: AIProvider | null;
  timeoutMs?: number;
}

export interface NextActionRationaleResult {
  rationale: string;
  isEnriched: boolean;
}

/**
 * Strictly validates AI JSON response for next action rationale.
 * Must be valid JSON with non-empty string `rationale` <= 200 chars.
 * Must respect language constraints.
 */
export function validateNextActionRationaleResponse(
  rawText: string | undefined,
  language: 'ar' | 'en'
): { isValid: boolean; rationale?: string } {
  if (!rawText || typeof rawText !== 'string') {
    return { isValid: false };
  }

  let jsonStr = rawText.trim();
  const markdownMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (markdownMatch) {
    jsonStr = markdownMatch[1].trim();
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { isValid: false };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { isValid: false };
  }

  const rationale = parsed.rationale;
  if (typeof rationale !== 'string' || rationale.trim().length === 0) {
    return { isValid: false };
  }

  const cleanRationale = rationale.trim();
  if (cleanRationale.length > 200) {
    return { isValid: false };
  }

  if (language === 'ar') {
    const hasArabic = /[\u0600-\u06FF]/.test(cleanRationale);
    if (!hasArabic) {
      return { isValid: false };
    }
  }

  return { isValid: true, rationale: cleanRationale };
}

/**
 * Synthesizes an AI rationale for an already-selected next action task.
 * Falls back to deterministic rationale if unavailable, timed out, or invalid.
 */
export async function synthesizeNextActionRationale(
  params: NextActionRationaleParams
): Promise<NextActionRationaleResult> {
  // Deterministic fallback rationale
  let fallbackRationale = '';
  if (params.language === 'ar') {
    if (params.isOverdue) {
      fallbackRationale = 'مهمة متأخرة ذات أولوية تستحق الإنجاز أولاً لاستعادة التركيز.';
    } else if (params.goalTitle) {
      fallbackRationale = `مهمة ذات أولوية لتعزيز التقدم في هدف "${params.goalTitle}".`;
    } else {
      fallbackRationale = 'مهمة محددة لليوم ذات أولوية موصى بالبدء بها.';
    }
  } else {
    if (params.isOverdue) {
      fallbackRationale = 'An overdue priority task that should be tackled first to regain momentum.';
    } else if (params.goalTitle) {
      fallbackRationale = `A priority task scheduled for today to advance your goal "${params.goalTitle}".`;
    } else {
      fallbackRationale = 'A priority task scheduled for today recommended to tackle next.';
    }
  }

  if (!params.activeProvider || !params.activeProvider.isAvailable()) {
    return {
      rationale: fallbackRationale,
      isEnriched: false,
    };
  }

  const systemInstruction =
    params.language === 'ar'
      ? `أنت المساعد الذكي لتبرير الخطوة التالية في تطبيق NOVO.
اكتب جملة واحدة وموجزة باللغة العربية تشرح للمستخدم سبب ملاءمة البدء بهذه المهمة المحددة مسبقاً الآن.
لا تقترح أي مهام أخرى ولا تغير المهمة.
أخرج النتيجة ككائن JSON فقط بهذا الشكل:
{"rationale": "..."}`
      : `You are NOVO's Next Action Rationale Assistant.
Write a single concise sentence in English explaining why tackling this already-selected task is appropriate now.
Do NOT suggest any other tasks or change the task.
Output ONLY a JSON object in this exact schema:
{"rationale": "..."}`;

  const userPrompt =
    params.language === 'ar'
      ? `المهمة المختارة: "${params.taskTitle}"
الأولوية: ${params.taskPriority}
التاريخ: ${params.taskDate} (${params.isOverdue ? 'متأخرة' : 'اليوم'})
${params.goalTitle ? `الهدف المرتبط: "${params.goalTitle}" (التقدم: ${params.goalProgress ?? 0}%)` : 'مهمة عامة غير مرتبطة بهدف'}
وضح في جملة واحدة موجزة سبب إنجاز هذه المهمة الآن.`
      : `Selected Task: "${params.taskTitle}"
Priority: ${params.taskPriority}
Date: ${params.taskDate} (${params.isOverdue ? 'Overdue' : 'Today'})
${params.goalTitle ? `Linked Goal: "${params.goalTitle}" (${params.goalProgress ?? 0}% progress)` : 'Unlinked Task'}
Explain concisely in one sentence why tackling this specific task is appropriate now.`;

  const abortController = new AbortController();
  const timeoutMs = params.timeoutMs ?? 6000;
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    const safeContext = createSafeIsolatedContext();
    const response = await params.activeProvider.generateResponse(
      userPrompt,
      safeContext,
      {
        systemInstruction,
        abortSignal: abortController.signal,
        temperature: 0.3,
        maxOutputTokens: 150,
      }
    );

    clearTimeout(timeoutId);

    const validation = validateNextActionRationaleResponse(response?.text, params.language);
    if (!validation.isValid || !validation.rationale) {
      return {
        rationale: fallbackRationale,
        isEnriched: false,
      };
    }

    return {
      rationale: validation.rationale,
      isEnriched: true,
    };
  } catch {
    clearTimeout(timeoutId);
    return {
      rationale: fallbackRationale,
      isEnriched: false,
    };
  }
}

/**
 * Validates AI attention insight JSON response.
 * Schema: { "insight": string }
 */
export function validateAttentionInsightResponse(
  rawText: string | undefined,
  expectedLanguage: 'ar' | 'en'
): { isValid: boolean; insight?: string; error?: string } {
  if (!rawText || typeof rawText !== 'string' || rawText.trim() === '') {
    return { isValid: false, error: 'Empty response' };
  }

  let cleaned = rawText.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch && jsonMatch[1]) {
    cleaned = jsonMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { isValid: false, error: 'Failed to parse JSON' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { isValid: false, error: 'Parsed output is not an object' };
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.insight !== 'string') {
    return { isValid: false, error: 'Missing or non-string insight' };
  }

  const insight = obj.insight.trim();
  if (insight.length < 5) {
    return { isValid: false, error: 'Insight is too short' };
  }
  if (insight.length > 250) {
    return { isValid: false, error: 'Insight exceeds maximum length (250 chars)' };
  }

  // Language check
  const arabicRegex = /[\u0600-\u06FF]/;
  const hasArabic = arabicRegex.test(insight);
  if (expectedLanguage === 'ar' && !hasArabic) {
    return { isValid: false, error: 'Expected Arabic insight but received other language' };
  }
  if (expectedLanguage === 'en' && hasArabic) {
    return { isValid: false, error: 'Expected English insight but received Arabic' };
  }

  return { isValid: true, insight };
}

export interface SynthesizeAttentionInsightParams {
  tier: 1 | 3 | 4 | 5;
  type: string;
  itemTitle?: string;
  details?: string;
  activeProvider: AIProvider;
  language: 'ar' | 'en';
  timeoutMs?: number;
}

/**
 * Synthesizes a bounded, 1-2 sentence executive insight for Attention Radar tiers 1, 3, 4, 5.
 * Strictly bounded: 6-second timeout, zero write operations, fail-safe fallback.
 * Excludes all financial and private note data.
 */
export async function synthesizeAttentionInsight(
  params: SynthesizeAttentionInsightParams
): Promise<{ insight: string; isEnriched: boolean }> {
  // Deterministic fallbacks
  let fallbackInsight = '';
  if (params.tier === 1) {
    fallbackInsight =
      params.language === 'ar'
        ? 'المهام المتأخرة تعيق تقدمك اليومي، إنجازها أو جدولتها فوراً يعيد التوازن لمسار عملك.'
        : 'Overdue tasks bottleneck daily momentum; resolving or rescheduling them restores workflow balance.';
  } else if (params.tier === 3) {
    fallbackInsight =
      params.language === 'ar'
        ? 'التركيز على إنجاز المهمة ذات الأولوية العالية يضمن تحقيق الأثر الأكبر في يومك.'
        : 'Focusing on this high-priority task ensures the greatest strategic impact for your day.';
  } else if (params.tier === 4) {
    fallbackInsight =
      params.language === 'ar'
        ? 'مع تراكم المهام وغياب التركيز العميق، بدء جلسة بومودورو يساعدك على كسر الجمود واستعادة الزخم.'
        : 'With pending tasks and no deep focus logged, starting a Pomodoro session overcomes inertia.';
  } else {
    fallbackInsight =
      params.language === 'ar'
        ? 'مساحة عملك متوازنة ومنتظمة، استمر على هذا النسق الإيجابي في تحقيق أهدافك.'
        : 'Your workspace is balanced and on track. Maintain this steady rhythm toward your goals.';
  }

  if (!params.activeProvider || !params.activeProvider.isAvailable) {
    return { insight: fallbackInsight, isEnriched: false };
  }

  const systemInstruction =
    params.language === 'ar'
      ? `أنت المحلل التنفيذي لرادار الانتباه في تطبيق NOVO.
اكتب جملة أو جملتين تنفيذيتين باللغة العربية تشرح للمستخدم أهمية هذا العنصر أو كيفية الحفاظ على الزخم.
أخرج النتيجة ككائن JSON فقط بهذا الشكل:
{"insight": "..."}`
      : `You are NOVO's Executive Attention Radar Analyst.
Write 1-2 concise executive sentences in English explaining why this attention item matters and how to maintain momentum.
Output ONLY a JSON object in this exact schema:
{"insight": "..."}`;

  const userPrompt =
    params.language === 'ar'
      ? `مستوى التنبيه: مستوى ${params.tier} (${params.type})
العنصر: "${params.itemTitle || 'لا يوجد عنصر فردي'}"
التفاصيل: ${params.details || 'لا توجد تفاصيل إضافية'}
قدم تحليلاً تنفيذياً موجزاً في جملة أو جملتين.`
      : `Alert Tier: Tier ${params.tier} (${params.type})
Item: "${params.itemTitle || 'No individual item'}"
Details: ${params.details || 'No additional details'}
Provide a concise executive insight in 1-2 sentences.`;

  const abortController = new AbortController();
  const timeoutMs = params.timeoutMs ?? 6000;
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    const safeContext = createSafeIsolatedContext();
    const response = await params.activeProvider.generateResponse(
      userPrompt,
      safeContext,
      {
        systemInstruction,
        abortSignal: abortController.signal,
        temperature: 0.3,
        maxOutputTokens: 150,
      }
    );

    clearTimeout(timeoutId);

    const validation = validateAttentionInsightResponse(response?.text, params.language);
    if (!validation.isValid || !validation.insight) {
      return { insight: fallbackInsight, isEnriched: false };
    }

    return { insight: validation.insight, isEnriched: true };
  } catch {
    clearTimeout(timeoutId);
    return { insight: fallbackInsight, isEnriched: false };
  }
}

// ============================================================================
// GATE 17.5B: GOAL PACING INTELLIGENCE (Strictly Bounded Schema & Validator)
// ============================================================================

import { GoalActivityState, GoalPacingAnalysis } from '../intelligence/goalVelocityEngine';

export interface GoalPacingFactContext {
  goalTitle: string;
  currentProgress: number;
  ageDays: number;
  lifetimePace: number;
  executionCompletionRatio: number | 'no_data';
  overdueLinkedTaskCount: number;
  todayLinkedTaskCount: number;
  upcomingLinkedTaskCount: number;
  focusMinutes: number;
  activityState: GoalActivityState;
}

export interface GoalPacingHighlight {
  goalTitle: string;
  state: GoalActivityState;
  keyMetricObservation: string;
}

export interface GoalPacingAIResponse {
  summary: string;
  highlights: GoalPacingHighlight[];
}

export interface GoalPacingSynthesisResult {
  summary: string;
  highlights: GoalPacingHighlight[];
  isEnriched: boolean;
}

/**
 * Validates the strict JSON response from AI for Goal Pacing.
 * Rejects if:
 * - Malformed JSON
 * - Missing required fields (summary, highlights)
 * - Highlights containing unknown goal titles or invented goals
 * - State does not exactly match the deterministic state
 * - Contains prohibited acceleration/deceleration claims or predictions
 * - Contains unsupported numeric claims not present in facts
 * - Contains task creation or goal mutation instructions
 */
export function validateGoalPacingAIResponse(
  rawResponseText: string | undefined | null,
  validFacts: GoalPacingFactContext[]
): { isValid: true; data: GoalPacingAIResponse } | { isValid: false; reason: string } {
  if (!rawResponseText || typeof rawResponseText !== 'string') {
    return { isValid: false, reason: 'Empty or non-string response' };
  }

  // Strip Markdown code fences if present
  let cleanJson = rawResponseText.trim();
  if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleanJson);
  } catch {
    return { isValid: false, reason: 'Malformed JSON' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { isValid: false, reason: 'Root is not an object' };
  }

  if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
    return { isValid: false, reason: 'Missing or empty summary' };
  }

  if (!Array.isArray(parsed.highlights)) {
    return { isValid: false, reason: 'Missing or invalid highlights array' };
  }

  // Build facts lookup
  const factsByTitle = new Map<string, GoalPacingFactContext>();
  for (const f of validFacts) {
    factsByTitle.set(f.goalTitle, f);
  }

  const validHighlights: GoalPacingHighlight[] = [];
  const allowedStates: GoalActivityState[] = [
    'No Execution Data',
    'Dormant / Stalled',
    'Pacing Deficit',
    'Active',
    'Steady',
  ];

  // Prohibited terms check across the response text
  const prohibitedPatterns = [
    /accelerat(e|ed|ing|ion)/i,
    /decelerat(e|ed|ing|ion)/i,
    /تسارع/,
    /تباطؤ/,
    /تنبؤ/,
    /أتوقع أن تكتمل في/,
    /predict(ion|ed)?\b/i,
    /will complete on\b/i,
    /completion date is\b/i,
    /create task\b/i,
    /أنشئ مهمة/i,
    /update progress to\b/i,
    /عدل نسبة التقدم إلى/i,
  ];

  const fullText = `${parsed.summary} ${parsed.highlights.map((h: any) => h?.keyMetricObservation || '').join(' ')}`;
  for (const pattern of prohibitedPatterns) {
    if (pattern.test(fullText)) {
      return { isValid: false, reason: `Contains prohibited pattern: ${pattern.toString()}` };
    }
  }

  // Check each highlight
  for (const h of parsed.highlights) {
    if (!h || typeof h !== 'object') {
      return { isValid: false, reason: 'Highlight is not an object' };
    }

    if (typeof h.goalTitle !== 'string' || !factsByTitle.has(h.goalTitle)) {
      return { isValid: false, reason: `Unknown or invented goal title: "${h.goalTitle}"` };
    }

    const expectedFact = factsByTitle.get(h.goalTitle)!;

    if (!allowedStates.includes(h.state) || h.state !== expectedFact.activityState) {
      return { isValid: false, reason: `State mismatch for goal "${h.goalTitle}": expected "${expectedFact.activityState}", got "${h.state}"` };
    }

    if (typeof h.keyMetricObservation !== 'string' || !h.keyMetricObservation.trim()) {
      return { isValid: false, reason: `Missing keyMetricObservation for goal "${h.goalTitle}"` };
    }

    // Prohibit arbitrary new numbers: check if numbers mentioned in observation exist in deterministic facts
    // Extract numbers from observation
    const numbersInObservation = h.keyMetricObservation.match(/\b\d+(\.\d+)?\b/g);
    if (numbersInObservation) {
      const allowedNumbers = new Set<string>([
        String(expectedFact.currentProgress),
        String(expectedFact.ageDays),
        String(expectedFact.lifetimePace),
        String(expectedFact.overdueLinkedTaskCount),
        String(expectedFact.todayLinkedTaskCount),
        String(expectedFact.upcomingLinkedTaskCount),
        String(expectedFact.focusMinutes),
      ]);
      if (expectedFact.executionCompletionRatio !== 'no_data') {
        allowedNumbers.add(String(expectedFact.executionCompletionRatio));
      }
      // Also allow 0, 1, 2 for counts if reasonable, but flag arbitrary numbers like 50, 99
      for (const numStr of numbersInObservation) {
        const numVal = parseFloat(numStr);
        // If it's a small integer <= 3 used as counting words, allow
        if (numVal >= 0 && numVal <= 3) continue;
        if (!allowedNumbers.has(numStr) && !allowedNumbers.has(String(Math.round(numVal)))) {
          return { isValid: false, reason: `Unsupported numeric claim "${numStr}" in observation for "${h.goalTitle}"` };
        }
      }
    }

    validHighlights.push({
      goalTitle: h.goalTitle,
      state: h.state,
      keyMetricObservation: h.keyMetricObservation.trim(),
    });
  }

  return {
    isValid: true,
    data: {
      summary: parsed.summary.trim(),
      highlights: validHighlights,
    },
  };
}

/**
 * Synthesizes AI explanation layer for Goal Pacing with strict 6s timeout and deterministic fallback.
 * Strictly adheres to privacy boundaries: ONLY already-computed pacing facts are sent.
 */
export async function synthesizeGoalPacingExplanation(params: {
  analyses: GoalPacingAnalysis[];
  mode: 'portfolio' | 'single';
  activeProvider: AIProvider | null;
  language: 'ar' | 'en';
  timeoutMs?: number;
}): Promise<GoalPacingSynthesisResult> {
  const isAr = params.language === 'ar';

  // Build facts context strictly from analyses
  const facts: GoalPacingFactContext[] = params.analyses.map((a) => ({
    goalTitle: a.goalTitle,
    currentProgress: a.currentProgress,
    ageDays: a.ageDays,
    lifetimePace: a.lifetimePace,
    executionCompletionRatio: a.executionCompletionRatio,
    overdueLinkedTaskCount: a.overdueLinkedTaskCount,
    todayLinkedTaskCount: a.todayLinkedTaskCount,
    upcomingLinkedTaskCount: a.upcomingLinkedTaskCount,
    focusMinutes: a.focusMinutes,
    activityState: a.activityState,
  }));

  // Build deterministic fallback
  const fallbackHighlights: GoalPacingHighlight[] = facts.map((f) => {
    const ratioText =
      f.executionCompletionRatio === 'no_data'
        ? (isAr ? 'لا توجد مهام مرتبطة' : 'no linked tasks')
        : `${f.executionCompletionRatio}%`;
    const obs = isAr
      ? `نسبة التقدم ${f.currentProgress}%، عمر الهدف ${f.ageDays} يوم، والوتيرة ${f.lifetimePace}%/يوم، وإنجاز المهام ${ratioText}`
      : `Progress ${f.currentProgress}%, age ${f.ageDays}d, pace ${f.lifetimePace}%/d, task completion ${ratioText}`;
    return {
      goalTitle: f.goalTitle,
      state: f.activityState,
      keyMetricObservation: obs,
    };
  });

  const fallbackSummary = isAr
    ? (params.mode === 'single'
        ? `تحليل وتيرة الهدف "${facts[0]?.goalTitle}": الحالة الحالية هي ${facts[0]?.activityState}.`
        : `تحليل وتيرة المحفظة لـ ${facts.length} أهداف نشطة مبني على مؤشرات الإنجاز والمهام المسجلة.`)
    : (params.mode === 'single'
        ? `Goal pacing analysis for "${facts[0]?.goalTitle}": current state is ${facts[0]?.activityState}.`
        : `Portfolio pacing analysis for ${facts.length} active goals based on recorded execution facts.`);

  if (!params.activeProvider || facts.length === 0) {
    return {
      summary: fallbackSummary,
      highlights: fallbackHighlights,
      isEnriched: false,
    };
  }

  const systemInstruction = isAr
    ? `أنت المحلل التنفيذي لوتيرة الأهداف في تطبيق NOVO.
مهمتك: تقديم ملخص تنفيذي موجز (جملة أو جملتان) وملاحظة محددة لكل هدف استناداً حصرياً إلى الحقائق الرقمية والحالات المعطاة.
القواعد الصارمة:
1. الرد حصراً بصيغة JSON وفق المخطط التالي:
{
  "summary": "جملة أو جملتان تلخصان الوضع العام",
  "highlights": [
    {
      "goalTitle": "نفس عنوان الهدف المعطى تماماً",
      "state": "نفس الحالة تماماً",
      "keyMetricObservation": "ملاحظة تشرح الأرقام المعطاة"
    }
  ]
}
2. لا تخترع أي أرقام أو أهداف غير موجودة في الحقائق.
3. لا تدّع وجود تسارع أو تباطؤ أو تتنبأ بمواعيد انتهاء.
4. لا تقترح إنشاء مهام أو تعديل أهداف.`
    : `You are NOVO's Executive Goal Pacing Analyst.
Your task: Provide a concise executive summary (1-2 sentences) and key metric observation for each supplied goal strictly grounded in the given deterministic facts.
Strict rules:
1. Output ONLY a valid JSON object matching this schema:
{
  "summary": "1-2 concise executive sentences",
  "highlights": [
    {
      "goalTitle": "exact supplied goal title",
      "state": "exact supplied activity state",
      "keyMetricObservation": "observation describing the supplied metrics"
    }
  ]
}
2. Do NOT invent goals, numbers, or history.
3. Do NOT claim acceleration or deceleration, and do NOT predict completion dates.
4. Do NOT include task creation or goal modification recommendations.`;

  const factsJson = JSON.stringify(facts, null, 2);
  const userPrompt = isAr
    ? `الحقائق الحتمية لوتيرة الأهداف:\n${factsJson}\n\nقدم الملخص والملاحظات التنفيذية بصيغة JSON المطلوبة فقط.`
    : `Deterministic Goal Pacing Facts:\n${factsJson}\n\nProvide the executive summary and highlights in the required JSON schema only.`;

  const abortController = new AbortController();
  const timeoutMs = params.timeoutMs ?? 6000;
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    const safeContext = createSafeIsolatedContext();
    const response = await params.activeProvider.generateResponse(
      userPrompt,
      safeContext,
      {
        systemInstruction,
        abortSignal: abortController.signal,
        temperature: 0.2,
        maxOutputTokens: 400,
      }
    );

    clearTimeout(timeoutId);

    const validation = validateGoalPacingAIResponse(response?.text, facts);
    if (!validation.isValid || !validation.data) {
      return {
        summary: fallbackSummary,
        highlights: fallbackHighlights,
        isEnriched: false,
      };
    }

    return {
      summary: validation.data.summary,
      highlights: validation.data.highlights,
      isEnriched: true,
    };
  } catch {
    clearTimeout(timeoutId);
    return {
      summary: fallbackSummary,
      highlights: fallbackHighlights,
      isEnriched: false,
    };
  }
}
