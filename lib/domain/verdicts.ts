export type Vote = 'up' | 'down' | 'skip';
export interface Verdict {
  mealId: string;
  eatenOn: string;
  status: 'answered' | 'skipped';
  votes: Record<string, Vote>;
}
export interface Dinner {
  mealId: string;
  date: string;
}

/** How many days after a dinner the card keeps asking. */
export const ASK_DAYS = 3;

const DAY_MS = 86_400_000;

export function everyoneLiked(people: { id: string }[]): Record<string, Vote> {
  return Object.fromEntries(people.map((p) => [p.id, 'up' as Vote]));
}

export function summarize(v: Verdict): { liked: number; tried: number; didntTry: number } {
  let liked = 0;
  let down = 0;
  let didntTry = 0;
  for (const vote of Object.values(v.votes)) {
    if (vote === 'up') liked++;
    else if (vote === 'down') down++;
    else didntTry++;
  }
  return { liked, tried: liked + down, didntTry };
}

export function verdictWords(v: Verdict): string | null {
  if (v.status === 'skipped') return null;
  const { liked, tried, didntTry } = summarize(v);
  if (tried === 0) return null;
  const head = liked === tried ? 'Everyone liked it' : `${liked} of ${tried} liked it`;
  return didntTry > 0 ? `${head} · ${didntTry} didn’t try` : head;
}

export function savedLine(v: Verdict, mealName: string): string {
  const words = verdictWords(v);
  if (words === 'Everyone liked it') return `Everyone liked ${mealName}.`;
  return `${mealName}: ${words ?? ''}.`;
}

const counts = (v: Verdict): boolean => v.status === 'answered' && summarize(v).tried > 0;

/** Newest answer for the meal where somebody tried it (ties: first given). */
export function latestAnswer(verdicts: Verdict[], mealId: string): Verdict | null {
  let best: Verdict | null = null;
  for (const v of verdicts) {
    if (v.mealId !== mealId || !counts(v)) continue;
    if (!best || v.eatenOn > best.eatenOn) best = v;
  }
  return best;
}

/** Latest dinner date of the meal strictly before today. */
export function lastHad(dinners: Dinner[], mealId: string, today: string): string | null {
  let best: string | null = null;
  for (const dn of dinners) {
    if (dn.mealId === mealId && dn.date < today && (best === null || dn.date > best)) best = dn.date;
  }
  return best;
}

const monthDay = (ymd: string): string =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${ymd}T00:00:00Z`),
  );

export function mealLine(a: {
  verdict: Verdict | null;
  lastHad: string | null;
  timesPlanned: number;
}): { strong: string; rest: string | null } {
  const rest = a.lastHad ? `last had ${monthDay(a.lastHad)}` : null;
  const words = a.verdict ? verdictWords(a.verdict) : null;
  if (words) return { strong: words, rest };
  const times = a.lastHad ? Math.max(a.timesPlanned, 1) : a.timesPlanned;
  if (times === 0) return { strong: 'Not made yet', rest };
  return { strong: times === 1 ? 'Made 1 time' : `Made ${times} times`, rest };
}

export function searchLine(a: { verdict: Verdict | null; lastHad: string | null }): string {
  const words = a.verdict ? verdictWords(a.verdict) : null;
  const bits = [words, a.lastHad ? `last had ${monthDay(a.lastHad)}` : null].filter(Boolean);
  return bits.length ? `You’ve made this. ${bits.join(' · ')}` : 'You’ve made this.';
}

/** Retired: the newest two answers (where somebody tried it) were each disliked by most. */
export function isRetired(verdicts: Verdict[], mealId: string): boolean {
  const newest = verdicts
    .filter((v) => v.mealId === mealId && counts(v))
    .sort((x, y) => (x.eatenOn < y.eatenOn ? 1 : x.eatenOn > y.eatenOn ? -1 : 0))
    .slice(0, 2);
  if (newest.length < 2) return false;
  return newest.every((v) => {
    const { liked, tried } = summarize(v);
    return liked * 2 < tried;
  });
}

const addDays = (ymd: string, n: number): string =>
  new Date(new Date(`${ymd}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);

/** Latest dinner in [today - ASK_DAYS, today) with no verdict row of either status (ties: first given). */
export function dinnerToAsk(dinners: Dinner[], verdicts: Verdict[], today: string): Dinner | null {
  const from = addDays(today, -ASK_DAYS);
  const done = new Set(verdicts.map((v) => `${v.mealId}|${v.eatenOn}`));
  let best: Dinner | null = null;
  for (const dn of dinners) {
    if (dn.date < from || dn.date >= today || done.has(`${dn.mealId}|${dn.date}`)) continue;
    if (!best || dn.date > best.date) best = dn;
  }
  return best;
}

/** Stable: liked first, then never answered, then the rest, retired last. */
export function orderFavorites<T extends { id: string }>(rows: T[], verdicts: Verdict[]): T[] {
  const rank = (r: T): number => {
    if (isRetired(verdicts, r.id)) return 3;
    const a = latestAnswer(verdicts, r.id);
    if (!a) return 1;
    const { liked, tried } = summarize(a);
    return liked * 2 >= tried ? 0 : 2;
  };
  return rows
    .map((r, i) => ({ r, i, k: rank(r) }))
    .sort((x, y) => x.k - y.k || x.i - y.i)
    .map((x) => x.r);
}
