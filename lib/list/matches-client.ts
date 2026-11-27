import type { MatchRow } from './matches';

const BATCH = 60;

/**
 * Asks the server for the Fred Meyer products of foods, 60 at a time. The server keeps what it finds for
 * 24 hours. Resolves to nothing found (and not limited) on any failure: offline, no store, not set up.
 */
export async function requestMatches(canonicals: string[]): Promise<{ matches: MatchRow[]; limited: boolean }> {
  const names = [...new Set(canonicals)];
  const matches: MatchRow[] = [];
  let limited = false;
  try {
    for (let i = 0; i < names.length; i += BATCH) {
      const res = await fetch('/api/kroger/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicals: names.slice(i, i + BATCH) }),
      });
      if (!res.ok) return { matches: [], limited: false };
      const body = (await res.json()) as { matches?: MatchRow[]; limited?: boolean };
      matches.push(...(body.matches ?? []));
      if (body.limited) limited = true;
    }
    return { matches, limited };
  } catch {
    return { matches: [], limited: false };
  }
}
