import {
  parseCommand,
  getLocalDateString,
  formatDailyBriefingFeedback,
} from '../commands/commandParser';
import { buildAISystemContext } from '../intelligence/contextBuilder';
import { aiProviderRegistry } from './aiProvider';
import {
  synthesizeGoalAlignmentTask,
  synthesizeNextActionRationale,
  synthesizeAttentionInsight,
  synthesizeGoalPacingExplanation,
} from './alignmentPrompt';
import { generateDailyBriefing } from '../intelligence/briefingEngine';
import { analyzeProductivity } from '../intelligence/productivityEngine';
import { analyzeGoals, analyzeDailyGoalAlignment } from '../intelligence/goalEngine';
import { analyzeFocus } from '../intelligence/focusEngine';
import { analyzeFinance } from '../intelligence/financeEngine';
import { analyzeNotesAndKnowledge } from '../intelligence/notesEngine';
import { determineNextAction } from '../intelligence/nextActionEngine';
import { evaluateAttentionRadar } from '../intelligence/attentionEngine';
import {
  AIMessage,
  AIError,
  AIRequestOptions,
  ChatOrchestrationRequest,
  ChatOrchestrationResult,
} from './aiTypes';

/**
 * Normalizes raw/unknown errors into a standardized AIError.
 */
export function normalizeAIError(err: unknown): AIError {
  if (typeof err === 'object' && err !== null && 'code' in err && 'message' in err) {
    const candidate = err as Partial<AIError>;
    return {
      code: candidate.code || 'UNKNOWN',
      message: candidate.message || 'An unexpected AI error occurred.',
      messageAr: candidate.messageAr || 'حدث خطأ غير متوقع في محرك الذكاء الاصطناعي.',
      details: candidate.details,
      retryable: typeof candidate.retryable === 'boolean' ? candidate.retryable : true,
    };
  }

  if (err instanceof DOMException && err.name === 'AbortError') {
    return {
      code: 'ABORTED',
      message: 'The request was cancelled.',
      messageAr: 'تم إلغاء الطلب.',
      retryable: true,
    };
  }

  // Consumer-safe generic error
  let friendlyMessage = 'We could not connect to NOVO. Please check your internet connection and try again.';
  let friendlyMessageAr = 'تعذر الاتصال بـ NOVO. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.';
  
  if (err instanceof Error) {
    const rawMsg = err.message.toLowerCase();
    if (rawMsg.includes('rate limit') || rawMsg.includes('429')) {
       friendlyMessage = 'NOVO is receiving too many requests. Please wait a moment and try again.';
       friendlyMessageAr = 'NOVO يتلقى طلبات كثيرة. يرجى الانتظار قليلاً والمحاولة مرة أخرى.';
    } else if (rawMsg.includes('timeout') || rawMsg.includes('aborted')) {
       friendlyMessage = 'The request took too long. Please try again.';
       friendlyMessageAr = 'استغرق الطلب وقتاً أطول من المتوقع. يرجى المحاولة مرة أخرى.';
    } else if (rawMsg.includes('quota') || rawMsg.includes('402')) {
       friendlyMessage = 'AI services quota exceeded. Please contact support.';
       friendlyMessageAr = 'تم تجاوز الحد المسموح به لخدمات الذكاء الاصطناعي. يرجى الاتصال بالدعم.';
    }
  }

  return {
    code: 'REQUEST_FAILED',
    message: friendlyMessage,
    messageAr: friendlyMessageAr,
    retryable: true,
  };
}

