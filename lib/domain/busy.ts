import type { Day } from '@/lib/domain/weeks';
import { DAY_IDS, dayName, dayShort, isDay } from '@/lib/week/format';

export const QUICK_MINUTES = 30;

export type BusyChoice = 'no' | 'week' | 'every';

/** Known days only, once each, in sun…sat order. Anything that is not an array gives []. */
export function cleanDays(v: unknown): Day[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set(v.filter(isDay));
  return DAY_IDS.filter((d) => seen.has(d));
}

/** Both lists together, cleaned. */
export function busyDays(every: unknown, thisWeek: unknown): Day[] {
  return cleanDays([...cleanDays(every), ...cleanDays(thisWeek)]);
}

/** 'every' wins when a day is in both. */
export function busyChoice(day: Day, every: Day[], thisWeek: Day[]): BusyChoice {
  if (every.includes(day)) return 'every';
  if (thisWeek.includes(day)) return 'week';
  return 'no';
}

export function withChoice(every: Day[], thisWeek: Day[], day: Day, choice: BusyChoice): { every: Day[]; thisWeek: Day[] } {
  const without = (l: Day[]): Day[] => l.filter((d) => d !== day);
  return {
    every: cleanDays(choice === 'every' ? [...every, day] : without(every)),
    thisWeek: cleanDays(choice === 'week' ? [...thisWeek, day] : without(thisWeek)),
  };
}

function join(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function busyLine(days: Day[], weekDays: Day[]): string {
  const busy = weekDays.filter((d) => days.includes(d));
  if (busy.length === 0) return 'No busy nights this week';
  if (DAY_IDS.every((d) => busy.includes(d))) return 'Busy nights: every night';
  return `Busy nights: ${join(busy.map(dayShort))}`;
}

export function busySummary(every: Day[], thisWeek: Day[], weekDays: Day[]): string {
  const e = weekDays.filter((d) => every.includes(d));
  const w = weekDays.filter((d) => thisWeek.includes(d));
  const everyPart = e.length ? `Every ${join(e.map(dayName))}` : '';
  const weekPart = w.length ? `this ${join(w.map(dayName))}` : '';
  if (everyPart && weekPart) return `${everyPart}, and ${weekPart}.`;
  if (everyPart) return `${everyPart}.`;
  if (weekPart) return `This ${join(w.map(dayName))}.`;
  return 'No busy nights.';
}

export type QuickReason = 'minutes' | 'slow_cooker' | 'make_ahead';

/** `method` is a plain string so this file does not wait for phase (a)'s CookMethod type. */
export function quickReason(f: { totalMinutes: number | null; method: string | null; makeAhead: boolean }): QuickReason | null {
  if (f.totalMinutes !== null && f.totalMinutes >= 1 && f.totalMinutes <= QUICK_MINUTES) return 'minutes';
  if (f.method === 'slow_cooker') return 'slow_cooker';
  if (f.makeAhead) return 'make_ahead';
  return null;
}

export function titleSaysMakeAhead(title: string): boolean {
  const t = title.toLowerCase().replace(/-/g, ' ');
  return ['make ahead', 'overnight', 'freezer'].some((w) => t.includes(w));
}

export const QUICK_LABEL: Record<QuickReason, string | null> = {
  minutes: null,
  slow_cooker: 'Slow cooker',
  make_ahead: 'Make ahead',
};
