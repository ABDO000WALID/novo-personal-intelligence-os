import { RouteId } from '../../types/navigation';
import { TaskPriority, Goal, Task } from '../../types/data';
import {
  CommandParseResult,
  CreateTaskCommandPayload,
  CreateGoalCommandPayload,
  UpdateGoalProgressCommandPayload,
  AlignDayCommandPayload,
  DailyBriefingCommandPayload,
  NextActionCommandPayload,
  NOVOCommand,
} from './commandTypes';
import { analyzeDailyGoalAlignment, analyzeGoals } from '../intelligence/goalEngine';
import { generateDailyBriefing, DailyBriefing } from '../intelligence/briefingEngine';
import { analyzeProductivity } from '../intelligence/productivityEngine';
import { analyzeFocus } from '../intelligence/focusEngine';
import { analyzeFinance } from '../intelligence/financeEngine';
import { analyzeNotesAndKnowledge } from '../intelligence/notesEngine';
import { determineNextAction } from '../intelligence/nextActionEngine';
import { evaluateAttentionRadar } from '../intelligence/attentionEngine';
import {
  calculateGoalPacing,
  analyzeAllGoalsPacing,
  GoalPacingAnalysis,
} from '../intelligence/goalVelocityEngine';
import { GoalPacingCommandPayload } from './commandTypes';

/**
 * Normalizes Arabic string for robust matching:
 * Removes diacritics, unifies alef (أ إ آ -> ا), unifies taa marbuta/ha (ة -> ه), yaa (ى -> ي).
 */
export function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, '') // remove tashkeel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns local date string formatted as YYYY-MM-DD.
 */
