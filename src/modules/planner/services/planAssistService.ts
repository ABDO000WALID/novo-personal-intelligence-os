import { aiOrchestrator, AIOrchestrator } from '../../../core/ai/aiOrchestrator';
import { NOVOContext } from '../../../core/intelligence/intelligenceTypes';
import { Task, Goal } from '../../../types/data';
import { useGoalStore } from '../../../core/state/goalStore';
import {
  PlanAssistSuggestion,
  PlanAssistResult,
  PlanAssistPlanningContext,
  PlanAssistResponse,
  PlanAssistError,
  ParsePlanAssistOptions,
} from './planAssistTypes';

/**
 * Validates an individual Plan Assist suggestion item.
 * Strictly verifies required fields and sanitizes output, omitting any extra AI fields.
 * Validates optional goalId against availableGoals (or goalStore). Hallucinated/invalid IDs are stripped.
 */
export function validatePlanAssistSuggestion(
  item: unknown,
  availableGoals?: Array<{ id: string }> | Goal[]
): PlanAssistSuggestion | null {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return null;
  }

  const obj = item as Record<string, unknown>;
  const type = obj.type;

  if (type === 'new_task') {
    if (typeof obj.title !== 'string' || !obj.title.trim()) {
      return null;
    }
    if (obj.priority !== 'low' && obj.priority !== 'medium' && obj.priority !== 'high') {
      return null;
    }
    if (typeof obj.reason !== 'string' || !obj.reason.trim()) {
      return null;
    }

    // Strict goal validation: only accept existing goal IDs
    let validGoalId: string | undefined = undefined;
    if (typeof obj.goalId === 'string' && obj.goalId.trim()) {
      const candidate = obj.goalId.trim();
      let goalsList: Array<{ id: string }> | undefined = availableGoals;
      if (goalsList === undefined) {
        try {
          goalsList = useGoalStore.getState().goals;
        } catch {
          goalsList = undefined;
        }
      }

      if (goalsList && goalsList.some((g) => g.id === candidate)) {
        validGoalId = candidate;
      }
      // If candidate is not in goalsList (or unavailable), validGoalId remains undefined (stripped)
    }

    return {
      type: 'new_task',
      title: obj.title.trim(),
      priority: obj.priority,
      reason: obj.reason.trim(),
      ...(validGoalId ? { goalId: validGoalId } : {}),
    };
  }

  if (type === 'priority_change') {
    if (typeof obj.taskId !== 'string' || !obj.taskId.trim()) {
      return null;
    }
    if (obj.priority !== 'low' && obj.priority !== 'medium' && obj.priority !== 'high') {
      return null;
    }
    if (typeof obj.reason !== 'string' || !obj.reason.trim()) {
      return null;
    }

    return {
      type: 'priority_change',
      taskId: obj.taskId.trim(),
      priority: obj.priority,
      reason: obj.reason.trim(),
    };
  }

  return null;
}

/**
 * Extracts raw JSON substring from potentially fenced or formatted AI response text.
 */
export function extractJsonFromText(raw: string): string {
  let text = raw.trim();

  // 1. Check for entire fenced block ```json ... ```
  const outerFence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (outerFence) {
    return outerFence[1].trim();
  }

  // 2. Check for fenced block anywhere in text
  const innerFence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (innerFence) {
    return innerFence[1].trim();
  }

  // 3. Fallback: locate outermost { and }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.substring(firstBrace, lastBrace + 1).trim();
  }

  return text;
}

/**
 * Parses and validates raw AI text response into a strict PlanAssistResult.
 */
