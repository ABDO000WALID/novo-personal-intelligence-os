import { RouteId } from '../../types/navigation';
import { CommandParseResult, NOVOCommand } from './commandTypes';

/**
 * Normalizes Arabic string for robust matching:
 * Removes diacritics, unifies alef (أ إ آ -> ا), unifies taa marbuta/ha (ة -> ه), yaa (ى -> ي).
 */
function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, '') // remove tashkeel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[.,!?;:]/g, '')
    .replace(/\s+/g, ' ');
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
      'التخطيط',
      'المهام',
      'مهامي',
      'جدول اليوم',
      'افتح التخطيط',
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
export function parseCommand(input: string): CommandParseResult {
  if (!input || typeof input !== 'string') {
    return { isCommand: false };
  }

  const normalized = normalizeText(input);
  if (!normalized) {
    return { isCommand: false };
  }

  // Exact or high-confidence keyword match
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

  // Uncertain recognition -> do nothing
  return { isCommand: false };
}
