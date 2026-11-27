import { MATCH_MAX_AGE_MS, type Choice, type MatchRow } from './matches';

/** A search that is missing, a day old, or made with other words than the household's chosen ones. */
export const matchDue = (row: MatchRow | undefined, choice: Choice | undefined, now = Date.now()): boolean =>
  !row ||
  !(now - Date.parse(row.fetchedAt) < MATCH_MAX_AGE_MS) ||
  (!!choice?.searchTerm && row.term !== choice.searchTerm);

const MINUTE = 60_000;
/** After a request that never got an answer: wait this long before the first, second and later retries. */
export const BACKOFF_MS = [5 * MINUTE, 15 * MINUTE, 60 * MINUTE];

/** When a food may be asked about again, and how many requests in a row never got an answer. */
export interface Ask {
  retryAt: number;
  failures: number;
}
export type Asked = Map<string, Ask>;

/** Only a thrown fetch or a gateway/timeout answer is worth asking again soon; the rest waits for the day. */
export const retryableStatus = (status: number): boolean => status === 502 || status === 503 || status === 504;

/**
 * The foods to look up now: due, and past their retry time. A new request holds the food for a day;
 * `failed` shortens that to the backoff step, `answered` sets it by the row that came back.
 */
export function foodsToAsk(
  foods: string[],
  key: (food: string) => string,
  have: ReadonlyMap<string, MatchRow>,
  choice: ReadonlyMap<string, Choice>,
  asked: Asked,
  now = Date.now(),
): string[] {
  return [
    ...new Set(
      foods.filter((f) => {
        const ask = asked.get(key(f));
        return (!ask || now >= ask.retryAt) && matchDue(have.get(f), choice.get(f), now);
      }),
    ),
  ];
}

/**
 * May a search the household asked for (new words, back to Basket's pick) go out now? It skips the day's
 * hold, which is only there to stop the list asking again on its own, but not the backoff after a request
 * that never got an answer: that food waits its 5, 15 or 60 minutes.
 */
export function askableNow(asked: Asked, k: string, now = Date.now()): boolean {
  const ask = asked.get(k);
  return !ask || ask.failures === 0 || now >= ask.retryAt;
}

/** A request is going out: hold the food for a day (failures so far are kept until an answer comes). */
export function began(asked: Asked, k: string, now = Date.now()): void {
  asked.set(k, { retryAt: now + MATCH_MAX_AGE_MS, failures: asked.get(k)?.failures ?? 0 });
}

/** The request never got an answer: retry after 5 minutes, then 15, then every hour. */
export function failed(asked: Asked, k: string, now = Date.now()): void {
  const failures = (asked.get(k)?.failures ?? 0) + 1;
  asked.set(k, { retryAt: now + BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1], failures });
}

/**
 * The server answered. A fresh row is asked about again when it turns a day old (by its own time, not the
 * time of this request); no row, or an old one, waits a day from now. Backoff starts over.
 */
export function answered(asked: Asked, k: string, row: MatchRow | undefined, now = Date.now()): void {
  const own = row ? Date.parse(row.fetchedAt) + MATCH_MAX_AGE_MS : NaN;
  asked.set(k, { retryAt: own > now ? own : now + MATCH_MAX_AGE_MS, failures: 0 });
}

/**
 * The foods whose lookup went wrong and has not been put right: each food stays marked until it has a fresh
 * search, so a later success for other foods does not clear the banner for these.
 */
export function latchBad(
  prev: ReadonlySet<string>,
  wanted: string[],
  back: ReadonlyMap<string, MatchRow>,
  choice: ReadonlyMap<string, Choice>,
  now = Date.now(),
): Set<string> {
  const next = new Set(prev);
  for (const f of wanted) {
    if (!matchDue(back.get(f), choice.get(f), now)) next.delete(f);
    else next.add(f);
  }
  return next;
}

/**
 * Prices may be old: some food to buy is due a lookup, and either its lookup went wrong (`bad`) or an old
 * saved search has passed its day (it shows until the new one lands).
 */
export function pricesStale(
  foods: string[],
  have: ReadonlyMap<string, MatchRow>,
  choice: ReadonlyMap<string, Choice>,
  bad: ReadonlySet<string>,
  now = Date.now(),
): boolean {
  return foods.some((f) => matchDue(have.get(f), choice.get(f), now) && (bad.has(f) || have.has(f)));
}