export function parsePlanAssistResponse(
  rawText: string,
  options?: ParsePlanAssistOptions
): PlanAssistResponse {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return {
      success: false,
      error: {
        code: 'EMPTY_OUTPUT',
        message: 'AI returned an empty response.',
        messageAr: 'أرجع الذكاء الاصطناعي استجابة فارغة.',
        isAborted: false,
      },
    };
  }

  const jsonString = extractJsonFromText(rawText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'MALFORMED_OUTPUT',
        message: 'Failed to parse AI output as valid JSON.',
        messageAr: 'فشل تحليل مخرجات الذكاء الاصطناعي كملف JSON صالح.',
        isAborted: false,
        rawError: err,
      },
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      success: false,
      error: {
        code: 'MALFORMED_OUTPUT',
        message: 'AI response root must be an object.',
        messageAr: 'يجب أن يكون جذر استجابة الذكاء الاصطناعي كائناً.',
        isAborted: false,
      },
    };
  }

  const record = parsed as Record<string, unknown>;

  if (typeof record.summary !== 'string' || !record.summary.trim()) {
    return {
      success: false,
      error: {
        code: 'MALFORMED_OUTPUT',
        message: 'AI response is missing a valid non-empty summary string.',
        messageAr: 'استجابة الذكاء الاصطناعي تفتقر إلى ملخص نصي صالح.',
        isAborted: false,
      },
    };
  }

  if (!Array.isArray(record.suggestions)) {
    return {
      success: false,
      error: {
        code: 'MALFORMED_OUTPUT',
        message: 'AI response is missing a suggestions array.',
        messageAr: 'استجابة الذكاء الاصطناعي تفتقر إلى مصفوفة الاقتراحات.',
        isAborted: false,
      },
    };
  }

  const validSuggestions: PlanAssistSuggestion[] = [];
  let hasInvalidItem = false;

  for (const item of record.suggestions) {
    const validated = validatePlanAssistSuggestion(item, options?.availableGoals);
    if (validated) {
      validSuggestions.push(validated);
    } else {
      hasInvalidItem = true;
    }
  }

  if (options?.strict && hasInvalidItem) {
    return {
      success: false,
      error: {
        code: 'MALFORMED_OUTPUT',
        message: 'One or more suggestions failed validation in strict mode.',
        messageAr: 'فشل التحقق من صحة أحد الاقتراحات في الوضع الصارم.',
        isAborted: false,
      },
    };
  }

  return {
    success: true,
    data: {
      summary: record.summary.trim(),
      suggestions: validSuggestions,
    },
  };
}

/**
 * Checks whether a suggested action duplicates existing tasks.
 */
export function isDuplicateSuggestion(
  suggestion: PlanAssistSuggestion,
  existingTasks: Array<{ id: string; title: string; priority: string }>
): boolean {
  if (suggestion.type === 'new_task') {
    const normalizedNewTitle = suggestion.title.trim().toLowerCase();
    return existingTasks.some(
      (t) => t.title.trim().toLowerCase() === normalizedNewTitle
    );
  }

  if (suggestion.type === 'priority_change') {
    const existing = existingTasks.find((t) => t.id === suggestion.taskId);
    if (!existing) return false;
    return existing.priority === suggestion.priority;
  }

  return false;
}

/**
 * Constructs a minimal, privacy-scoped NOVOContext for ChatOrchestrationRequest.
 * Strictly excludes financial, notes, knowledge vault, and chat history.
 */