export function getLocalDateString(offsetDays: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Resolves upcoming weekday date string (YYYY-MM-DD).
 * dayIndex: 0 (Sunday) to 6 (Saturday).
 */
export function getNextWeekdayDate(dayIndex: number): string {
  const now = new Date();
  const currentDay = now.getDay();
  const diff = (dayIndex - currentDay + 7) % 7;
  return getLocalDateString(diff);
}

/**
 * Explicit command prefixes for task creation in Arabic & English.
 */
const ARABIC_TASK_PREFIXES = [
  'اريد اضافه مهمه',
  'اريد اضافة مهمه',
  'عايز اضيف مهمه',
  'عاوز اضيف مهمه',
  'محتاج اضيف مهمه',
  'حابب اضيف مهمه',
  'ودي اضيف مهمه',
  'اضفلي مهمه',
  'اضف لي مهمه',
  'اضفلي مهام',
  'اضف مهمه',
  'اضف مهام',
  'اعملي مهمه',
  'اعمل لي مهمه',
  'اعمل مهمه',
  'انشئ مهمه',
  'انشيء مهمه',
  'سجل لي مهمه',
  'سجل مهمه',
  'حطلي مهمه',
  'حط لي مهمه',
  'حط مهمه',
  'فكرني ان',
  'فكرني ب',
  'فكرني',
  'فكرنى',
  'ذكرني ان',
  'ذكرني ب',
  'ذكرني',
  'ذكرنى',
];

const ENGLISH_TASK_PREFIXES = [
  'i want to add a high-priority task to',
  'i want to add a high priority task to',
  'i want to add a task to',
  'i want to add a task',
  'i want to create a task to',
  'i want to create a task',
  'please add a high-priority task to',
  'please add a task to',
  'please add a task',
  'add a high-priority task to',
  'add a high priority task to',
  'add a high-priority task',
  'add a high priority task',
  'add a low-priority task to',
  'add a low priority task to',
  'add a low-priority task',
  'add a low priority task',
  'add a medium-priority task to',
  'add a medium priority task to',
  'add a medium-priority task',
  'add a medium priority task',
  'create a high-priority task to',
  'create a task to',
  'create a task',
  'create task to',
  'create task',
  'add a task to',
  'add a task',
  'add task to',
  'add task',
  'new task',
  'remind me to',
  'remind me',
];

/**
 * Explicit command prefixes for goal creation in Arabic & English.
 */
const ARABIC_GOAL_PREFIXES = [
  'عايز احط هدف',
  'عاوز احط هدف',
  'محتاج احط هدف',
  'بدي احط هدف',
  'حابب احط هدف',
  'عايز اضيف هدف',
  'عاوز اضيف هدف',
  'محتاج اضيف هدف',
  'عايز اعمل هدف',
  'عاوز اعمل هدف',
  'محتاج اعمل هدف',
  'عايز ابدا هدف',
  'عاوز ابدا هدف',
  'حابب ابدا هدف',
  'اريد وضع هدف',
  'اريد اضافة هدف',
  'اريد اضافه هدف',
  'اريد انشاء هدف',
  'اريد ان ابدا هدف',
  'اريد ابدا هدف',
  'اريد هدف',
  'اضفلي هدف',
  'اضف لي هدف',
  'اضف هدف',
  'اعمللي هدف',
  'اعمل لي هدف',
  'اعمل هدف',
  'انشئ لي هدف',
  'انشئ هدف',
  'انشيء لي هدف',
  'انشيء هدف',
  'سجل لي هدف',
  'سجل هدف',
  'حطلي هدف',
  'حط لي هدف',
  'حط هدف',
  'ابدا هدف',
  'ابدأ هدف',
];

const ENGLISH_GOAL_PREFIXES = [
  "let's create a goal to",
  "let's create a goal",
  "lets create a goal to",
  "lets create a goal",
  "let us create a goal to",
  "let us create a goal",
  "i want to set a goal to",
  "i want to set a goal",
  "i want to create a goal to",
  "i want to create a goal",
  "i want to add a goal to",
  "i want to add a goal",
  "set a goal to",
  "set a goal",
  "create a goal to",
  "create a goal",
  "create goal to",
  "create goal",
  "add a goal to",
  "add a goal",
  "add goal",
  "new goal",
];

/**
 * Detects if the message is a conversational or informational query rather than an explicit command.
 */
function isConversational(text: string): boolean {
  const norm = normalizeText(text);
  const conversationalPhrases = [
    'كيف',
    'ازاي',
    'ما هي',
    'ما هو',
    'ما رايك',
    'هل يمكنك',
    'هل تقدر',
    'هل الافضل',
    'هل من الافضل',
    'هل احسن',
    'هل ينفع',
    'تحدث معي',
    'احكيلي',
    'عندي مهام',
    'عندي الكثير',
    'تنظيم المهام',
    'اداره الوقت',
    'انا خلصت',
    'خلصت المهمه',
    'مش عارف',
    'مش متاكد',
    'مش فاهم',
    'لست اعلم',
    'how to',
    'how can',
    'how should',
    'what is',
    'what do you think',
    'tell me about',
    'i have tasks',
    'i have many',
    'talk to me',
    'organize my',
    'i finished',
    "i don't know",
    'i do not know',
    'i am not sure',
    'should i',
    'is it better',
  ];
  for (const phrase of conversationalPhrases) {
    if (norm.startsWith(phrase) || norm.includes(` ${phrase} `) || norm.includes(` ${phrase}`)) {
      return true;
    }
  }

  // Also check if ends with question mark and starts with question word
  if (text.trim().endsWith('?') || text.trim().endsWith('؟')) {
    const questionStarts = ['هل', 'ازاي', 'كيف', 'ليه', 'لماذا', 'ماذا', 'مين', 'فين', 'how', 'why', 'what', 'where', 'who', 'should', 'can', 'could', 'is'];
    for (const qs of questionStarts) {
      if (norm.startsWith(qs + ' ') || norm === qs) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Deterministically resolves a raw goal reference against active goals.
 * Strict matching rules:
 * 1. Normalize the explicit goal reference.
 * 2. Compare against normalized active goal titles.
 * 3. Exact match prioritized.
 * 4. Accept only an unambiguous match.
 * 5. If zero goals match -> return null.
 * 6. If multiple goals match -> return null (NEVER guess or pick first).
 */
export function resolveGoalDeterministically(
  rawGoalRef: string,
  availableGoals?: Goal[]
): { goalId: string; goalTitle: string } | null {
  if (!rawGoalRef || !availableGoals || !Array.isArray(availableGoals) || availableGoals.length === 0) {
    return null;
  }

  const normRef = normalizeText(rawGoalRef);
  if (!normRef || normRef.length < 2) {
    return null;
  }

  // 1. Exact match check
  const exactMatches = availableGoals.filter(
    (g) => g && typeof g.title === 'string' && normalizeText(g.title) === normRef
  );
  if (exactMatches.length === 1) {
    return {
      goalId: exactMatches[0].id,
      goalTitle: exactMatches[0].title,
    };
  }
  if (exactMatches.length > 1) {
    // Multiple exact matches with identical normalized titles -> ambiguous, do not guess
    return null;
  }

  // 2. Unambiguous substring containment check
  // (e.g. user said "تعلم الانجليزية" and goal is "تعلم اللغة الانجليزية", or vice versa)
  const substringMatches = availableGoals.filter((g) => {
    if (!g || typeof g.title !== 'string') return false;
    const normTitle = normalizeText(g.title);
    return normTitle.includes(normRef) || normRef.includes(normTitle);
  });

  if (substringMatches.length === 1) {
    return {
      goalId: substringMatches[0].id,
      goalTitle: substringMatches[0].title,
    };
  }

  // 0 matches or >1 ambiguous matches -> return null
  return null;
}

/**
 * Parses explicit task creation commands deterministically.
 * Supports optional explicit goal association in Arabic & English.
 */
export function parseTaskCreationCommand(
  input: string,
  availableGoals?: Goal[]
): CreateTaskCommandPayload | null {
  if (!input || typeof input !== 'string') return null;

  // If clearly conversational, do not treat as command
  if (isConversational(input)) {
    return null;
  }

  const rawTrimmed = input.trim();
  const normalized = normalizeText(rawTrimmed);

  // Match prefix
  let matchedPrefix = '';
  let isArabic = false;

  for (const prefix of ARABIC_TASK_PREFIXES) {
    if (normalized === prefix || normalized.startsWith(prefix + ' ') || normalized.startsWith(prefix + ':')) {
      matchedPrefix = prefix;
      isArabic = true;
      break;
    }
  }

  if (!matchedPrefix) {
    for (const prefix of ENGLISH_TASK_PREFIXES) {
      if (normalized === prefix || normalized.startsWith(prefix + ' ') || normalized.startsWith(prefix + ':')) {
        matchedPrefix = prefix;
        isArabic = false;
        break;
      }
    }
  }

  if (!matchedPrefix) {
    return null;
  }

  // Extract raw body by slicing original rawTrimmed using word count of matchedPrefix
  // This ensures the user's original spelling, diacritics, and casing are preserved in the final title.
  const prefixWordsCount = matchedPrefix.trim().split(/\s+/).length;
  const rawWords = rawTrimmed.split(/\s+/);
  let rawBody = rawWords.slice(prefixWordsCount).join(' ').replace(/^[:\-–—\s]+/, '').trim();

  if (!rawBody) {
    // Incomplete command with no title/body
    return null;
  }

  // Extract date: today (default), tomorrow, yesterday
  let targetDate = getLocalDateString(0);
  let dateFound = false;

  // Check tomorrow
  const tomorrowTokens = isArabic
    ? ['بكره', 'بكرة', 'غدا', 'غداً', 'الغد', 'باكر']
    : ['tomorrow'];
  for (const t of tomorrowTokens) {
    const reg = new RegExp(`(^|\\s)${t}(\\s|$)`, 'i');
    if (reg.test(rawBody)) {
      targetDate = getLocalDateString(1);
      rawBody = rawBody.replace(reg, ' ').trim();
      dateFound = true;
      break;
    }
  }

  // Check yesterday
  if (!dateFound) {
    const yesterdayTokens = isArabic ? ['امس', 'أمس', 'الامس', 'الأمس', 'البارحه', 'البارحة'] : ['yesterday'];
    for (const y of yesterdayTokens) {
      const reg = new RegExp(`(^|\\s)${y}(\\s|$)`, 'i');
      if (reg.test(rawBody)) {
        targetDate = getLocalDateString(-1);
        rawBody = rawBody.replace(reg, ' ').trim();
        dateFound = true;
        break;
      }
    }
  }

  // Check today
  if (!dateFound) {
    const todayTokens = isArabic
      ? ['النهارده', 'النهاردة', 'اليوم', 'هذا اليوم']
      : ['today'];
    for (const td of todayTokens) {
      const reg = new RegExp(`(^|\\s)${td}(\\s|$)`, 'i');
      if (reg.test(rawBody)) {
        targetDate = getLocalDateString(0);
        rawBody = rawBody.replace(reg, ' ').trim();
        dateFound = true;
        break;
      }
    }
  }

  // Check weekdays
  if (!dateFound) {
    if (isArabic) {
      const weekdayTokensArabic: Array<{ tokens: string[]; dayIndex: number }> = [
        { tokens: ['السبت'], dayIndex: 6 },
        { tokens: ['الاحد', 'الأحد'], dayIndex: 0 },
        { tokens: ['الاثنين', 'الإثنين', 'التنين'], dayIndex: 1 },
        { tokens: ['الثلاثاء', 'التلات'], dayIndex: 2 },
        { tokens: ['الاربعاء', 'الأربعاء', 'الاربع'], dayIndex: 3 },
        { tokens: ['الخميس'], dayIndex: 4 },
        { tokens: ['الجمعة', 'الجمعه'], dayIndex: 5 },
      ];
      for (const w of weekdayTokensArabic) {
        for (const token of w.tokens) {
          const reg = new RegExp(`(^|\\s)(?:يوم\\s+)?${token}(?:\\s+القادم|\\s+الجاي)?(\\s|$)`, 'i');
          if (reg.test(rawBody)) {
            targetDate = getNextWeekdayDate(w.dayIndex);
            rawBody = rawBody.replace(reg, ' ').trim();
            dateFound = true;
            break;
          }
        }
        if (dateFound) break;
      }
    } else {
      const weekdayTokensEnglish: Array<{ tokens: string[]; dayIndex: number }> = [
        { tokens: ['sunday'], dayIndex: 0 },
        { tokens: ['monday'], dayIndex: 1 },
        { tokens: ['tuesday'], dayIndex: 2 },
        { tokens: ['wednesday'], dayIndex: 3 },
        { tokens: ['thursday'], dayIndex: 4 },
        { tokens: ['friday'], dayIndex: 5 },
        { tokens: ['saturday'], dayIndex: 6 },
      ];
      for (const w of weekdayTokensEnglish) {
        for (const token of w.tokens) {
          const reg = new RegExp(`(^|\\s)(?:on\\s+)?${token}(?:\\s+next)?(\\s|$)`, 'i');
          if (reg.test(rawBody)) {
            targetDate = getNextWeekdayDate(w.dayIndex);
            rawBody = rawBody.replace(reg, ' ').trim();
            dateFound = true;
            break;
          }
        }
        if (dateFound) break;
      }
    }
  }

  // Strip connector words like "to", "ان", "بـ"
  rawBody = rawBody.replace(/^(to\s+|ان\s+|بـ|بأن\s+|بانه\s+|بان\s+|ب\s+)/i, '').trim();

  // Extract priority: high, medium, low (default: medium or prefix-specified)
  let priority: TaskPriority = 'medium';
  if (matchedPrefix.includes('high-priority') || matchedPrefix.includes('high priority')) {
    priority = 'high';
  } else if (matchedPrefix.includes('low-priority') || matchedPrefix.includes('low priority')) {
    priority = 'low';
  }

  const highTokens = isArabic
    ? [
        'أولوية قصوى',
        'اولوية قصوى',
        'أولوية قصوي',
        'اولوية قصوي',
        'اولويه قصوي',
        'اولويه قصوى',
        'أولوية عالية',
        'اولوية عالية',
        'أولوية عاليه',
        'اولوية عاليه',
        'اولويه عاليه',
        'اولويه عالية',
        'عالية جدا',
        'عاليه جدا',
        'قصوي',
        'قصوى',
        'عالية',
        'عاليه',
        'مهمة جدا',
        'مهمه جدا',
        'مهم جدا',
      ]
    : ['highest priority', 'high priority', 'priority high', 'urgent', 'high'];
  for (const h of highTokens) {
    const reg = new RegExp(`(^|\\s)(with\\s+|(?:بـ|و|ب)?(?:اديها|اعطيها|خلها)?\\s*)?${h}(\\s|$)`, 'i');
    if (reg.test(rawBody)) {
      priority = 'high';
      rawBody = rawBody.replace(reg, ' ').trim();
      break;
    }
  }

  if (priority === 'medium') {
    const lowTokens = isArabic
      ? [
          'أولوية منخفضة',
          'اولوية منخفضة',
          'أولوية منخفضه',
          'اولوية منخفضه',
          'اولويه منخفضه',
          'اولويه منخفضة',
          'أولوية اعتيادية',
          'اولوية اعتيادية',
          'أولوية اعتياديه',
          'اولوية اعتياديه',
          'اولويه اعتياديه',
          'اولويه اعتيادية',
          'منخفضة',
          'منخفضه',
          'اعتيادية',
          'اعتياديه',
          'هادية',
          'هاديه',
          'مش عاجلة',
          'مش عاجله',
          'غير عاجلة',
          'غير عاجله',
        ]
      : ['low priority', 'priority low', 'low'];
    for (const l of lowTokens) {
      const reg = new RegExp(`(^|\\s)(with\\s+|(?:بـ|و|ب)?(?:اديها|اعطيها|خلها)?\\s*)?${l}(\\s|$)`, 'i');
      if (reg.test(rawBody)) {
        priority = 'low';
        rawBody = rawBody.replace(reg, ' ').trim();
        break;
      }
    }
  }

  if (priority === 'medium') {
    const medTokens = isArabic
      ? [
          'أولوية متوسطة',
          'اولوية متوسطة',
          'أولوية متوسطه',
          'اولوية متوسطه',
          'اولويه متوسطه',
          'اولويه متوسطة',
          'متوسطة',
          'متوسطه',
          'عادية',
          'عاديه',
        ]
      : ['medium priority', 'priority medium', 'medium'];
    for (const m of medTokens) {
      const reg = new RegExp(`(^|\\s)(with\\s+|(?:بـ|و|ب)?(?:اديها|اعطيها|خلها)?\\s*)?${m}(\\s|$)`, 'i');
      if (reg.test(rawBody)) {
        priority = 'medium';
        rawBody = rawBody.replace(reg, ' ').trim();
        break;
      }
    }
  }

  // Extract explicit Goal reference if specified
  let rawGoalRef: string | undefined;

  if (isArabic) {
    // Patterns: لهدف [اسم], تبع هدف [اسم], في هدف [اسم], مرتبط بهدف [اسم], بالهدف [اسم]
    const arabicGoalPatterns = [
      /(?:^|\s)(?:مرتبط\s+بهدف|تبع\s+هدف|لهدف|في\s+هدف|ضمن\s+هدف|تحت\s+هدف|بالهدف|بهدف)\s+([^,]+?)(?=\s+(?:أولوية|اولوية|أولويه|اولويه|بأولوية|باولوية|بأولويه|باولويه|قصوي|قصوى|عالية|عاليه|منخفضة|منخفضه|متوسطة|متوسطه|النهارده|النهاردة|اليوم|بكره|غدا|امس)|$)/i,
    ];
    for (const pat of arabicGoalPatterns) {
      const m = rawBody.match(pat);
      if (m && m[1]) {
        rawGoalRef = m[1].trim();
        rawBody = rawBody.replace(pat, ' ').trim();
        break;
      }
    }
  } else {
    // Patterns: for goal [name], to goal [name], under goal [name], linked to goal [name], linked to [name]
    const englishGoalPatterns = [
      /(?:^|\s)(?:for\s+goal|to\s+goal|under\s+goal|linked\s+to\s+goal|linked\s+to)\s+([^,]+?)(?=\s+(?:with\s+priority|priority|high|low|medium|today|tomorrow|yesterday)|$)/i,
    ];
    for (const pat of englishGoalPatterns) {
      const m = rawBody.match(pat);
      if (m && m[1]) {
        rawGoalRef = m[1].trim();
        rawBody = rawBody.replace(pat, ' ').trim();
        break;
      }
    }
  }

  // Clean trailing punctuation or connector noise from title
  let title = rawBody
    .replace(/^[:\-–—\s]+/, '')
    .replace(/[:\-–—\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // If title became empty after extracting date/priority/goal, abort
  if (!title || title.length < 2) {
    return null;
  }

  // Resolve goal deterministically against available goals
  let resolvedGoal: { goalId: string; goalTitle: string } | null = null;
  if (rawGoalRef && availableGoals && availableGoals.length > 0) {
    resolvedGoal = resolveGoalDeterministically(rawGoalRef, availableGoals);
  }

  return {
    title,
    priority,
    date: targetDate,
    goalId: resolvedGoal?.goalId,
    goalTitle: resolvedGoal?.goalTitle,
    rawGoalReference: rawGoalRef,
  };
}

/**
 * Normalizes Eastern Arabic (Arabic-Indic) digits (٠-٩) and Persian digits (۰-۹) to Western Arabic digits (0-9).
 */
export function normalizeDigits(str: string): string {
  return str
    .replace(/[٠۰]/g, '0')
    .replace(/[١۱]/g, '1')
    .replace(/[٢۲]/g, '2')
    .replace(/[٣۳]/g, '3')
    .replace(/[٤۴]/g, '4')
    .replace(/[٥۵]/g, '5')
    .replace(/[٦۶]/g, '6')
    .replace(/[٧۷]/g, '7')
    .replace(/[٨۸]/g, '8')
    .replace(/[٩۹]/g, '9');
}

/**
 * Explicit command prefixes for goal progress updates.
 */
const ARABIC_PROGRESS_PREFIXES = [
  'حدث تقدم هدف',
  'حدث تقدم الهدف',
  'حدث تقدم',
  'عدل تقدم هدف',
  'عدل تقدم الهدف',
  'عدل تقدم',
  'غير تقدم هدف',
  'غير تقدم الهدف',
  'غير تقدم',
  'خل تقدم هدف',
  'خلي تقدم هدف',
  'خل تقدم الهدف',
  'خلي تقدم الهدف',
  'اضبط تقدم هدف',
  'اضبط تقدم الهدف',
  'اضبط تقدم',
  'سجل تقدم هدف',
  'سجل تقدم الهدف',
  'سجل تقدم',
];

const ENGLISH_PROGRESS_PREFIXES = [
  'update progress of goal',
  'update progress of the goal',
  'update progress of',
  'update goal progress of',
  'update goal progress for',
  'update goal progress',
  'update progress for goal',
  'update progress for',
  'update progress',
  'set progress of goal',
  'set progress of the goal',
  'set progress of',
  'set goal progress of',
  'set goal progress for',
  'set goal progress to',
  'set goal progress',
  'set progress for goal',
  'set progress for',
  'set progress',
  'change progress of goal',
  'change progress of',
  'change goal progress of',
  'change goal progress to',
  'change progress to',
  'update goal',
];

/**
 * Parses explicit absolute goal progress update commands deterministically.
 * Strict rules:
 * - Absolute progress only (0 to 100 inclusive).
 * - Reject values < 0 or > 100 (never clamp).
 * - Reject relative updates (e.g. "زود 10%", "increase by 10%").
 * - Deterministic goal resolution; fail closed if 0 or ambiguous matches.
 */
export function parseGoalProgressCommand(
  input: string,
  availableGoals?: Goal[]
): UpdateGoalProgressCommandPayload | null {
  if (!input || typeof input !== 'string') return null;

  // Conversational guard: filter out conversational / reflective thoughts
  const norm = normalizeText(input);
  if (
    norm.includes('كام نسبه') ||
    norm.includes('كم نسبه') ||
    norm.includes('حاسس اني') ||
    norm.includes('اعتقد اني') ||
    norm.includes('انا وصلت') ||
    norm.includes('i think') ||
    norm.includes('how much') ||
    norm.includes('what is the progress')
  ) {
    return null;
  }

  // Reject relative expressions explicitly
  if (
    /(\+|-|زود|زد|نقص|قلل|ارفع|خفض|increase\s+by|decrease\s+by|add\s+\d|reduce\s+by)/i.test(input)
  ) {
    return null;
  }

  // Check prefix match
  let matchedPrefix = '';
  let isArabic = false;

  for (const prefix of ARABIC_PROGRESS_PREFIXES) {
    if (norm === prefix || norm.startsWith(prefix + ' ') || norm.startsWith(prefix + ':')) {
      matchedPrefix = prefix;
      isArabic = true;
      break;
    }
  }

  if (!matchedPrefix) {
    for (const prefix of ENGLISH_PROGRESS_PREFIXES) {
      if (norm === prefix || norm.startsWith(prefix + ' ') || norm.startsWith(prefix + ':')) {
        matchedPrefix = prefix;
        isArabic = false;
        break;
      }
    }
  }

  if (!matchedPrefix) {
    return null;
  }

  // Extract raw body after prefix
  const prefixWordsCount = matchedPrefix.trim().split(/\s+/).length;
  const rawWords = input.trim().split(/\s+/);
  let rawBody = rawWords.slice(prefixWordsCount).join(' ').replace(/^[:\-–—\s]+/, '').trim();

  if (!rawBody) {
    return null;
  }

  // Normalize digits in rawBody for regex extraction while retaining structure
  const digitsNormalizedBody = normalizeDigits(rawBody);

  // Extract target percentage / absolute progress value
  // Patterns:
  // Arabic: إلى 50% | الى 50% | لـ 50% | 50 بالمئة | 50 بالميه | 50 في المية | 50% | 50
  // English: to 40% | to 40 percent | to 40 | 40% | 40 percent
  let targetProgress: number | null = null;
  let matchedPercentageRegexStr: RegExp | null = null;

  const percentagePatterns = [
    // Explicit preposition + number + optional %/percent
    /(?:^|\s)(?:إلى|الى|لـ|ل|to|at)\s+(-?\d+)\s*(?:%|٪|بالمئة|بالمائه|بالمية|بالميه|في\s+المية|في\s+المائة|percent)?(?:\s|$)/i,
    // Number followed by explicit %/percent/بالمئة
    /(?:^|\s)(-?\d+)\s*(?:%|٪|بالمئة|بالمائه|بالمية|بالميه|في\s+المية|في\s+المائة|percent)(?:\s|$)/i,
    // Trailing number alone (e.g. "خل تقدم هدف Book Writing 40")
    /(?:^|\s)(-?\d+)\s*$/i,
  ];

  for (const pat of percentagePatterns) {
    const m = digitsNormalizedBody.match(pat);
    if (m && m[1] !== undefined) {
      const parsedNum = parseInt(m[1], 10);
      if (!isNaN(parsedNum)) {
        targetProgress = parsedNum;
        matchedPercentageRegexStr = pat;
        break;
      }
    }
  }

  if (targetProgress === null) {
    return null;
  }

  // STRICT VALIDATION: Range must be 0 through 100 inclusive.
  // DO NOT CLAMP. Values < 0 or > 100 are rejected immediately.
  if (targetProgress < 0 || targetProgress > 100) {
    return null;
  }

  // Extract Goal reference by removing matched percentage from rawBody
  let goalRefCandidate = rawBody;
  if (matchedPercentageRegexStr) {
    goalRefCandidate = digitsNormalizedBody.replace(matchedPercentageRegexStr, ' ').trim();
  }

  // Clean goal reference candidate
  let cleanGoalRef = goalRefCandidate
    .replace(/^[:\-–—\s]+/, '')
    .replace(/[:\-–—\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip optional connecting words like "هدف" or "goal" at beginning of candidate
  cleanGoalRef = cleanGoalRef
    .replace(/^(?:هدف|الهدف|goal|the\s+goal)\s+/i, '')
    .trim();

  if (!cleanGoalRef || cleanGoalRef.length < 2) {
    return null;
  }

  // Deterministic goal resolution
  if (!availableGoals || availableGoals.length === 0) {
    return null;
  }

  const resolved = resolveGoalDeterministically(cleanGoalRef, availableGoals);
  if (!resolved) {
    return null;
  }

  const matchedGoal = availableGoals.find((g) => g.id === resolved.goalId);
  const currentProgress = matchedGoal && typeof matchedGoal.progress === 'number'
    ? matchedGoal.progress
    : 0;

  return {
    goalId: resolved.goalId,
    goalTitle: resolved.goalTitle,
    currentProgress,
    newProgress: targetProgress,
    rawGoalReference: cleanGoalRef,
  };
}

/**
 * Checks if the text matches explicit "Align My Day" triggers in Arabic or English.
 * Does not match ordinary conversational queries.
 */
export function isAlignDayTrigger(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  const normalized = normalizeText(input);
  if (!normalized) return false;

  // Exact normalized Arabic matches:
  // "ساعدني اظبط يومي", "ساعدني اضبط يومي", "اقترح لي مهمه لليوم", "اقترحلي مهمه لليوم"
  const arabicTriggers = [
    'ساعدني اظبط يومي',
    'ساعدني اضبط يومي',
    'اقترح لي مهمه لليوم',
    'اقترحلي مهمه لليوم',
    'اقترح لي مهمه اليوم',
    'اقترحلي مهمه اليوم',
  ];

  if (arabicTriggers.includes(normalized)) {
    return true;
  }

  // Exact English matches:
  const englishTriggers = [
    'align my day',
    'help me align my day',
    'suggest a task for today',
  ];

  if (englishTriggers.includes(normalized)) {
    return true;
  }

  return false;
}

/**
 * Checks if the text matches explicit "Daily Briefing" triggers in Arabic or English.
 * Explicitly does NOT match "صباح الخير" or ordinary conversational queries.
 */
export function isDailyBriefingTrigger(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  const normalized = normalizeText(input);
  if (!normalized) return false;

  // Exact normalized Arabic matches:
  // "موجز اليوم", "اعطني موجز اليوم", "اعطني الموجز اليومي", "الموجز اليومي", "ملخص اليوم"
  const arabicTriggers = [
    'موجز اليوم',
    'اعطني موجز اليوم',
    'اعطني الموجز اليومي',
    'الموجز اليومي',
    'ملخص اليوم',
  ];

  for (const trigger of arabicTriggers) {
    if (
      normalized === trigger ||
      normalized === `من فضلك ${trigger}` ||
      normalized === `لو سمحت ${trigger}`
    ) {
      return true;
    }
  }

  // Exact English matches:
  // "daily briefing", "give me my daily briefing", "morning briefing", "today's briefing", "brief me"
  const englishTriggers = [
    'daily briefing',
    'give me my daily briefing',
    'morning briefing',
    "today's briefing",
    'today s briefing',
    'todays briefing',
    'brief me',
  ];

  for (const trigger of englishTriggers) {
    if (
      normalized === trigger ||
      normalized === `please ${trigger}`
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if the text matches explicit "Next Action" triggers in Arabic or English.
 * Explicitly does NOT match open-ended conversational questions.
 */
export function isNextActionTrigger(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  // Strip trailing punctuation (question marks, exclamation, period, colon)
  const cleaned = input.trim().replace(/[.,!?;:؟]+$/g, '').trim();
  const normalized = normalizeText(cleaned);
  if (!normalized) return false;

  // Exact normalized Arabic matches:
  // ماذا أفعل الآن / ماذا افعل الان / ما هي خطوتي التالية / ما هي خطوتي القادمه / خطوتي التالية / اقترح عمل الآن / ماذا اعمل الان
  const arabicTriggers = [
    'ماذا افعل الان',
    'ما هي خطوتي التاليه',
    'ما هي خطوتي القادمه',
    'خطوتي التاليه',
    'اقترح عمل الان',
    'ماذا اعمل الان',
  ];

  for (const trigger of arabicTriggers) {
    if (
      normalized === trigger ||
      normalized === `من فضلك ${trigger}` ||
      normalized === `لو سمحت ${trigger}`
    ) {
      return true;
    }
  }

  // Exact English matches:
  // what should i do now / what should i work on next / what is my next action / next action / what next
  const englishTriggers = [
    'what should i do now',
    'what should i work on next',
    'what is my next action',
    'next action',
    'what next',
  ];

  for (const trigger of englishTriggers) {
    if (
      normalized === trigger ||
      normalized === `please ${trigger}`
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if the text matches explicit "Attention Radar" triggers in Arabic or English.
 * Explicitly does NOT match open-ended conversational questions.
 */
export function isAttentionRadarTrigger(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  // Strip trailing punctuation (question marks, exclamation, period, colon)
  const cleaned = input.trim().replace(/[.,!?;:؟]+$/g, '').trim();
  const normalized = normalizeText(cleaned);
  if (!normalized) return false;

  // Exact normalized Arabic matches:
  // ما الذي يحتاج انتباهي / ما الذي يتطلب انتباهي / ماذا يحتاج انتباهي / ما الذي يجب ان انتبه له / تنبيهات مساحة العمل
  const arabicTriggers = [
    'ما الذي يحتاج انتباهي',
    'ما الذي يتطلب انتباهي',
    'ماذا يحتاج انتباهي',
    'ما الذي يجب ان انتبه له',
    'تنبيهات مساحه العمل',
  ];

  for (const trigger of arabicTriggers) {
    if (
      normalized === trigger ||
      normalized === `من فضلك ${trigger}` ||
      normalized === `لو سمحت ${trigger}`
    ) {
      return true;
    }
  }

  // Exact English matches:
  // what needs my attention / what requires my attention / what should i pay attention to / where should my attention be / attention radar
  const englishTriggers = [
    'what needs my attention',
    'what requires my attention',
    'what should i pay attention to',
    'where should my attention be',
    'attention radar',
  ];

  for (const trigger of englishTriggers) {
    if (
      normalized === trigger ||
      normalized === `please ${trigger}`
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if input is an approved portfolio goal pacing trigger in Arabic or English.
 * Supports approved polite prefixes and strips trailing punctuation.
 * Strictly does NOT match open-ended conversational questions (e.g. "إزاي أحقق أهدافي؟").
 */
export function isPortfolioGoalPacingTrigger(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  const cleaned = input.trim().replace(/[.,!?;:؟]+$/g, '').trim();
  const normalized = normalizeText(cleaned);
  if (!normalized) return false;

  const arabicTriggers = [
    'ما وضع اهدافي',
    'كيف اداء اهدافي',
    'كيف ماشيه اهدافي',
    'تقرير اهدافي',
  ];

  for (const trigger of arabicTriggers) {
    if (
      normalized === trigger ||
      normalized === `من فضلك ${trigger}` ||
      normalized === `لو سمحت ${trigger}`
    ) {
      return true;
    }
  }

  const englishTriggers = [
    'how are my goals doing',
    'how am i doing on my goals',
    'show my goal pacing',
    'goal pacing summary',
    'goal pacing',
  ];

  for (const trigger of englishTriggers) {
    if (
      normalized === trigger ||
      normalized === `please ${trigger}`
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if input matches single-goal pacing triggers in Arabic or English and extracts the raw query title.
 * Examples:
 * - "ما وضع هدف [title]"
 * - "كيف أداء هدف [title]"
 * - "how is goal [title] doing"
 * - "pacing for goal [title]"
 */
export function extractSingleGoalPacingQuery(input: string): { isSingleGoal: boolean; queryTitle: string } | null {
  if (!input || typeof input !== 'string') return null;
  const cleaned = input.trim().replace(/[.,!?;:؟]+$/g, '').trim();
  if (!cleaned) return null;

  // Strip polite prefixes from raw text first for prefix matching
  let text = cleaned;
  const politePrefixes = [
    /^(من فضلك|لو سمحت)\s+/i,
    /^please\s+/i,
  ];
  for (const p of politePrefixes) {
    text = text.replace(p, '').trim();
  }

  // Arabic single-goal triggers:
  // "ما وضع هدف [title]"
  // "كيف اداء هدف [title]"
  // Also tolerate diacritics/alef variants in "أداء"
  const arRegex1 = /^ما\s+وضع\s+هدف\s+(.+)$/i;
  const arRegex2 = /^كيف\s+[أإا]داء\s+هدف\s+(.+)$/i;
  const matchAr1 = text.match(arRegex1);
  if (matchAr1 && matchAr1[1]?.trim()) {
    return { isSingleGoal: true, queryTitle: matchAr1[1].trim() };
  }
  const matchAr2 = text.match(arRegex2);
  if (matchAr2 && matchAr2[1]?.trim()) {
    return { isSingleGoal: true, queryTitle: matchAr2[1].trim() };
  }

  // English single-goal triggers:
  // "how is goal [title] doing"
  // "pacing for goal [title]"
  const enRegex1 = /^how\s+is\s+goal\s+(.+?)\s+doing$/i;
  const matchEn1 = text.match(enRegex1);
  if (matchEn1 && matchEn1[1]?.trim()) {
    return { isSingleGoal: true, queryTitle: matchEn1[1].trim() };
  }

  const enRegex2 = /^pacing\s+for\s+goal\s+(.+)$/i;
  const matchEn2 = text.match(enRegex2);
  if (matchEn2 && matchEn2[1]?.trim()) {
    return { isSingleGoal: true, queryTitle: matchEn2[1].trim() };
  }

  return null;
}

/**
 * Pure deterministic Single-Goal Matching Contract:
 * Step 1: Try exact normalized title match.
 * Step 2: If no exact match, allow unique normalized substring match.
 * Step 3: If exactly one goal matches, return { status: 'match', goal }.
 * Step 4: If zero goals match -> FAIL CLOSED ({ status: 'not_found' }).
 * Step 5: If multiple goals match -> FAIL CLOSED ({ status: 'ambiguous', matches }).
 */
export function resolveSingleGoalDeterministically(
  queryTitle: string,
  goals: Goal[]
): {
  status: 'match' | 'not_found' | 'ambiguous';
  goal?: Goal;
  matches?: Goal[];
} {
  const safeGoals = (Array.isArray(goals) ? goals : []).filter(
    (g) => g && typeof g.id === 'string' && g.id.trim() !== ''
  );

  const normQuery = normalizeText(queryTitle);
  if (!normQuery) {
    return { status: 'not_found' };
  }

  // Step 1: Exact normalized match
  const exactMatches = safeGoals.filter((g) => normalizeText(g.title || '') === normQuery);
  if (exactMatches.length === 1) {
    return { status: 'match', goal: exactMatches[0] };
  }
  if (exactMatches.length > 1) {
    return { status: 'ambiguous', matches: exactMatches };
  }

  // Step 2: Unique normalized substring match
  const substringMatches = safeGoals.filter((g) => {
    const normTitle = normalizeText(g.title || '');
    return normTitle.includes(normQuery);
  });

  if (substringMatches.length === 1) {
    return { status: 'match', goal: substringMatches[0] };
  }
  if (substringMatches.length > 1) {
    return { status: 'ambiguous', matches: substringMatches };
  }

  // Step 4: Zero matches
  return { status: 'not_found' };
}

/**
 * Deterministically formats the authoritative goal pacing feedback for chat.
 * Purely deterministic string formatting using exact values from GoalPacingAnalysis.
 */
export function formatGoalPacingFeedback(
  analyses: GoalPacingAnalysis[],
  mode: 'portfolio' | 'single',
  language: 'ar' | 'en'
): string {
  if (mode === 'single') {
    const a = analyses[0];
    if (!a) return '';
    const ratioStr =
      a.executionCompletionRatio === 'no_data'
        ? (language === 'ar' ? 'لا توجد مهام' : 'No tasks')
        : `${a.executionCompletionRatio}%`;

    const stateLabelsAr: Record<string, string> = {
      'No Execution Data': 'لا توجد بيانات تنفيذ',
      'Dormant / Stalled': 'راكد / متوقف',
      'Pacing Deficit': 'عجز في وتيرة الإنجاز',
      'Active': 'نشط',
      'Steady': 'منتظم',
    };

    const stateDisplay = language === 'ar' ? (stateLabelsAr[a.activityState] || a.activityState) : a.activityState;

    if (language === 'ar') {
      return [
        `تقرير وتيرة الهدف: ${a.goalTitle}`,
        `• الحالة: ${stateDisplay}`,
        `• الإنجاز الحالي: ${a.currentProgress}%`,
        `• عمر الهدف: ${a.ageDays} يوم`,
        `• الوتيرة اليومية: ${a.lifetimePace}% / يوم`,
        `• نسبة إكمال المهام المرتبطة: ${ratioStr} (${a.completedLinkedTaskCount}/${a.linkedTaskCount})`,
        `• توزيع المهام: ${a.overdueLinkedTaskCount} متأخرة | ${a.todayLinkedTaskCount} اليوم | ${a.upcomingLinkedTaskCount} قادمة`,
        `• وقت التركيز المستثمر: ${a.focusMinutes} دقيقة`,
      ].join('\n');
    } else {
      return [
        `Goal Pacing Report: ${a.goalTitle}`,
        `• State: ${stateDisplay}`,
        `• Current Progress: ${a.currentProgress}%`,
        `• Goal Age: ${a.ageDays} day(s)`,
        `• Daily Lifetime Pace: ${a.lifetimePace}% / day`,
        `• Execution Completion Ratio: ${ratioStr} (${a.completedLinkedTaskCount}/${a.linkedTaskCount})`,
        `• Scheduled Tasks: ${a.overdueLinkedTaskCount} overdue | ${a.todayLinkedTaskCount} today | ${a.upcomingLinkedTaskCount} upcoming`,
        `• Deep Focus Invested: ${a.focusMinutes} min`,
      ].join('\n');
    }
  }

  // Portfolio mode formatting
  if (language === 'ar') {
    const stateLabelsAr: Record<string, string> = {
      'No Execution Data': 'لا توجد بيانات',
      'Dormant / Stalled': 'راكد',
      'Pacing Deficit': 'عجز وتيرة',
      'Active': 'نشط',
      'Steady': 'منتظم',
    };

    const lines = [
      `تقرير وتيرة أهدافك (${analyses.length} أهداف نشطة):`,
      ...analyses.map((a, i) => {
        const ratioStr =
          a.executionCompletionRatio === 'no_data' ? 'بدون مهام' : `${a.executionCompletionRatio}% إكمال`;
        const stateDisplay = stateLabelsAr[a.activityState] || a.activityState;
        return `${i + 1}. ${a.goalTitle} [${stateDisplay}]\n   • الإنجاز: ${a.currentProgress}% | الوتيرة: ${a.lifetimePace}%/يوم | المهام: ${ratioStr} (${a.overdueLinkedTaskCount} متأخرة) | التركيز: ${a.focusMinutes} د`;
      }),
    ];
    return lines.join('\n');
  } else {
    const lines = [
      `Goal Pacing Portfolio Report (${analyses.length} active goals):`,
      ...analyses.map((a, i) => {
        const ratioStr =
          a.executionCompletionRatio === 'no_data' ? 'No tasks' : `${a.executionCompletionRatio}% execution`;
        return `${i + 1}. ${a.goalTitle} [${a.activityState}]\n   • Progress: ${a.currentProgress}% | Lifetime Pace: ${a.lifetimePace}%/day | Ratio: ${ratioStr} (${a.overdueLinkedTaskCount} overdue) | Focus: ${a.focusMinutes}m`;
      }),
    ];
    return lines.join('\n');
  }
}

/**
 * Deterministically formats the authoritative Daily Briefing output for chat feedback.
 * Uses exact values from generateDailyBriefing with zero hallucination.
 */
export function formatDailyBriefingFeedback(
  briefing: DailyBriefing,
  language: 'ar' | 'en'
): string {
  if (language === 'ar') {
    const lines = [
      `${briefing.greetingAr}! إليك موجز NOVO لليوم:`,
      `• المهام: ${briefing.taskStats.completedToday}/${briefing.taskStats.totalToday} مكتملة اليوم (${briefing.taskStats.pendingCount} معلقة)`,
      `• الأهداف: ${briefing.goalStats.activeCount} أهداف نشطة (متوسط الإنجاز: ${briefing.goalStats.averageProgress}%)`,
      `• التركيز: ${briefing.focusStats.todayMinutes} دقيقة اليوم (${briefing.focusStats.weeklyMinutes} دقيقة أسبوعياً)`,
      `• التوصية: ${briefing.recommendationAr}`,
    ];
    return lines.join('\n');
  } else {
    const lines = [
      `${briefing.greeting}! Here is your NOVO Daily Briefing:`,
      `• Tasks: ${briefing.taskStats.completedToday}/${briefing.taskStats.totalToday} completed today (${briefing.taskStats.pendingCount} pending)`,
      `• Goals: ${briefing.goalStats.activeCount} active goals (average progress: ${briefing.goalStats.averageProgress}%)`,
      `• Focus: ${briefing.focusStats.todayMinutes} min today (${briefing.focusStats.weeklyMinutes} min weekly)`,
      `• Recommendation: ${briefing.recommendation}`,
    ];
    return lines.join('\n');
  }
}

/**
 * Deterministically selects ONE unattended goal for today using strict tie-break rules:
 * 1. Lowest progress first.
 * 2. If progress ties, earlier createdAt first (lexicographically or chronologically).
 * 3. If still tied, stable lexical comparison of goal.id (gA.id.localeCompare(gB.id)).
 */
export function selectDeterministicUnattendedGoal(unattendedGoals: Goal[]): Goal | null {
  if (!unattendedGoals || !Array.isArray(unattendedGoals) || unattendedGoals.length === 0) {
    return null;
  }

  const sorted = [...unattendedGoals].sort((a, b) => {
    // 1. Lowest progress first
    const progA = typeof a.progress === 'number' ? a.progress : 0;
    const progB = typeof b.progress === 'number' ? b.progress : 0;
    if (progA !== progB) {
      return progA - progB;
    }

    // 2. Earlier createdAt first
    const createdA = a.createdAt || '';
    const createdB = b.createdAt || '';
    if (createdA !== createdB) {
      return createdA.localeCompare(createdB);
    }

    // 3. Stable lexical comparison of goal.id
    return a.id.localeCompare(b.id);
  });

  return sorted[0] || null;
}




interface CommandPattern {
  keywords: string[];
  route: RouteId;
  titleAr: string;
  titleEn: string;
}

const NAVIGATION_PATTERNS: CommandPattern[] = [
  {
    keywords: [
      'افتح الملاحظات',
      'الملاحظات',
      'ملاحظاتي',
      'اذهب الي الملاحظات',
      'عرض الملاحظات',
      'open notes',
      'notes',
      'go to notes',
      'show notes',
    ],
    route: 'notes',
    titleAr: 'الانتقال إلى الملاحظات',
    titleEn: 'Opening Notes',
  },
  {
    keywords: [
      'اعرض اهدافي',
      'الاهداف',
      'اهدافي',
      'افتح الاهداف',
      'اذهب الي الاهداف',
      'عرض الاهداف',
      'open goals',
      'goals',
      'show goals',
      'go to goals',
      'my goals',
    ],
    route: 'goals',
    titleAr: 'الانتقال إلى الأهداف',
    titleEn: 'Opening Goals',
  },
  {
    keywords: [
      'اذهب الي التخطيط',
      'اذهب الى التخطيط',
      'اذهب الي المخطط',
      'اذهب الى المخطط',
      'التخطيط',
      'المهام',
      'مهامي',
      'جدول اليوم',
      'افتح التخطيط',
      'افتح المخطط',
      'المخطط',
      'open planner',
      'planner',
      'tasks',
      'go to planner',
      'today tasks',
    ],
    route: 'planner',
    titleAr: 'الانتقال إلى جدول التخطيط والمهام',
    titleEn: 'Opening Planner',
  },
  {
    keywords: [
      'ابدا التركيز',
      'ابدأ التركيز',
      'التركيز',
      'جلسه تركيز',
      'جلسة تركيز',
      'افتح التركيز',
      'اذهب الي التركيز',
      'start focus',
      'focus',
      'open focus',
      'go to focus',
      'focus session',
    ],
    route: 'focus',
    titleAr: 'بدء جلسة تركيز جديدة',
    titleEn: 'Opening Focus Timer',
  },
  {
    keywords: [
      'تتبع الاموال',
      'الاموال',
      'المصاريف',
      'الميزانيه',
      'الميزانية',
      'افتح الاموال',
      'اذهب الي الاموال',
      'track money',
      'money',
      'finance',
      'expenses',
      'open money',
      'budget',
    ],
    route: 'money',
    titleAr: 'الانتقال إلى متتبع الأموال والميزانية',
    titleEn: 'Opening Finances',
  },
  {
    keywords: [
      'بنك المعرفة',
      'المعرفة',
      'افتح المعرفة',
      'قاعدة المعرفة',
      'ذاكرة المعرفة',
      'open knowledge',
      'knowledge',
      'vault',
      'knowledge bank',
    ],
    route: 'knowledge',
    titleAr: 'الانتقال إلى بنك المعرفة والذاكرة',
    titleEn: 'Opening Knowledge Vault',
  },
  {
    keywords: [
      'المحادثة',
      'المحادثه',
      'حوار',
      'حوار نوفو',
      'دردشة',
      'افتح المحادثة',
      'open chat',
      'chat',
      'conversation',
    ],
    route: 'chat',
    titleAr: 'الانتقال إلى حوار NOVO',
    titleEn: 'Opening Chat',
  },
  {
    keywords: [
      'الاعدادات',
      'افتح الاعدادات',
      'اذهب الي الاعدادات',
      'open settings',
      'settings',
    ],
    route: 'settings',
    titleAr: 'الانتقال إلى الإعدادات',
    titleEn: 'Opening Settings',
  },
];

/**
 * Parses user text for deterministic local commands.
 *
 * If uncertain, returns { isCommand: false }.
 * Does NOT invoke AI models, purely local pattern matching.
 */
export function parseCommand(
  input: string,
  availableGoals?: Goal[],
  availableTasks?: Task[],
  targetDate?: string | Date
): CommandParseResult {
  if (!input || typeof input !== 'string') {
    return { isCommand: false };
  }

  const normalized = normalizeText(input);
  if (!normalized) {
    return { isCommand: false };
  }

  // Check for explicit "Align My Day" command FIRST
  if (isAlignDayTrigger(input)) {
    const safeGoals = Array.isArray(availableGoals) ? availableGoals : [];
    const safeTasks = Array.isArray(availableTasks) ? availableTasks : [];
    const alignment = analyzeDailyGoalAlignment(safeTasks, safeGoals, targetDate || new Date());
    const unattended = alignment.unattendedGoals;
    const selectedGoal = selectDeterministicUnattendedGoal(unattended);

    const activeGoals = safeGoals.filter(
      (g) =>
        g &&
        typeof g.id === 'string' &&
        g.id.trim() !== '' &&
        (typeof g.progress !== 'number' || g.progress < 100)
    );

    if (selectedGoal) {
      const suggestedTaskTitle = `متابعة ومواصلة العمل على: ${selectedGoal.title}`;
      const command: NOVOCommand = {
        rawInput: input,
        action: 'align_day',
        alignDayPayload: {
          selectedGoalId: selectedGoal.id,
          selectedGoalTitle: selectedGoal.title,
          suggestedTaskTitle,
          hasUnattendedGoals: true,
          activeGoalCount: activeGoals.length,
        },
        confidence: 0.95,
        feedbackAr: `مقترح مواءمة اليوم: ${suggestedTaskTitle}`,
        feedbackEn: `Align Day Proposal: Follow up and continue work on: ${selectedGoal.title}`,
      };
      return { isCommand: true, command };
    } else {
      // Zero unattended goals or zero active goals
      const noGoalFeedbackAr =
        activeGoals.length === 0
          ? 'ليس لديك أهداف نشطة غير مكتملة أحتاج لاقتراح مهمة لها اليوم.'
          : 'كل أهدافك النشطة لها مهام مجدولة اليوم.';
      const noGoalFeedbackEn =
        activeGoals.length === 0
          ? 'You have no incomplete active goals to suggest tasks for today.'
          : 'All your active goals have tasks scheduled for today.';

      const command: NOVOCommand = {
        rawInput: input,
        action: 'align_day',
        alignDayPayload: {
          hasUnattendedGoals: false,
          activeGoalCount: activeGoals.length,
        },
        confidence: 0.95,
        feedbackAr: noGoalFeedbackAr,
        feedbackEn: noGoalFeedbackEn,
      };
      return { isCommand: true, command };
    }
  }

  // Check for explicit "Daily Briefing" command
  if (isDailyBriefingTrigger(input)) {
    const safeGoals = Array.isArray(availableGoals) ? availableGoals : [];
    const safeTasks = Array.isArray(availableTasks) ? availableTasks : [];
    const now = targetDate ? (typeof targetDate === 'string' ? new Date(targetDate) : targetDate) : new Date();

    const productivity = analyzeProductivity(safeTasks, now);
    const goalHealth = analyzeGoals(safeGoals, now);
    const focus = analyzeFocus([], now);
    const finance = analyzeFinance([], now);
    const knowledge = analyzeNotesAndKnowledge([], [], now);
    const alignment = analyzeDailyGoalAlignment(safeTasks, safeGoals, now);

    const briefing = generateDailyBriefing(
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

    const activeGoals = safeGoals.filter(
      (g) =>
        g &&
        typeof g.id === 'string' &&
        g.id.trim() !== '' &&
        (typeof g.progress !== 'number' || g.progress < 100)
    );

    const unattended = alignment.unattendedGoals;
    const selectedGoal = selectDeterministicUnattendedGoal(unattended);

    const feedbackAr = formatDailyBriefingFeedback(briefing, 'ar');
    const feedbackEn = formatDailyBriefingFeedback(briefing, 'en');

    if (selectedGoal) {
      const suggestedTaskTitle = `متابعة ومواصلة العمل على: ${selectedGoal.title}`;
      const command: NOVOCommand = {
        rawInput: input,
        action: 'daily_briefing',
        dailyBriefingPayload: {
          briefing,
          selectedGoalId: selectedGoal.id,
          selectedGoalTitle: selectedGoal.title,
          suggestedTaskTitle,
          hasUnattendedGoals: true,
          activeGoalCount: activeGoals.length,
        },
        confidence: 0.95,
        feedbackAr,
        feedbackEn,
      };
      return { isCommand: true, command };
    } else {
      const command: NOVOCommand = {
        rawInput: input,
        action: 'daily_briefing',
        dailyBriefingPayload: {
          briefing,
          hasUnattendedGoals: false,
          activeGoalCount: activeGoals.length,
        },
        confidence: 0.95,
        feedbackAr,
        feedbackEn,
      };
      return { isCommand: true, command };
    }
  }

  // Check for explicit "Next Action" command
  if (isNextActionTrigger(input)) {
    const today = getLocalDateString(0);
    const nextActionResult = determineNextAction(availableTasks || [], availableGoals || [], today);

    let feedbackAr = '';
    let feedbackEn = '';

    if (nextActionResult.type === 'existing_task') {
      const task = nextActionResult.selectedTask;
      const isOverdue = nextActionResult.tier === 1;
      const priorityLabelAr =
        task.priority === 'high' ? 'عالية' : task.priority === 'low' ? 'منخفضة' : 'متوسطة';
      const priorityLabelEn =
        task.priority === 'high' ? 'High' : task.priority === 'low' ? 'Low' : 'Medium';
      const statusLabelAr = isOverdue ? ' (متأخرة)' : '';
      const statusLabelEn = isOverdue ? ' (Overdue)' : '';

      feedbackAr = `خطوتك التالية الموصى بها:\n• ${task.title} [أولوية ${priorityLabelAr}${statusLabelAr}]`;
      feedbackEn = `Your recommended next action:\n• ${task.title} [Priority: ${priorityLabelEn}${statusLabelEn}]`;

      const command: NOVOCommand = {
        rawInput: input,
        action: 'next_action',
        nextActionPayload: {
          nextActionResult,
          selectedTaskId: task.id,
          selectedTaskTitle: task.title,
        },
        confidence: 0.95,
        feedbackAr,
        feedbackEn,
      };
      return { isCommand: true, command };
    } else if (nextActionResult.type === 'new_task_required') {
      const goal = nextActionResult.selectedGoal;
      const suggestedTaskTitle = `متابعة ومواصلة العمل على: ${goal.title}`;
      feedbackAr = `مقترح مواءمة الهدف: ${suggestedTaskTitle}`;
      feedbackEn = `Goal Alignment Proposal: ${suggestedTaskTitle}`;

      const command: NOVOCommand = {
        rawInput: input,
        action: 'next_action',
        nextActionPayload: {
          nextActionResult,
          selectedGoalId: goal.id,
          selectedGoalTitle: goal.title,
          suggestedTaskTitle,
        },
        confidence: 0.95,
        feedbackAr,
        feedbackEn,
      };
      return { isCommand: true, command };
    } else {
      feedbackAr = 'أحسنت! لا توجد مهام معلقة أو متأخرة لليوم، وجميع أهدافك النشطة تمت مواءمتها.';
      feedbackEn = 'All clear! You have no pending or overdue tasks today, and all your active goals are attended.';

      const command: NOVOCommand = {
        rawInput: input,
        action: 'next_action',
        nextActionPayload: {
          nextActionResult,
        },
        confidence: 0.95,
        feedbackAr,
        feedbackEn,
      };
      return { isCommand: true, command };
    }
  }

  // Check for explicit "Attention Radar" command
  if (isAttentionRadarTrigger(input)) {
    const today = getLocalDateString(0);
    const radarResult = evaluateAttentionRadar({
      tasks: availableTasks || [],
      goals: availableGoals || [],
      todayStr: today,
    });

    let feedbackAr = '';
    let feedbackEn = '';

    if (radarResult.type === 'overdue_task') {
      const priorityAr =
        radarResult.taskPriority === 'high' ? 'عالية' : radarResult.taskPriority === 'low' ? 'منخفضة' : 'متوسطة';
      const priorityEn =
        radarResult.taskPriority === 'high' ? 'High' : radarResult.taskPriority === 'low' ? 'Low' : 'Medium';

      feedbackAr = `تنبيه رادار الانتباه: لديك مهمة متأخرة تتطلب المعالجة العاجلة:\n• ${radarResult.selectedTaskTitle} [أولوية ${priorityAr} - متأخرة ${radarResult.daysOverdue} يوم]`;
      feedbackEn = `Attention Radar Alert: You have an overdue task requiring immediate action:\n• ${radarResult.selectedTaskTitle} [Priority: ${priorityEn} - Overdue by ${radarResult.daysOverdue} day(s)]`;

      const command: NOVOCommand = {
        rawInput: input,
        action: 'attention_radar',
        attentionRadarPayload: {
          radarResult,
          selectedTaskId: radarResult.selectedTaskId,
          selectedTaskTitle: radarResult.selectedTaskTitle,
        },
        confidence: 0.95,
        feedbackAr,
        feedbackEn,
      };
      return { isCommand: true, command };
    } else if (radarResult.type === 'stalled_goal') {
      const suggestedTaskTitle = `مراجعة وتنشيط العمل على: ${radarResult.selectedGoalTitle}`;
      feedbackAr = `تنبيه رادار الانتباه: رصد هدف راكد بدون نشاط منذ ${radarResult.daysInactive} يوماً:\n• مقترح تنشيط: ${suggestedTaskTitle}`;
      feedbackEn = `Attention Radar Alert: Stalled goal detected with no activity for ${radarResult.daysInactive} days:\n• Activation Proposal: ${suggestedTaskTitle}`;

      const command: NOVOCommand = {
        rawInput: input,
        action: 'attention_radar',
        attentionRadarPayload: {
          radarResult,
          selectedGoalId: radarResult.selectedGoalId,
          selectedGoalTitle: radarResult.selectedGoalTitle,
          suggestedTaskTitle,
        },
        confidence: 0.95,
        feedbackAr,
        feedbackEn,
      };
      return { isCommand: true, command };
    } else if (radarResult.type === 'urgent_today_task') {
      feedbackAr = `تنبيه رادار الانتباه: لديك مهمة ذات أولوية عالية مجدولة لليوم:\n• ${radarResult.selectedTaskTitle} [أولوية عالية]`;
      feedbackEn = `Attention Radar Alert: You have a high-priority task scheduled for today:\n• ${radarResult.selectedTaskTitle} [Priority: High]`;

      const command: NOVOCommand = {
        rawInput: input,
        action: 'attention_radar',
        attentionRadarPayload: {
          radarResult,
          selectedTaskId: radarResult.selectedTaskId,
          selectedTaskTitle: radarResult.selectedTaskTitle,
        },
        confidence: 0.95,
        feedbackAr,
        feedbackEn,
      };
      return { isCommand: true, command };
    } else if (radarResult.type === 'focus_deficit') {
      feedbackAr = `تنبيه رادار الانتباه: لديك ${radarResult.pendingTasksTodayCount} مهام معلقة اليوم مع عجز في التركيز العميق (${radarResult.todayFocusMinutes} دقيقة تركيز). يوصى ببدء جلسة بومودورو.`;
      feedbackEn = `Attention Radar Alert: You have ${radarResult.pendingTasksTodayCount} pending tasks today with a deep focus deficit (${radarResult.todayFocusMinutes} focus minutes). A Pomodoro focus session is recommended.`;

      const command: NOVOCommand = {
        rawInput: input,
        action: 'attention_radar',
        attentionRadarPayload: {
          radarResult,
        },
        confidence: 0.95,
        feedbackAr,
        feedbackEn,
      };
      return { isCommand: true, command };
    } else {
      feedbackAr = 'رادار الانتباه: مساحة عملك في حالة توازن تام! لا توجد مهام متأخرة، ولا أهداف راكدة، وخطتك لليوم تسير بانتظام.';
      feedbackEn = 'Attention Radar: Workspace equilibrium! No overdue tasks, no stalled goals, and your plan for today is on track.';

      const command: NOVOCommand = {
        rawInput: input,
        action: 'attention_radar',
        attentionRadarPayload: {
          radarResult,
        },
        confidence: 0.95,
        feedbackAr,
        feedbackEn,
      };
      return { isCommand: true, command };
    }
  }

  // Check for explicit "Single Goal Pacing" command
  const singleGoalQuery = extractSingleGoalPacingQuery(input);
  if (singleGoalQuery && singleGoalQuery.isSingleGoal) {
    const rawQuery = singleGoalQuery.queryTitle;
    const safeGoals = Array.isArray(availableGoals) ? availableGoals : [];
    const activeGoals = safeGoals.filter(
      (g) =>
        g &&
        typeof g.id === 'string' &&
        g.id.trim() !== '' &&
        (typeof g.progress !== 'number' || g.progress < 100)
    );

    const resolution = resolveSingleGoalDeterministically(rawQuery, activeGoals);

    if (resolution.status === 'match' && resolution.goal) {
      const now = targetDate ? (typeof targetDate === 'string' ? new Date(targetDate) : targetDate) : new Date();
      const analysis = calculateGoalPacing(resolution.goal, availableTasks || [], [], now);
      const feedbackAr = formatGoalPacingFeedback([analysis], 'single', 'ar');
      const feedbackEn = formatGoalPacingFeedback([analysis], 'single', 'en');

      const command: NOVOCommand = {
        rawInput: input,
        action: 'goal_pacing',
        goalPacingPayload: {
          mode: 'single',
          targetGoalQuery: rawQuery,
          matchedGoalId: resolution.goal.id,
          matchedGoalTitle: resolution.goal.title,
          status: 'success',
          analyses: [analysis],
        },
        confidence: 0.95,
        feedbackAr,
        feedbackEn,
      };
      return { isCommand: true, command };
    } else if (resolution.status === 'ambiguous') {
      const matchedTitles = (resolution.matches || []).map((m) => m.title);
      const feedbackAr = `اسم الهدف "${rawQuery}" يطابق أكثر من هدف واحد (${matchedTitles.join('، ')}). يرجى تحديد اسم الهدف بدقة أكبر.`;
      const feedbackEn = `The goal query "${rawQuery}" matches multiple goals (${matchedTitles.join(', ')}). Please specify the goal title more precisely.`;

      const command: NOVOCommand = {
        rawInput: input,
        action: 'goal_pacing',
        goalPacingPayload: {
          mode: 'single',
          targetGoalQuery: rawQuery,
          status: 'ambiguous',
          ambiguousMatches: matchedTitles,
          analyses: [],
        },
        confidence: 0.95,
        feedbackAr,
        feedbackEn,
      };
      return { isCommand: true, command };
    } else {
      // resolution.status === 'not_found' -> FAIL CLOSED. Deterministic clarification, no portfolio fallback.
      const feedbackAr = `لم يتم العثور على هدف نشط باسم أو محتوى يطابق "${rawQuery}". يرجى التحقق من اسم الهدف.`;
      const feedbackEn = `No active goal found matching "${rawQuery}". Please check the goal title.`;

      const command: NOVOCommand = {
        rawInput: input,
        action: 'goal_pacing',
        goalPacingPayload: {
          mode: 'single',
          targetGoalQuery: rawQuery,
          status: 'not_found',
          analyses: [],
        },
        confidence: 0.95,
        feedbackAr,
        feedbackEn,
      };
      return { isCommand: true, command };
    }
  }

  // Check for explicit "Portfolio Goal Pacing" command
  if (isPortfolioGoalPacingTrigger(input)) {
    const safeGoals = Array.isArray(availableGoals) ? availableGoals : [];
    const activeGoals = safeGoals.filter(
      (g) =>
        g &&
        typeof g.id === 'string' &&
        g.id.trim() !== '' &&
        (typeof g.progress !== 'number' || g.progress < 100)
    );

    if (activeGoals.length === 0) {
      const feedbackAr = 'ليس لديك أي أهداف نشطة حالياً لتحليل وتيرتها.';
      const feedbackEn = 'You currently have no active goals to analyze pacing for.';

      const command: NOVOCommand = {
        rawInput: input,
        action: 'goal_pacing',
        goalPacingPayload: {
          mode: 'portfolio',
          status: 'no_goals',
          analyses: [],
        },
        confidence: 0.95,
        feedbackAr,
        feedbackEn,
      };
      return { isCommand: true, command };
    }

    const now = targetDate ? (typeof targetDate === 'string' ? new Date(targetDate) : targetDate) : new Date();
    const analyses = analyzeAllGoalsPacing(activeGoals, availableTasks || [], [], now);
    const feedbackAr = formatGoalPacingFeedback(analyses, 'portfolio', 'ar');
    const feedbackEn = formatGoalPacingFeedback(analyses, 'portfolio', 'en');

    const command: NOVOCommand = {
      rawInput: input,
      action: 'goal_pacing',
      goalPacingPayload: {
        mode: 'portfolio',
        status: 'success',
        analyses,
      },
      confidence: 0.95,
      feedbackAr,
      feedbackEn,
    };
    return { isCommand: true, command };
  }

  // Exact or high-confidence keyword match for navigation
  for (const pattern of NAVIGATION_PATTERNS) {
    for (const keyword of pattern.keywords) {
      const normKeyword = normalizeText(keyword);
      if (normalized === normKeyword || normalized === `من فضلك ${normKeyword}` || normalized === `please ${normKeyword}`) {
        const command: NOVOCommand = {
          rawInput: input,
          action: 'navigate',
          targetRoute: pattern.route,
          confidence: 0.95,
          feedbackAr: pattern.titleAr,
          feedbackEn: pattern.titleEn,
        };
        return { isCommand: true, command };
      }
    }
  }

  // Check for explicit goal progress update command
  const goalProgressPayload = parseGoalProgressCommand(input, availableGoals);
  if (goalProgressPayload) {
    const command: NOVOCommand = {
      rawInput: input,
      action: 'update_goal_progress',
      goalProgressPayload,
      confidence: 0.95,
      feedbackAr: `مقترح تحديث تقدم الهدف: ${goalProgressPayload.goalTitle} من ${goalProgressPayload.currentProgress}% إلى ${goalProgressPayload.newProgress}%`,
      feedbackEn: `Goal Progress Proposal: ${goalProgressPayload.goalTitle} from ${goalProgressPayload.currentProgress}% to ${goalProgressPayload.newProgress}%`,
    };
    return { isCommand: true, command };
  }

  // Check for explicit task creation command
  const taskPayload = parseTaskCreationCommand(input, availableGoals);
  if (taskPayload) {
    const priorityLabelAr =
      taskPayload.priority === 'high'
        ? 'أولوية قصوى'
        : taskPayload.priority === 'low'
        ? 'أولوية اعتيادية'
        : 'أولوية متوسطة';
    const priorityLabelEn =
      taskPayload.priority === 'high'
        ? 'High Priority'
        : taskPayload.priority === 'low'
        ? 'Low Priority'
        : 'Medium Priority';

    const goalSuffixAr = taskPayload.goalTitle ? ` • الهدف: ${taskPayload.goalTitle}` : '';
    const goalSuffixEn = taskPayload.goalTitle ? ` • Goal: ${taskPayload.goalTitle}` : '';

    const command: NOVOCommand = {
      rawInput: input,
      action: 'create_task',
      taskPayload,
      confidence: 0.95,
      feedbackAr: `مقترح مهمة: ${taskPayload.title} (${priorityLabelAr} • ${taskPayload.date}${goalSuffixAr})`,
      feedbackEn: `Task Proposal: ${taskPayload.title} (${priorityLabelEn} • ${taskPayload.date}${goalSuffixEn})`,
    };
    return { isCommand: true, command };
  }

  // Check for explicit goal creation command
  const goalPayload = parseGoalCreationCommand(input);
  if (goalPayload) {
    const command: NOVOCommand = {
      rawInput: input,
      action: 'create_goal',
      goalPayload,
      confidence: 0.95,
      feedbackAr: `مقترح هدف جديد: ${goalPayload.title}`,
      feedbackEn: `Goal Proposal: ${goalPayload.title}`,
    };
    return { isCommand: true, command };
  }

  // Uncertain recognition -> do nothing
  return { isCommand: false };
}

/**
 * Parses explicit goal creation commands deterministically.
 */
export function parseGoalCreationCommand(
  input: string
): CreateGoalCommandPayload | null {
  if (!input || typeof input !== 'string') return null;

  if (isConversational(input)) {
    return null;
  }

  const rawTrimmed = input.trim();
  const normalized = normalizeText(rawTrimmed);

  let matchedPrefix = '';

  for (const prefix of ARABIC_GOAL_PREFIXES) {
    if (normalized === prefix || normalized.startsWith(prefix + ' ') || normalized.startsWith(prefix + ':')) {
      matchedPrefix = prefix;
      break;
    }
  }

  if (!matchedPrefix) {
    for (const prefix of ENGLISH_GOAL_PREFIXES) {
      if (normalized === prefix || normalized.startsWith(prefix + ' ') || normalized.startsWith(prefix + ':')) {
        matchedPrefix = prefix;
        break;
      }
    }
  }

  if (!matchedPrefix) {
    return null;
  }

  const prefixWordsCount = matchedPrefix.trim().split(/\s+/).length;
  const rawWords = rawTrimmed.split(/\s+/);
  let rawBody = rawWords.slice(prefixWordsCount).join(' ').replace(/^[:\-–—\s]+/, '').trim();

  // Strip connector words like "to", "ان", "بأن", "بان"
  rawBody = rawBody.replace(/^(to\s+|ان\s+|بأن\s+|بانه\s+|بان\s+)/i, '').trim();

  let title = rawBody
    .replace(/^[:\-–—\s]+/, '')
    .replace(/[:\-–—.,!?;:\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!title || title.length < 2) {
    return null;
  }

  return {
    title,
    description: '',
    initialProgress: 0,
  };
}
