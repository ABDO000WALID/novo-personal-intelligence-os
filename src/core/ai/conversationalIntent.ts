import { AIProvider } from './aiProvider';
import { isConversational, normalizeText, getLocalDateString } from '../commands/commandParser';
import { TaskPriority } from '../../types/data';
import { NOVOContext } from '../intelligence/intelligenceTypes';
import { createSafeIsolatedContext } from './alignmentPrompt';

export interface ConversationalIntentResult {
  isValid: boolean;
  intent: 'create_task' | 'create_goal' | 'none';
  confidence: number;
  extractedTitle: string;
  suggestedPriority: TaskPriority;
  suggestedDate?: string;
  reasoning?: string;
}

/**
 * Narrow local heuristic to detect whether an input message is plausibly action-shaped.
 * Must run ONLY after deterministic explicit command parsing returns false.
 * Must reject questions, reflections, past status, and general conversation.
 */
export function isPlausiblyActionShaped(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (trimmed.length < 8 || trimmed.length > 300) return false;

  // 1. Immediately reject messages with interrogative punctuation
  if (trimmed.includes('?') || trimmed.includes('؟')) {
    return false;
  }

  // 2. Reject messages already identified as conversational / informational
  if (isConversational(trimmed)) {
    return false;
  }

  const norm = normalizeText(trimmed);
  const lower = trimmed.toLowerCase();

  // 3. Reject interrogative/advice prefixes
  const questionPrefixes = [
    'ازاي', 'كيف', 'ليه', 'لماذا', 'متى', 'فين', 'اين', 'هل', 'ماذا', 'ما هو', 'ماهو', 'ما هي', 'ماهي', 'ما رايك',
    'how ', 'how to', 'how can', 'why ', 'what ', 'when ', 'where ', 'should i', 'can i', 'can you', 'could you', 'would you', 'tell me about', 'explain '
  ];
  for (const q of questionPrefixes) {
    if (norm.startsWith(q) || lower.startsWith(q)) {
      return false;
    }
  }

  // 4. Reject past-tense, status, or emotional state expressions
  const statusPrefixes = [
    'انا خلصت', 'انا مش عارف', 'انا حاسس', 'انا تعبان', 'خلصت المهمه', 'خلصت الهدف',
    'i finished', 'i completed', 'i already', 'i do not know', "i don't know", 'i feel', 'i am tired'
  ];
  for (const s of statusPrefixes) {
    if (norm.startsWith(s) || lower.startsWith(s)) {
      return false;
    }
  }

  // 5. Check presence of action/commitment modal trigger markers
  const actionMarkers = [
    // Arabic modal words / intention phrases
    'محتاج', 'محتاجه', 'لازم', 'مفروض', 'المفروض',
    'ناوي', 'انوي', 'نفسي', 'ودي', 'عندي نيه', 'عندي رغبه',
    'خطتي', 'خطه', 'هدفي', 'ياريت', 'علي ان', 'عليا ان',

    // English modal words / intention phrases
    'i need to', 'i need a', 'i have to', 'i ought to', 'i should',
    'i plan to', "i'm planning to", 'im planning to', 'planning to',
    'i want to', "i'd like to", 'id like to', 'i would like to',
    'gotta', 'got to', 'aiming to', 'i aim to', 'intend to', 'i intend to',
    'my goal is to',
  ];

  let matchedMarker: string | null = null;
  for (const marker of actionMarkers) {
    if (norm.includes(marker) || lower.includes(marker)) {
      matchedMarker = marker;
      break;
    }
  }

  if (!matchedMarker) {
    return false;
  }

  // 6. Ensure substantive payload beyond marker (at least 2 words remaining)
  const remaining = lower.replace(matchedMarker, ' ').trim();
  const words = remaining.split(/\s+/).filter((w) => w.length > 0);
  return words.length >= 2;
}

/**
 * Builds the bounded intent classification prompt for the AI provider.
 */
export function buildConversationalIntentPrompt(message: string, language: 'ar' | 'en'): {
  systemInstruction: string;
  userPrompt: string;
} {
  const isAr = language === 'ar';

  const systemInstruction = isAr
    ? `أنت مصنّف نوايا دقيق في تطبيق NOVO لإدارة المهام والأهداف.
مهمتك: تحديد ما إذا كانت رسالة المستخدم تعبر عن نية واضحة لإنشاء "مهمة" (Task) أو "هدف" (Goal)، أو أنها مجرد محادثة عامة (none).
التعريفات الصارمة:
1. "create_task": عمل تنفيذي محدد ومباشر (مثل: مراجعة كود، مكالمة شخص، إرسال تقرير، دفع فاتورة، حضور اجتماع).
2. "create_goal": هدف استراتيجي أو طموح مستمر طويل الأجل (مثل: تعلم لغة، قراءة 10 كتب، بناء مشروع، الحصول على شهادة).
3. "none": أي رسالة عامة، استفسار، فضفضة، نصيحة، أو نية غير واضحة أو غامضة.

قواعد الاستجابة الصارمة:
- أجب فقط بكائن JSON وحيد بدون أي نص إضافي بالشكل التالي:
{
  "intent": "create_task" | "create_goal" | "none",
  "confidence": number between 0.0 and 1.0,
  "extractedTitle": "عنوان مختصر ونظيف للعمل المطلوب بدون كلمات مثل 'محتاج' أو 'لازم'",
  "suggestedPriority": "high" | "medium" | "low" | null,
  "suggestedDate": "today" | "tomorrow" | null
}`
    : `You are a strict conversational intent classifier in the NOVO productivity system.
Task: Determine if the user's message conveys a clear intent to create a discrete "task" (Task) or a strategic "goal" (Goal), or if it is purely conversational / general (none).
Definitions:
1. "create_task": A discrete, concrete, actionable to-do item (e.g., review code, call a client, submit report, fix a bug, attend meeting).
2. "create_goal": A broader strategic milestone or long-term objective (e.g., learn a language, read 10 books, build a SaaS, acquire a certification).
3. "none": General conversation, questions, reflections, advice seeking, ambiguous statements, or unclear intent.

Strict Response Rules:
- Respond ONLY with a single JSON object with no markdown formatting:
{
  "intent": "create_task" | "create_goal" | "none",
  "confidence": number between 0.0 and 1.0,
  "extractedTitle": "clean, concise title of the item without modal words like 'I need to' or 'I should'",
  "suggestedPriority": "high" | "medium" | "low" | null,
  "suggestedDate": "today" | "tomorrow" | null
}`;

  return {
    systemInstruction,
    userPrompt: `Input message: "${message.trim()}"`,
  };
}