export function buildScopedPlanAssistNOVOContext(
  ctx: PlanAssistPlanningContext
): NOVOContext {
  const pending = ctx.existingTasks.filter((t) => !t.completed);
  const completed = ctx.existingTasks.filter((t) => t.completed);
  const highPriority = pending.filter((t) => t.priority === 'high');

  return {
    generatedAt: new Date().toISOString(),
    date: ctx.selectedDate,
    todayTasks: ctx.existingTasks,
    completedTasks: completed,
    overdueTasks: [],
    activeGoals: ctx.activeGoals || [],
    notesCount: 0,
    recentNotes: [],
    recentKnowledge: [],
    focusSessions: [],
    focusStats: {
      totalSessions: 0,
      totalFocusedMinutes: ctx.focusMinutes || 0,
      todaySessions: 0,
      todayFocusMinutes: ctx.focusMinutes || 0,
      weeklyFocusMinutes: ctx.focusMinutes || 0,
      averageSessionDuration: 0,
      recentActivityCount: 0,
    },
    moneySummary: {
      totalIncome: 0,
      totalExpenses: 0,
      currentBalance: 0,
      recentSpending: 0,
      expensesByCategory: [],
      largestExpenseCategory: null,
      recentTransactionCount: 0,
    },
    tasks: ctx.existingTasks,
    goals: ctx.activeGoals || [],
    focusSummary: {
      totalSessions: 0,
      totalFocusedMinutes: ctx.focusMinutes || 0,
      todaySessions: 0,
      todayFocusMinutes: ctx.focusMinutes || 0,
      weeklyFocusMinutes: ctx.focusMinutes || 0,
      averageSessionDuration: 0,
      recentActivityCount: 0,
    },
    financeSummary: {
      totalIncome: 0,
      totalExpenses: 0,
      currentBalance: 0,
      recentSpending: 0,
      expensesByCategory: [],
      largestExpenseCategory: null,
      recentTransactionCount: 0,
    },
    knowledgeSummary: {
      totalNotes: 0,
      recentlyCreatedNotes: 0,
      recentlyUpdatedNotes: 0,
      notesCreatedThisWeek: 0,
      latestActivity: null,
      totalKnowledgeItems: 0,
      pinnedKnowledgeCount: 0,
    },
    productivitySummary: {
      totalTasks: ctx.existingTasks.length,
      completedTasks: completed.length,
      pendingTasks: pending.length,
      todayTasks: ctx.existingTasks.length,
      todayCompletedTasks: completed.length,
      completionPercentage: ctx.existingTasks.length
        ? Math.round((completed.length / ctx.existingTasks.length) * 100)
        : 0,
      highPriorityPendingCount: highPriority.length,
      overdueTasksCount: 0,
      recentCompletionRate: 0,
    },
    goalHealth: {
      totalGoals: (ctx.activeGoals || []).length,
      activeGoals: (ctx.activeGoals || []).length,
      completedGoals: 0,
      averageProgress: 0,
      goalsBelow25: 0,
      goalsAbove75: 0,
      recentlyUpdatedGoals: 0,
      healthStatus: 'good',
    },
    productivityScore: 70,
    recentActivity: [],
    insights: [],
  };
}

/**
 * Builds the strict, grounded system instruction for Plan Assist.
 */
export function buildPlanAssistSystemPrompt(ctx: PlanAssistPlanningContext): string {
  const taskLines =
    ctx.existingTasks.length > 0
      ? ctx.existingTasks
          .map(
            (t) =>
              `- [${t.completed ? 'COMPLETED' : 'PENDING'}] ID: "${t.id}" | "${t.title}" | Priority: ${t.priority}`
          )
          .join('\n')
      : 'No tasks currently scheduled for this date.';

  const goalLines =
    ctx.activeGoals && ctx.activeGoals.length > 0
      ? ctx.activeGoals
          .map((g) => `- Goal ID: "${g.id}" | "${g.title}" | Progress: ${g.progress}%`)
          .join('\n')
      : 'No active goals recorded.';

  const focusInfo =
    typeof ctx.focusMinutes === 'number'
      ? `Recent focus capacity: ~${ctx.focusMinutes} minutes.`
      : 'No focus capacity metrics recorded.';

  const langInstruction =
    ctx.language === 'ar'
      ? 'Language instruction: Write the summary and reason fields in Arabic. Keep JSON keys and type names in English.'
      : 'Language instruction: Write the summary and reason fields in English.';

  return `You are NOVO Plan Assist, an intelligent daily planning assistant.
Analyze the user's workload for the selected planner date and suggest a small set of practical, high-impact actions (1-5 actions).

Selected Planner Date: ${ctx.selectedDate}
(NOTE: Treat this date as authoritative for this planning session. Do not assume today's device date.)

Existing Tasks for ${ctx.selectedDate}:
${taskLines}

Active Goals:
${goalLines}

Focus Workload:
${focusInfo}

Rules:
1. Act as a planning assistant proposing recommendations, NOT an autonomous agent.
2. Only suggest practical, realistic tasks that advance the user's goals or organize pending work.
3. For existing tasks, if priorities should be shifted, propose a "priority_change" with the exact taskId.
4. For new tasks, propose a "new_task". If the task directly supports an active goal, you may optionally include its exact goalId. Do NOT specify a date for new tasks; they will be scheduled on ${ctx.selectedDate}.
5. Do NOT invent facts, personal secrets, or unrelated module data.
6. ${langInstruction}
7. CRITICAL: You must return ONLY a raw JSON object matching the schema below. Do not wrap in markdown \`\`\`json fences. No commentary before or after.

Required JSON Schema:
{
  "summary": "string (1-2 sentences summarizing the recommended plan)",
  "suggestions": [
    {
      "type": "new_task",
      "title": "string (non-empty concise title)",
      "priority": "low" | "medium" | "high",
      "goalId": "string (OPTIONAL: exact Goal ID if this task directly advances an active goal, otherwise omit)",
      "reason": "string (clear reason why this task is recommended)"
    },
    {
      "type": "priority_change",
      "taskId": "string (exact existing task ID)",
      "priority": "low" | "medium" | "high",
      "reason": "string (clear reason for priority change)"
    }
  ]
}`;
}