export function prepareConversationHistory(
  messages?: Array<{ role: string; content: string; createdAt?: string }>,
  currentMessage?: string,
  maxMessages: number = 10
): AIMessage[] {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const normalizedCurrent = currentMessage ? currentMessage.trim() : '';
  const validMessages: AIMessage[] = [];

  for (const msg of messages) {
    if (!msg || typeof msg.content !== 'string') continue;
    const trimmed = msg.content.trim();
    if (!trimmed) continue;

    let role: 'user' | 'assistant' | 'system' = 'user';
    if (msg.role === 'assistant') role = 'assistant';
    else if (msg.role === 'system') role = 'system';

    validMessages.push({
      role,
      content: trimmed,
      timestamp: msg.createdAt,
    });
  }

  if (
    normalizedCurrent &&
    validMessages.length > 0 &&
    validMessages[validMessages.length - 1].role === 'user' &&
    validMessages[validMessages.length - 1].content === normalizedCurrent
  ) {
    validMessages.pop();
  }

  // Layered Memory Architecture:
  if (validMessages.length > maxMessages) {
     const firstMessage = validMessages[0];
     const recentWindow = validMessages.slice(-(maxMessages - 2));
     
     const truncatedMiddle = validMessages.slice(1, -(maxMessages - 2));
     const topics = truncatedMiddle.filter(m => m.role === 'user').map(m => m.content.substring(0, 40).replace(/\n/g, ' ')).join(' | ');
     
     return [
       firstMessage,
       {
         role: 'system',
         content: `[SYSTEM: ${truncatedMiddle.length} older messages omitted for context brevity. Earlier user topics included: ${topics.substring(0, 400)}]`
       },
       ...recentWindow
     ];
  }

  return validMessages;
}