/**
 * Validates and enforces code authority over the AI intent classification output.
 * Guarantees fail-closed behavior on malformed, low-confidence, or ambiguous output.
 */
export function validateConversationalIntentResponse(
  rawText: string,
  userMessage: string
): ConversationalIntentResult {
  const fallback: ConversationalIntentResult = {
    isValid: false,
    intent: 'none',
    confidence: 0,
    extractedTitle: '',
    suggestedPriority: 'medium',
  };

  if (!rawText || typeof rawText !== 'string') {
    return fallback;
  }

  let parsed: any;
  try {
    // Strip markdown code fences if present
    const cleaned = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return fallback;
  }

  if (!parsed || typeof parsed !== 'object') {
    return fallback;
  }

  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
  // Fail closed on low confidence (< 0.75)
  if (confidence < 0.75) {
    return { ...fallback, confidence };
  }

  const rawIntent = parsed.intent;
  if (rawIntent !== 'create_task' && rawIntent !== 'create_goal') {
    return { ...fallback, confidence };
  }

  // Code authority over extractedTitle
  let title = typeof parsed.extractedTitle === 'string' ? parsed.extractedTitle.trim() : '';
  // Strip surrounding quotes
  title = title.replace(/^["'`]+|["'`]+$/g, '').trim();

  // Strip leading modal fillers if AI failed to remove them
  const modalStrips = [
    /^محتاج\s+(أن\s+|ان\s+)?/i,
    /^لازم\s+/i,
    /^المفروض\s+(أن\s+|ان\s+)?/i,
    /^مفروض\s+(أن\s+|ان\s+)?/i,
    /^ناوي\s+(أن\s+|ان\s+)?/i,
    /^أنوي\s+(أن\s+|ان\s+)?/i,
    /^نفسي\s+(في\s+)?/i,
    /^ودي\s+(أن\s+|ان\s+)?/i,
    /^i\s+need\s+to\s+/i,
    /^i\s+have\s+to\s+/i,
    /^i\s+should\s+/i,
    /^i\s+plan\s+to\s+/i,
    /^i'm\s+planning\s+to\s+/i,
    /^im\s+planning\s+to\s+/i,
    /^i\s+want\s+to\s+/i,
    /^i'd\s+like\s+to\s+/i,
    /^gotta\s+/i,
  ];
  for (const reg of modalStrips) {
    title = title.replace(reg, '').trim();
  }

  // Validate title bounds
  if (title.length < 3 || title.length > 100) {
    return { ...fallback, confidence };
  }

  // Code authority over priority
  let priority: TaskPriority = 'medium';
  if (parsed.suggestedPriority === 'high' || parsed.suggestedPriority === 'low' || parsed.suggestedPriority === 'medium') {
    priority = parsed.suggestedPriority;
  }

  // Code authority over date: check user input deterministically
  const normUser = normalizeText(userMessage);
  let resolvedDate = getLocalDateString(0); // default today
  const tomorrowTokens = ['بكره', 'بكرة', 'غدا', 'غداً', 'الغد', 'باكر', 'tomorrow'];
  const hasTomorrow = tomorrowTokens.some((t) => normUser.includes(t) || parsed.suggestedDate === 'tomorrow');
  if (hasTomorrow) {
    resolvedDate = getLocalDateString(1);
  }

  return {
    isValid: true,
    intent: rawIntent,
    confidence,
    extractedTitle: title,
    suggestedPriority: priority,
    suggestedDate: resolvedDate,
  };
}

/**
 * Classifies a plausibly action-shaped message using the active AI provider with strict bounds and timeout.
 */
export async function classifyConversationalIntent(options: {
  message: string;
  language: 'ar' | 'en';
  activeProvider: AIProvider;
  context?: NOVOContext;
  timeoutMs?: number;
}): Promise<ConversationalIntentResult> {
  const { message, language, activeProvider, context, timeoutMs = 4000 } = options;

  const fallback: ConversationalIntentResult = {
    isValid: false,
    intent: 'none',
    confidence: 0,
    extractedTitle: '',
    suggestedPriority: 'medium',
  };

  try {
    const prompt = buildConversationalIntentPrompt(message, language);
    const safeContext = context || createSafeIsolatedContext();

    const callPromise = activeProvider.generateResponse(
      prompt.userPrompt,
      safeContext,
      { systemInstruction: prompt.systemInstruction }
    );

    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('Intent classification timeout')), timeoutMs)
    );

    const response = (await Promise.race([callPromise, timeoutPromise])) as any;

    if (!response || !response.text) {
      return fallback;
    }

    return validateConversationalIntentResponse(response.text, message);
  } catch (err) {
    // Fail closed on any network error, timeout, or provider exception
    return fallback;
  }
}
