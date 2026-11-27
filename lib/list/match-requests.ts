import { MATCH_MAX_AGE_MS, type Choice, type MatchRow } from './matches';

/** A search that is missing, a day old, or made with other words than the household's chosen ones. */
export const matchDue = (row: MatchRow | undefined, choice: Choice | undefined, now = Date.now()): boolean =>
  !row ||
  !(now - Date.parse(row.fetchedAt) < MATCH_MAX_AGE_MS) ||
  (!!choice?.searchTerm && row.term !== choice.searchTerm);

/** When each food was last asked about (ms), by `store|food`. */
export type Asked = Map<string, number>;

/**
 * The foods to look up now: due, and not asked about within the last day. A food whose request never
 * reached the server is forgotten (see `forget`), so it is asked again at once.
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
        const at = asked.get(key(f));
        return (at === undefined || !(now - at < MATCH_MAX_AGE_MS)) && matchDue(have.get(f), choice.get(f), now);
      }),
    ),
  ];
}

/** Forgets that these foods were asked about, so the next look asks again. */
export function forget(asked: Asked, keys: string[]): void {
  for (const k of keys) asked.delete(k);
}

/**
 * Prices may be old: some food to buy is due a lookup, and either a lookup came
 * back limited or failed, or an old saved search has passed its day (it shows until the new one lands).
 */
export function pricesStale(
  foods: string[],
  have: ReadonlyMap<string, MatchRow>,
  choice: ReadonlyMap<string, Choice>,
  lookupBad: boolean,
  now = Date.now(),
): boolean {
  return foods.some((f) => matchDue(have.get(f), choice.get(f), now) && (lookupBad || have.has(f)));
}