export class AIOrchestrator {
  public async orchestrate(
    request: ChatOrchestrationRequest
  ): Promise<ChatOrchestrationResult> {
    const trimmed = request.message.trim();

    if (!trimmed) {
      return {
        handledAsCommand: false,
        error: {
          code: 'INVALID_RESPONSE',
          message: 'Cannot process an empty message.',
          messageAr: 'لا يمكن معالجة رسالة فارغة.',
          retryable: false,
        },
      };
    }

    // 1. Check for deterministic local commands FIRST
    const availableGoals = request.context?.goals || request.context?.activeGoals;
    const availableTasks = request.context?.tasks || request.context?.todayTasks;
    const parseResult = parseCommand(trimmed, availableGoals, availableTasks);
    if (parseResult.isCommand && parseResult.command) {
      // If "Align My Day" command:
      if (parseResult.command.action === 'align_day' && parseResult.command.alignDayPayload) {
        const payload = parseResult.command.alignDayPayload;
        if (payload.hasUnattendedGoals && payload.selectedGoalId && payload.selectedGoalTitle && payload.suggestedTaskTitle) {
          const proposalId = `prop-align-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          
          // Determine language of the user trigger
          const isArabic = /[\u0600-\u06FF]/.test(trimmed);
          const lang = isArabic ? 'ar' : 'en';

          // Retrieve active goal details safely if available
          const matchingGoal = availableGoals?.find((g: any) => g && g.id === payload.selectedGoalId);
          const activeProvider = aiProviderRegistry.getActiveProvider();

          // Gate 17.1: Synthesize AI-enriched task title & reasoning with 6s timeout & strict validation
          const enrichment = await synthesizeGoalAlignmentTask({
            goalId: payload.selectedGoalId,
            goalTitle: payload.selectedGoalTitle,
            goalDescription: matchingGoal?.description,
            currentProgress: matchingGoal?.progress ?? 0,
            targetDate: getLocalDateString(0),
            language: lang,
            activeProvider,
            timeoutMs: 6000,
          });

          const finalTaskTitle = enrichment.suggestedTitle;
          const finalReasoning = enrichment.reasoning;

          // Update command payload with enrichment metadata
          payload.suggestedTaskTitle = finalTaskTitle;
          payload.aiEnriched = enrichment.isEnriched;
          payload.reasoning = finalReasoning;

          const feedbackAr = `مقترح مواءمة اليوم: ${finalTaskTitle}`;
          const feedbackEn = `Align Day Proposal: ${finalTaskTitle}`;

          return {
            handledAsCommand: true,
            command: parseResult.command,
            taskProposal: {
              id: proposalId,
              source: 'align_day',
              requiresGoal: true,
              title: finalTaskTitle,
              priority: 'medium',
              date: getLocalDateString(0),
              goalId: payload.selectedGoalId,
              goalTitle: payload.selectedGoalTitle,
              reasoning: finalReasoning,
              aiEnriched: enrichment.isEnriched,
              status: 'pending',
            },
            commandFeedback: {
              ar: feedbackAr,
              en: feedbackEn,
            },
          };
        } else {
          // No unattended goals or no active goals: return conversational command feedback without proposal
          return {
            handledAsCommand: true,
            command: parseResult.command,
            commandFeedback: {
              ar: parseResult.command.feedbackAr,
              en: parseResult.command.feedbackEn,
            },
          };
        }
      }

      // If "Daily Briefing" command:
      if (
        parseResult.command.action === 'daily_briefing' &&
        parseResult.command.dailyBriefingPayload
      ) {
        const payload = parseResult.command.dailyBriefingPayload;

        let feedbackAr = parseResult.command.feedbackAr;
        let feedbackEn = parseResult.command.feedbackEn;

        // If context is provided, re-derive the authoritative briefing with live store/context data
        if (request.context) {
          const liveTasks = availableTasks || [];
          const liveGoals = availableGoals || [];
          const now = new Date();
          const productivity =
            request.context.productivitySummary || analyzeProductivity(liveTasks, now);
          const goalHealth = request.context.goalHealth || analyzeGoals(liveGoals, now);
          const focus =
            request.context.focusSummary ||
            request.context.focusStats ||
            analyzeFocus([], now);
          const finance =
            request.context.financeSummary ||
            request.context.moneySummary ||
            analyzeFinance([], now);
          const knowledge =
            request.context.knowledgeSummary ||
            analyzeNotesAndKnowledge(
              request.context.recentNotes || [],
              request.context.recentKnowledge || [],
              now
            );
          const alignment = analyzeDailyGoalAlignment(liveTasks, liveGoals, now);

          const fullBriefing = generateDailyBriefing(
            {
              productivity,
              goals: goalHealth,
              focus,
              finance,
              knowledge,
              goalAlignment: alignment,
            },
            now
          );

          feedbackAr = formatDailyBriefingFeedback(fullBriefing, 'ar');
          feedbackEn = formatDailyBriefingFeedback(fullBriefing, 'en');
        }

        if (
          payload.hasUnattendedGoals &&
          payload.selectedGoalId &&
          payload.selectedGoalTitle
        ) {
          const proposalId = `prop-briefing-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

          const isArabic = /[\u0600-\u06FF]/.test(trimmed);
          const lang = isArabic ? 'ar' : 'en';

          const matchingGoal = availableGoals?.find(
            (g: any) => g && g.id === payload.selectedGoalId
          );
          const activeProvider = aiProviderRegistry.getActiveProvider();

          // Gate 17.1 / 17.2: Synthesize AI-enriched task title & reasoning with 6s timeout & strict validation
          const enrichment = await synthesizeGoalAlignmentTask({
            goalId: payload.selectedGoalId,
            goalTitle: payload.selectedGoalTitle,
            goalDescription: matchingGoal?.description,
            currentProgress: matchingGoal?.progress ?? 0,
            targetDate: getLocalDateString(0),
            language: lang,
            activeProvider,
            timeoutMs: 6000,
          });

          const finalTaskTitle = enrichment.suggestedTitle;
          const finalReasoning = enrichment.reasoning;

          payload.suggestedTaskTitle = finalTaskTitle;
          payload.aiEnriched = enrichment.isEnriched;
          payload.reasoning = finalReasoning;

          return {
            handledAsCommand: true,
            command: parseResult.command,
            taskProposal: {
              id: proposalId,
              source: 'daily_briefing',
              requiresGoal: true,
              title: finalTaskTitle,
              priority: 'medium',
              date: getLocalDateString(0),
              goalId: payload.selectedGoalId,
              goalTitle: payload.selectedGoalTitle,
              reasoning: finalReasoning,
              aiEnriched: enrichment.isEnriched,
              status: 'pending',
            },
            commandFeedback: {
              ar: feedbackAr,
              en: feedbackEn,
            },
          };
        } else {
          // Zero unattended goals or zero active goals: return briefing feedback with zero proposals
          return {
            handledAsCommand: true,
            command: parseResult.command,
            commandFeedback: {
              ar: feedbackAr,
              en: feedbackEn,
            },
          };
        }
      }

      // If "Next Action" command:
      if (
        parseResult.command.action === 'next_action' &&
        parseResult.command.nextActionPayload
      ) {
        const payload = parseResult.command.nextActionPayload;
        const liveTasks = availableTasks || [];
        const liveGoals = availableGoals || [];
        const today = getLocalDateString(0);

        // Always re-evaluate deterministically against live context/state
        const actionResult = determineNextAction(liveTasks, liveGoals, today);
        const isArabic = /[\u0600-\u06FF]/.test(trimmed);
        const lang = isArabic ? 'ar' : 'en';
        const activeProvider = aiProviderRegistry.getActiveProvider();

        if (actionResult.type === 'existing_task') {
          const selectedTask = actionResult.selectedTask;
          const isOverdue = actionResult.tier === 1;
          const matchingGoal = selectedTask.goalId
            ? liveGoals.find((g) => g && g.id === selectedTask.goalId)
            : undefined;

          // AI may ONLY generate a short one-sentence rationale explaining why the already-selected task is appropriate now.
          const rationaleRes = await synthesizeNextActionRationale({
            taskTitle: selectedTask.title,
            taskPriority: selectedTask.priority || 'medium',
            taskDate: selectedTask.date,
            isOverdue,
            goalTitle: matchingGoal?.title,
            goalProgress: matchingGoal?.progress,
            language: lang,
            activeProvider,
            timeoutMs: 6000,
          });

          const priorityLabelAr =
            selectedTask.priority === 'high'
              ? 'أولوية عالية'
              : selectedTask.priority === 'low'
              ? 'أولوية منخفضة'
              : 'أولوية متوسطة';
          const priorityLabelEn =
            selectedTask.priority === 'high'
              ? 'High Priority'
              : selectedTask.priority === 'low'
              ? 'Low Priority'
              : 'Medium Priority';
          const overdueLabelAr = isOverdue ? ' • متأخرة' : '';
          const overdueLabelEn = isOverdue ? ' • Overdue' : '';

          const feedbackAr = `خطوتك التالية الموصى بها:\n• ${selectedTask.title} (${priorityLabelAr}${overdueLabelAr})\n💡 ${rationaleRes.rationale}`;
          const feedbackEn = `Recommended next action:\n• ${selectedTask.title} (${priorityLabelEn}${overdueLabelEn})\n💡 ${rationaleRes.rationale}`;

          // Preserve exact deterministic engine selection and metadata
          payload.selectedTaskId = selectedTask.id;
          payload.selectedTaskTitle = selectedTask.title;
          payload.aiEnriched = rationaleRes.isEnriched;
          payload.rationaleAr = isArabic ? rationaleRes.rationale : undefined;
          payload.rationaleEn = !isArabic ? rationaleRes.rationale : undefined;

          return {
            handledAsCommand: true,
            command: parseResult.command,
            // Strictly NO taskProposal for existing task!
            commandFeedback: {
              ar: feedbackAr,
              en: feedbackEn,
            },
          };
        } else if (actionResult.type === 'new_task_required') {
          const selectedGoal = actionResult.selectedGoal;
          const proposalId = `prop-nextaction-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

          // Gate 16 / 17.1 reuse: synthesize goal alignment task title & reasoning
          const enrichment = await synthesizeGoalAlignmentTask({
            goalId: selectedGoal.id,
            goalTitle: selectedGoal.title,
            goalDescription: selectedGoal.description,
            currentProgress: selectedGoal.progress ?? 0,
            targetDate: today,
            language: lang,
            activeProvider,
            timeoutMs: 6000,
          });

          const finalTaskTitle = enrichment.suggestedTitle;
          const finalReasoning = enrichment.reasoning;

          payload.suggestedTaskTitle = finalTaskTitle;
          payload.selectedGoalId = selectedGoal.id;
          payload.selectedGoalTitle = selectedGoal.title;
          payload.aiEnriched = enrichment.isEnriched;
          payload.reasoning = finalReasoning;

          const feedbackAr = `مقترح خطوتك التالية: ${finalTaskTitle}`;
          const feedbackEn = `Next Action Proposal: ${finalTaskTitle}`;

          return {
            handledAsCommand: true,
            command: parseResult.command,
            taskProposal: {
              id: proposalId,
              originatingMessageId: request.messageId,
              source: 'next_action',
              requiresGoal: true,
              title: finalTaskTitle,
              priority: 'medium',
              date: today,
              goalId: selectedGoal.id,
              goalTitle: selectedGoal.title,
              reasoning: finalReasoning,
              aiEnriched: enrichment.isEnriched,
              status: 'pending',
            },
            commandFeedback: {
              ar: feedbackAr,
              en: feedbackEn,
            },
          };
        } else {
          // Tier 4: all_clear
          const feedbackAr =
            'أحسنت! لا توجد مهام معلقة أو متأخرة لليوم، وجميع أهدافك النشطة تمت مواءمتها.';
          const feedbackEn =
            'All clear! You have no pending or overdue tasks today, and all your active goals are attended.';

          return {
            handledAsCommand: true,
            command: parseResult.command,
            // Strictly NO taskProposal
            commandFeedback: {
              ar: feedbackAr,
              en: feedbackEn,
            },
          };
        }
      }

      // If "Attention Radar" command:
      if (
        parseResult.command.action === 'attention_radar' &&
        parseResult.command.attentionRadarPayload
      ) {
        const payload = parseResult.command.attentionRadarPayload;
        const liveTasks = request.context?.tasks || request.context?.todayTasks || [];
        const liveGoals = request.context?.goals || request.context?.activeGoals || [];
        const liveSessions = request.context?.focusSessions || [];
        const today = getLocalDateString(0);

        // Re-evaluate deterministically against authoritative request context state
        const radarResult = evaluateAttentionRadar({
          tasks: liveTasks,
          goals: liveGoals,
          focusSessions: liveSessions,
          todayFocusMinutes: request.context?.focusStats?.todayFocusMinutes,
          todayStr: today,
        });

        payload.radarResult = radarResult;

        const isArabic = /[\u0600-\u06FF]/.test(trimmed);
        const lang = isArabic ? 'ar' : 'en';
        const activeProvider = aiProviderRegistry.getActiveProvider();

        if (radarResult.type === 'overdue_task') {
          // Tier 1: Overdue Task -> Deterministic selection + bounded AI insight (NO proposal)
          const chosenTask = liveTasks.find((t) => t.id === radarResult.selectedTaskId);
          const taskTitle = chosenTask ? chosenTask.title : radarResult.selectedTaskTitle;
          const priority = chosenTask ? chosenTask.priority || 'medium' : radarResult.taskPriority;
          const priorityLabelAr = priority === 'high' ? 'عالية' : priority === 'low' ? 'منخفضة' : 'متوسطة';
          const priorityLabelEn = priority === 'high' ? 'High' : priority === 'low' ? 'Low' : 'Medium';

          const insightRes = await synthesizeAttentionInsight({
            tier: 1,
            type: radarResult.type,
            itemTitle: taskTitle,
            details: `Priority: ${priority}, Overdue by: ${radarResult.daysOverdue} days, Due Date: ${radarResult.taskDueDate}`,
            activeProvider,
            language: lang,
            timeoutMs: 6000,
          });

          payload.selectedTaskId = radarResult.selectedTaskId;
          payload.selectedTaskTitle = taskTitle;
          payload.aiEnriched = insightRes.isEnriched;
          payload.insightAr = isArabic ? insightRes.insight : undefined;
          payload.insightEn = !isArabic ? insightRes.insight : undefined;

          const feedbackAr = `تنبيه رادار الانتباه: لديك مهمة متأخرة تتطلب المعالجة العاجلة:\n• ${taskTitle} [أولوية ${priorityLabelAr} - متأخرة ${radarResult.daysOverdue} يوم]\n💡 ${insightRes.insight}`;
          const feedbackEn = `Attention Radar Alert: You have an overdue task requiring immediate action:\n• ${taskTitle} [Priority: ${priorityLabelEn} - Overdue by ${radarResult.daysOverdue} day(s)]\n💡 ${insightRes.insight}`;

          return {
            handledAsCommand: true,
            command: parseResult.command,
            // Strictly NO taskProposal for Tier 1
            commandFeedback: {
              ar: feedbackAr,
              en: feedbackEn,
            },
          };
        } else if (radarResult.type === 'stalled_goal') {
          // Tier 2: Stalled Goal -> Deterministic selection + single starter task proposal
          const chosenGoal = liveGoals.find((g) => g.id === radarResult.selectedGoalId);
          const goalTitle = chosenGoal ? chosenGoal.title : radarResult.selectedGoalTitle;
          const proposalId = `prop-radar-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

          const enrichment = await synthesizeGoalAlignmentTask({
            goalId: radarResult.selectedGoalId,
            goalTitle,
            goalDescription: chosenGoal?.description,
            currentProgress: radarResult.currentProgress,
            targetDate: today,
            language: lang,
            activeProvider,
            timeoutMs: 6000,
          });

          const finalTaskTitle = enrichment.suggestedTitle;
          const finalReasoning = enrichment.reasoning;

          payload.suggestedTaskTitle = finalTaskTitle;
          payload.selectedGoalId = radarResult.selectedGoalId;
          payload.selectedGoalTitle = goalTitle;
          payload.aiEnriched = enrichment.isEnriched;
          payload.reasoning = finalReasoning;

          const feedbackAr = `تنبيه رادار الانتباه: رصد هدف راكد بدون نشاط منذ ${radarResult.daysInactive} يوماً:\n• مقترح تنشيط: ${finalTaskTitle}`;
          const feedbackEn = `Attention Radar Alert: Stalled goal detected with no activity for ${radarResult.daysInactive} days:\n• Activation Proposal: ${finalTaskTitle}`;

          return {
            handledAsCommand: true,
            command: parseResult.command,
            taskProposal: {
              id: proposalId,
              originatingMessageId: request.messageId,
              source: 'attention_radar',
              requiresGoal: true,
              title: finalTaskTitle,
              priority: 'medium',
              date: today,
              goalId: radarResult.selectedGoalId,
              goalTitle,
              reasoning: finalReasoning,
              aiEnriched: enrichment.isEnriched,
              status: 'pending',
            },
            commandFeedback: {
              ar: feedbackAr,
              en: feedbackEn,
            },
          };
        } else if (radarResult.type === 'urgent_today_task') {
          // Tier 3: Today's High-Priority Task -> Deterministic selection + bounded AI insight (NO proposal)
          const chosenTask = liveTasks.find((t) => t.id === radarResult.selectedTaskId);
          const taskTitle = chosenTask ? chosenTask.title : radarResult.selectedTaskTitle;

          const insightRes = await synthesizeAttentionInsight({
            tier: 3,
            type: radarResult.type,
            itemTitle: taskTitle,
            details: `Priority: High, Due Date: ${radarResult.taskDueDate}`,
            activeProvider,
            language: lang,
            timeoutMs: 6000,
          });

          payload.selectedTaskId = radarResult.selectedTaskId;
          payload.selectedTaskTitle = taskTitle;
          payload.aiEnriched = insightRes.isEnriched;
          payload.insightAr = isArabic ? insightRes.insight : undefined;
          payload.insightEn = !isArabic ? insightRes.insight : undefined;

          const feedbackAr = `تنبيه رادار الانتباه: لديك مهمة ذات أولوية عالية مجدولة لليوم:\n• ${taskTitle} [أولوية عالية]\n💡 ${insightRes.insight}`;
          const feedbackEn = `Attention Radar Alert: You have a high-priority task scheduled for today:\n• ${taskTitle} [Priority: High]\n💡 ${insightRes.insight}`;

          return {
            handledAsCommand: true,
            command: parseResult.command,
            // Strictly NO taskProposal for Tier 3
            commandFeedback: {
              ar: feedbackAr,
              en: feedbackEn,
            },
          };
        } else if (radarResult.type === 'focus_deficit') {
          // Tier 4: Focus Deficit -> Bounded coaching insight (NO proposal)
          const insightRes = await synthesizeAttentionInsight({
            tier: 4,
            type: radarResult.type,
            details: `Pending Tasks Today: ${radarResult.pendingTasksTodayCount}, Today Focus Minutes: ${radarResult.todayFocusMinutes}`,
            activeProvider,
            language: lang,
            timeoutMs: 6000,
          });

          payload.aiEnriched = insightRes.isEnriched;
          payload.insightAr = isArabic ? insightRes.insight : undefined;
          payload.insightEn = !isArabic ? insightRes.insight : undefined;

          const feedbackAr = `تنبيه رادار الانتباه: لديك ${radarResult.pendingTasksTodayCount} مهام معلقة اليوم مع عجز في التركيز العميق (${radarResult.todayFocusMinutes} دقيقة تركيز).\n💡 ${insightRes.insight}`;
          const feedbackEn = `Attention Radar Alert: You have ${radarResult.pendingTasksTodayCount} pending tasks today with a deep focus deficit (${radarResult.todayFocusMinutes} focus minutes).\n💡 ${insightRes.insight}`;

          return {
            handledAsCommand: true,
            command: parseResult.command,
            // Strictly NO taskProposal for Tier 4
            commandFeedback: {
              ar: feedbackAr,
              en: feedbackEn,
            },
          };
        } else {
          // Tier 5: All Clear -> Balanced workspace insight (NO proposal)
          const insightRes = await synthesizeAttentionInsight({
            tier: 5,
            type: radarResult.type,
            details: `Pending Tasks Today: ${radarResult.pendingTasksTodayCount}, Active Goals: ${radarResult.activeGoalsCount}, Today Focus Minutes: ${radarResult.todayFocusMinutes}`,
            activeProvider,
            language: lang,
            timeoutMs: 6000,
          });

          payload.aiEnriched = insightRes.isEnriched;
          payload.insightAr = isArabic ? insightRes.insight : undefined;
          payload.insightEn = !isArabic ? insightRes.insight : undefined;

          const feedbackAr = `رادار الانتباه: مساحة عملك في حالة توازن تام! لا توجد مهام متأخرة، ولا أهداف راكدة، وخطتك لليوم تسير بانتظام.\n💡 ${insightRes.insight}`;
          const feedbackEn = `Attention Radar: Workspace equilibrium! No overdue tasks, no stalled goals, and your plan for today is on track.\n💡 ${insightRes.insight}`;

          return {
            handledAsCommand: true,
            command: parseResult.command,
            // Strictly NO taskProposal for Tier 5
            commandFeedback: {
              ar: feedbackAr,
              en: feedbackEn,
            },
          };
        }
      }

      // If "Goal Pacing" command (Gate 17.5B):
      if (
        parseResult.command.action === 'goal_pacing' &&
        parseResult.command.goalPacingPayload
      ) {
        const payload = parseResult.command.goalPacingPayload;
        let feedbackAr = parseResult.command.feedbackAr;
        let feedbackEn = parseResult.command.feedbackEn;

        // If status is not 'success' (e.g. no_goals, not_found, ambiguous), fail closed deterministically without AI invocation
        if (payload.status !== 'success' || payload.analyses.length === 0) {
          return {
            handledAsCommand: true,
            command: parseResult.command,
            commandFeedback: {
              ar: feedbackAr,
              en: feedbackEn,
            },
          };
        }

        const isArabic = /[\u0600-\u06FF]/.test(trimmed);
        const lang = isArabic ? 'ar' : 'en';
        const activeProvider = aiProviderRegistry.getActiveProvider();

        // Synthesize AI explanation layer strictly bounded by deterministic facts with 6s timeout
        const aiExplanation = await synthesizeGoalPacingExplanation({
          analyses: payload.analyses,
          mode: payload.mode,
          activeProvider,
          language: lang,
          timeoutMs: 6000,
        });

        payload.aiEnriched = aiExplanation.isEnriched;

        // Append AI explanation highlights cleanly to feedback
        if (aiExplanation.isEnriched && aiExplanation.summary) {
          if (lang === 'ar') {
            feedbackAr = `${feedbackAr}\n\n💡 الرؤية التنفيذية:\n${aiExplanation.summary}`;
            if (aiExplanation.highlights.length > 0 && payload.mode === 'portfolio') {
              const highlightLines = aiExplanation.highlights.map(
                (h) => `• ${h.goalTitle}: ${h.keyMetricObservation}`
              );
              feedbackAr = `${feedbackAr}\n${highlightLines.join('\n')}`;
            }
          } else {
            feedbackEn = `${feedbackEn}\n\n💡 Executive Synthesis:\n${aiExplanation.summary}`;
            if (aiExplanation.highlights.length > 0 && payload.mode === 'portfolio') {
              const highlightLines = aiExplanation.highlights.map(
                (h) => `• ${h.goalTitle}: ${h.keyMetricObservation}`
              );
              feedbackEn = `${feedbackEn}\n${highlightLines.join('\n')}`;
            }
          }
        }

        return {
          handledAsCommand: true,
          command: parseResult.command,
          // Strictly NO proposals, NO task mutations, NO goal mutations, 100% read-only
          commandFeedback: {
            ar: feedbackAr,
            en: feedbackEn,
          },
        };
      }

      // If task creation command: generate structured proposal
      if (parseResult.command.action === 'create_task' && parseResult.command.taskPayload) {
        const payload = parseResult.command.taskPayload;
        const proposalId = `prop-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        return {
          handledAsCommand: true,
          command: parseResult.command,
          taskProposal: {
            id: proposalId,
            title: payload.title,
            priority: payload.priority,
            date: payload.date,
            goalId: payload.goalId,
            goalTitle: payload.goalTitle,
            status: 'pending',
          },
          commandFeedback: {
            ar: parseResult.command.feedbackAr,
            en: parseResult.command.feedbackEn,
          },
        };
      }

      // If goal progress update command: generate structured goal progress proposal
      if (
        parseResult.command.action === 'update_goal_progress' &&
        parseResult.command.goalProgressPayload
      ) {
        const payload = parseResult.command.goalProgressPayload;
        const proposalId = `gprop-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        return {
          handledAsCommand: true,
          command: parseResult.command,
          goalProgressProposal: {
            id: proposalId,
            goalId: payload.goalId,
            goalTitle: payload.goalTitle,
            currentProgress: payload.currentProgress,
            newProgress: payload.newProgress,
            status: 'pending',
          },
          commandFeedback: {
            ar: parseResult.command.feedbackAr,
            en: parseResult.command.feedbackEn,
          },
        };
      }

      return {
        handledAsCommand: true,
        command: parseResult.command,
        commandTargetRoute: parseResult.command.targetRoute,
        commandFeedback: {
          ar: parseResult.command.feedbackAr,
          en: parseResult.command.feedbackEn,
        },
      };
    }

    // 2. Locate Active AI Provider
    const activeProvider = aiProviderRegistry.getActiveProvider();
    if (!activeProvider) {
      return {
        handledAsCommand: false,
        error: {
          code: 'PROVIDER_UNAVAILABLE',
          message: 'No AI provider is currently configured or active.',
          messageAr: 'لا يوجد مزود ذكاء اصطناعي نشط حالياً.',
          retryable: false,
        },
      };
    }

    // 3. Prepare AI Request Context
    const history = prepareConversationHistory(
      request.conversationHistory,
      trimmed,
      10
    );

    const systemInstruction =
      request.options?.systemInstruction || buildAISystemContext(request.context);

    const mergedOptions: AIRequestOptions = {
      ...request.options,
      systemInstruction,
      history,
    };

    // 4. Dispatch to Provider
    try {
      const response = await activeProvider.generateResponse(
        trimmed,
        request.context,
        mergedOptions
      );

      if (!response || typeof response.text !== 'string' || !response.text.trim()) {
        return {
          handledAsCommand: false,
          error: {
            code: 'INVALID_RESPONSE',
            message: 'Provider returned an empty or invalid response.',
            messageAr: 'أرجع مزود الذكاء الاصطناعي استجابة فارغة أو غير صالحة.',
            retryable: true,
          },
        };
      }

      return {
        handledAsCommand: false,
        aiResponse: response,
      };
    } catch (err: unknown) {
      return {
        handledAsCommand: false,
        error: normalizeAIError(err),
      };
    }
  }
}

export const aiOrchestrator = new AIOrchestrator();
