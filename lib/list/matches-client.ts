import type { MatchRow } from './matches';

const BATCH = 60;

/**
 * Asks the server for the Fred Meyer products of foods, 60 at a time. The server keeps what it finds for
 * 24 hours. `failed` is set when the request didn't go through (offline, no store, not set up) or the server couldn't
 * search some food; `limited` when the day's lookups ran out. Both mean some prices may be out of date.
 */
export async function requestMatches(canonicals: string[]): Promise<{ matches: MatchRow[]; limited: boolean; failed: boolean; unreached: boolean }> {
  const names = [...new Set(canonicals)];
  const matches: MatchRow[] = [];
  let limited = false;
  let failed = false;
  try {
    for (let i = 0; i < names.length; i += BATCH) {
      const res = await fetch('/api/kroger/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicals: names.slice(i, i + BATCH) }),
      });
      if (!res.ok) return { matches, limited, failed: true, unreached: true };
      const body = (await res.json()) as { matches?: MatchRow[]; limited?: boolean; failed?: number };
      matches.push(...(body.matches ?? []));
      if (body.limited) limited = true;
      if (body.failed) failed = true;
    }
    return { matches, limited, failed, unreached: false };
  } catch {
    return { matches, limited, failed: true, unreached: true };
  }
}
