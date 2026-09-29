import { daysBetween, isoWeek } from "./dates";

export type StreakState = {
  current: number;
  longest: number;
  lastActiveDate: string | null;
  freezesLeft: number;
  freezeWeek: string | null;
};

export const FREEZES_PER_WEEK = 1;

export function emptyStreak(): StreakState {
  return { current: 0, longest: 0, lastActiveDate: null, freezesLeft: FREEZES_PER_WEEK, freezeWeek: null };
}

/** Restores the weekly freeze when a new ISO week starts. */
function refreshFreezes(s: StreakState, today: string): StreakState {
  const week = isoWeek(today);
  return s.freezeWeek === week ? s : { ...s, freezesLeft: FREEZES_PER_WEEK, freezeWeek: week };
}

/**
 * Applies a qualifying activity on `today`. A single missed day is covered by
 * a freeze if one is left this week; a longer gap restarts the streak.
 */
export function applyActivity(prev: StreakState, today: string): StreakState {
  const s = refreshFreezes(prev, today);
  if (s.lastActiveDate === today) return s;
  let current: number;
  let freezesLeft = s.freezesLeft;
  const gap = s.lastActiveDate ? daysBetween(s.lastActiveDate, today) : Infinity;
  if (gap === 1) current = s.current + 1;
  else if (gap === 2 && freezesLeft > 0 && s.current > 0) {
    current = s.current + 1;
    freezesLeft -= 1;
  } else current = 1;
  return { ...s, current, freezesLeft, lastActiveDate: today, longest: Math.max(s.longest, current) };
}

/**
 * Nightly check run on `today` (before any activity today). If yesterday was
 * missed, spend a freeze to bridge it or reset the streak.
 */
export function nightlyCheck(prev: StreakState, today: string): StreakState {
  const s = refreshFreezes(prev, today);
  if (!s.lastActiveDate || s.current === 0) return s;
  const gap = daysBetween(s.lastActiveDate, today);
  if (gap <= 1) return s;
  if (gap === 2 && s.freezesLeft > 0) {
    const yesterday = new Date(`${today}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return { ...s, freezesLeft: s.freezesLeft - 1, lastActiveDate: yesterday.toISOString().slice(0, 10) };
  }
  return { ...s, current: 0 };
}