export class PlanAssistService {
  constructor(private orchestrator: AIOrchestrator = aiOrchestrator) {}

  /**
   * Generates AI Plan Assist recommendations for the selected planner date.
   * Does NOT mutate taskStore or any other store.
   */
  public async getPlanSuggestions(
    planningContext: PlanAssistPlanningContext,
    options?: { abortSignal?: AbortSignal; strict?: boolean }
  ): Promise<PlanAssistResponse> {
    if (options?.abortSignal?.aborted) {
      return {
        success: false,
        error: {
          code: 'ABORTED',
          message: 'The plan assist request was cancelled.',
          messageAr: 'تم إلغاء طلب المساعد الذكي للتخطيط.',
          isAborted: true,
        },
      };
    }

    const systemInstruction = buildPlanAssistSystemPrompt(planningContext);
    const scopedContext = buildScopedPlanAssistNOVOContext(planningContext);

    const promptMessage =
      planningContext.language === 'ar'
        ? `يرجى تنظيم واقتراح خطة عمل محكمة ليوم ${planningContext.selectedDate} بصيغة JSON فقط.`
        : `Please organize and suggest a focused action plan for ${planningContext.selectedDate} in strict JSON format only.`;

    try {
      const result = await this.orchestrator.orchestrate({
        message: promptMessage,
        context: scopedContext,
        language: planningContext.language || 'en',
        options: {
          systemInstruction,
          abortSignal: options?.abortSignal,
        },
      });

      if (options?.abortSignal?.aborted) {
        return {
          success: false,
          error: {
            code: 'ABORTED',
            message: 'The plan assist request was cancelled.',
            messageAr: 'تم إلغاء طلب المساعد الذكي للتخطيط.',
            isAborted: true,
          },
        };
      }

      if (result.error) {
        const isAborted =
          result.error.code === 'ABORTED' || Boolean(options?.abortSignal?.aborted);

        const errorCode: PlanAssistError['code'] = isAborted
          ? 'ABORTED'
          : result.error.code === 'AI_TIMEOUT'
          ? 'TIMEOUT'
          : 'API_ERROR';

        return {
          success: false,
          error: {
            code: errorCode,
            message: result.error.message || 'AI service error during plan assistance.',
            messageAr: result.error.messageAr || 'حدث خطأ في خدمة الذكاء الاصطناعي أثناء التخطيط.',
            isAborted,
            rawError: result.error,
          },
        };
      }

      if (!result.aiResponse || !result.aiResponse.text || !result.aiResponse.text.trim()) {
        return {
          success: false,
          error: {
            code: 'EMPTY_OUTPUT',
            message: 'AI returned an empty response.',
            messageAr: 'أرجع الذكاء الاصطناعي استجابة فارغة.',
            isAborted: false,
          },
        };
      }

      return parsePlanAssistResponse(result.aiResponse.text, {
        strict: options?.strict,
        availableGoals: planningContext.activeGoals,
      });
    } catch (err: unknown) {
      const isAborted =
        Boolean(options?.abortSignal?.aborted) ||
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err as any)?.name === 'AbortError' ||
        (err as any)?.code === 'ABORTED';

      return {
        success: false,
        error: {
          code: isAborted ? 'ABORTED' : 'API_ERROR',
          message: isAborted
            ? 'The plan assist request was cancelled.'
            : (err as any)?.message || 'Unexpected failure while requesting plan assist.',
          messageAr: isAborted
            ? 'تم إلغاء طلب المساعد الذكي للتخطيط.'
            : 'فشل غير متوقع أثناء طلب المساعد الذكي للتخطيط.',
          isAborted,
          rawError: err,
        },
      };
    }
  }
}

export const planAssistService = new PlanAssistService();
