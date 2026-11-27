import type { Day } from '@/lib/domain/weeks';

const NAMES: Record<Day, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};

export const DAY_IDS = Object.keys(NAMES) as Day[];

export const isDay = (v: unknown): v is Day => typeof v === 'string' && (DAY_IDS as string[]).includes(v);

export const dayName = (d: Day): string => NAMES[d];
export const dayShort = (d: Day): string => NAMES[d].slice(0, 3);

const utc = (ymd: string): Date => new Date(`${ymd}T00:00:00Z`);
const iso = (d: Date): string => d.toISOString().slice(0, 10);
export const addDays = (ymd: string, n: number): string => iso(new Date(utc(ymd).getTime() + n * 86_400_000));

const monthDay = (d: Date): string =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d);

/** "Nov 29 – Dec 5", or "Nov 22 – 28" inside one month. */
export function formatWeekRange(weekStart: string): string {
  const from = utc(weekStart);
  const to = utc(addDays(weekStart, 6));
  const sameMonth = from.getUTCMonth() === to.getUTCMonth();
  return `${monthDay(from)} – ${sameMonth ? to.getUTCDate() : monthDay(to)}`;
}

export const previousWeekStart = (weekStart: string): string => addDays(weekStart, -7);

export function formatMinutes(total: number): string {
  const m = Math.round(total);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} hr` : `${h} hr ${rest} min`;
}
