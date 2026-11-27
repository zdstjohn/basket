import type { Day } from '@/lib/domain/weeks';

/** A structural type, so the domain never imports lib/db; a WeekMeal row fits it. */
export interface Night {
  id: string;
  day: string;
  slot: string;
  meal_id: string;
  servings_override: number | null;
  leftover_of?: string | null;
}

/** How many nights after the cooking night a leftovers night may sit. */
export const KEEP_DAYS = 4;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export const isLeftover = (n: Night): boolean => !!n.leftover_of;

/** The rows that buy food. The one place that decides it. */
export function cookedNights<T extends Night>(rows: T[]): T[] {
  return rows.filter((r) => !isLeftover(r));
}

export function leftoverFor<T extends Night>(rows: T[], cookId: string): T | null {
  return rows.find((r) => r.leftover_of === cookId) ?? null;
}

/** null when the cooking row is not in `rows`. */
export function cookNightOf<T extends Night>(rows: T[], leftover: T): T | null {
  if (!leftover.leftover_of) return null;
  return rows.find((r) => r.id === leftover.leftover_of) ?? null;
}

export function doubleServings(base: number): number {
  return round1(2 * base);
}

export type CookState =
  | { kind: 'usual' }
  | { kind: 'double'; night: Day | null }
  | { kind: 'extra'; servings: number };

export function cookState(row: Night, rows: Night[], base: number): CookState {
  const left = leftoverFor(rows, row.id);
  if (left) return { kind: 'double', night: left.day as Day };
  const o = row.servings_override;
  if (o === null || o <= base + 0.05) return { kind: 'usual' };
  if (Math.abs(o - 2 * base) <= 0.06) return { kind: 'double', night: null };
  return { kind: 'extra', servings: round1(o - base) };
}

export interface NightChoice {
  day: Day;
  daysLater: number;
  taken: 'dinner' | 'leftovers' | null;
  takenMealId: string | null;
  busy: boolean;
  current: boolean;
}

export function nightChoices(o: { cookDay: Day; slot: string; weekDays: Day[]; rows: Night[]; busy: Day[]; cookId: string }): NightChoice[] {
  const from = o.weekDays.indexOf(o.cookDay);
  if (from < 0) return [];
  const out: NightChoice[] = [];
  for (let i = from + 1; i < o.weekDays.length && i - from <= KEEP_DAYS; i++) {
    const day = o.weekDays[i];
    const here = o.rows.filter((r) => r.day === day && r.slot === o.slot);
    const current = here.some((r) => r.leftover_of === o.cookId);
    const others = here.filter((r) => r.leftover_of !== o.cookId);
    const holder = others.find((r) => !isLeftover(r)) ?? others[0] ?? null;
    out.push({
      day,
      daysLater: i - from,
      taken: holder ? (isLeftover(holder) ? 'leftovers' : 'dinner') : null,
      takenMealId: holder ? holder.meal_id : null,
      busy: o.busy.includes(day),
      current,
    });
  }
  return out;
}

/** The current night; else the first free busy night; else the first free night; else null ("No set night"). */
export function defaultChoice(choices: NightChoice[]): Day | null {
  const current = choices.find((c) => c.current);
  if (current) return current.day;
  const free = choices.filter((c) => c.taken === null);
  return (free.find((c) => c.busy) ?? free[0])?.day ?? null;
}

export function laterWords(daysLater: number): string {
  return daysLater === 1 ? 'The next night' : `${daysLater} days later`;
}
