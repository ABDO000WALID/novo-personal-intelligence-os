/**
 * Deterministic Date Utilities for NOVO Intelligence Engines
 */

export function normalizeDateString(
  d?: string | Date | null
): string {
  if (!d) return '';

  if (typeof d === 'string') {
    const trimmed = d.trim();
    if (!trimmed) return '';
    return trimmed.includes('T') ? trimmed.split('T')[0] : trimmed;
  }

  if (d instanceof Date && !isNaN(d.getTime())) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return '';
}

export function getTodayString(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isDateToday(dateStr: string, now: Date = new Date()): boolean {
  if (!dateStr) return false;
  // Handle YYYY-MM-DD or full ISO string
  const targetDateStr = normalizeDateString(dateStr);
  return targetDateStr === getTodayString(now);
}

export function isWithinDays(dateStr: string, days: number, now: Date = new Date()): boolean {
  if (!dateStr) return false;
  try {
    const target = new Date(dateStr).getTime();
    const nowTime = now.getTime();
    const diffMs = nowTime - target;
    const maxMs = days * 24 * 60 * 60 * 1000;
    return diffMs >= 0 && diffMs <= maxMs;
  } catch {
    return false;
  }
}

export function isDateBeforeToday(dateStr: string, now: Date = new Date()): boolean {
  if (!dateStr) return false;
  const targetDateStr = normalizeDateString(dateStr);
  return targetDateStr < getTodayString(now);
}

export function getStartOfWeek(now: Date = new Date()): Date {
  const d = new Date(now);
  const day = d.getDay(); // 0 is Sunday
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getEndOfWeek(now: Date = new Date()): Date {
  const start = getStartOfWeek(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

