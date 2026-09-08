import { FocusSession } from '../../types/data';
import { FocusSummary } from './intelligenceTypes';
import { isDateToday, isWithinDays } from './dateUtils';

/**
 * Deterministic Focus Analysis Engine
 * Quantifies deep work investment, daily streaks, and weekly focus consistency.
 */
export function analyzeFocus(sessions: FocusSession[], now: Date = new Date()): FocusSummary {
  const totalSessions = sessions.length;
  const totalFocusedMinutes = sessions.reduce((acc, s) => acc + (s.duration || 0), 0);

  const todaySessionsList = sessions.filter((s) => isDateToday(s.completedAt, now));
  const todaySessions = todaySessionsList.length;
  const todayFocusMinutes = todaySessionsList.reduce((acc, s) => acc + (s.duration || 0), 0);

  const weeklySessions = sessions.filter((s) => isWithinDays(s.completedAt, 7, now));
  const weeklyFocusMinutes = weeklySessions.reduce((acc, s) => acc + (s.duration || 0), 0);

  const averageSessionDuration =
    totalSessions > 0 ? Math.round(totalFocusedMinutes / totalSessions) : 0;

  const recentActivityCount = sessions.filter((s) => isWithinDays(s.completedAt, 3, now)).length;

  return {
    totalSessions,
    totalFocusedMinutes,
    todaySessions,
    todayFocusMinutes,
    weeklyFocusMinutes,
    averageSessionDuration,
    recentActivityCount,
  };
}
