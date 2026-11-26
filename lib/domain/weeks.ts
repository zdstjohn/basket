export type Day = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

const DAYS: Day[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function daysOfWeek(startDay: Day): Day[] {
  const start = DAYS.indexOf(startDay);
  return Array.from({ length: 7 }, (_, i) => DAYS[(start + i) % 7]);
}

/** YYYY-MM-DD of the most recent startDay on or before the local date of `now`. */
export function weekStartFor(now: Date, startDay: Day, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  const local = Date.UTC(get('year'), get('month') - 1, get('day'));
  const dow = new Date(local).getUTCDay();
  const back = (dow - DAYS.indexOf(startDay) + 7) % 7;
  return new Date(local - back * 86_400_000).toISOString().slice(0, 10);
}
