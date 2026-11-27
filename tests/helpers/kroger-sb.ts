import { vi } from 'vitest';

export interface MatchRowDb {
  canonical: string;
  term: string;
  candidates: unknown;
  fetched_at: string;
  location_id?: string;
}

/**
 * A Supabase stand-in for the Fred Meyer tables: kroger_matches, item_product_choice, price_observations,
 * price_estimates, and the kroger_spend / kroger_limited functions.
 */
export function krogerSb(opts: {
  matches?: MatchRowDb[];
  choices?: { canonical: string; search_term: string | null; upc?: string | null }[];
  estimates?: Record<string, unknown>[];
  /** Total the household has already used today; kroger_spend refuses past 400 and returns this unchanged. */
  used?: number;
  limited?: boolean;
  /** Makes the kroger_matches upsert fail with this message. */
  upsertError?: string;
}) {
  let used = opts.used ?? 0;
  const matches = [...(opts.matches ?? [])];
  const calls = {
    spend: [] as number[],
    upserts: {} as Record<string, { rows: Record<string, unknown>[]; opts: unknown }[]>,
  };
  const sb = {
    auth: { getUser: vi.fn() },
    rpc: async (fn: string, args: { n?: number }) => {
      if (fn === 'kroger_limited') return { data: opts.limited ?? false, error: null };
      if (fn !== 'kroger_spend') throw new Error(`unexpected rpc ${fn}`);
      const n = args.n ?? 0;
      calls.spend.push(n);
      if (used + n <= 400) used += n;
      return { data: used, error: null };
    },
    from: (table: string) => {
      const data: unknown[] =
        table === 'kroger_matches' ? matches
        : table === 'item_product_choice' ? (opts.choices ?? [])
        : table === 'price_estimates' ? (opts.estimates ?? [])
        : [];
      let names: string[] | null = null;
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.gte = () => b;
      b.in = (_c: string, v: string[]) => ((names = v), b);
      b.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({
          data: names ? data.filter((r) => names!.includes((r as { canonical: string }).canonical)) : data,
          error: null,
        }).then(res);
      b.upsert = async (rows: Record<string, unknown>[], o: unknown) => {
        (calls.upserts[table] ??= []).push({ rows, opts: o });
        if (table === 'kroger_matches' && opts.upsertError) return { error: { message: opts.upsertError } };
        if (table === 'kroger_matches') {
          for (const r of rows) {
            const i = matches.findIndex((m) => m.canonical === r.canonical);
            const row = { canonical: r.canonical, term: r.term, candidates: r.candidates, fetched_at: r.fetched_at } as MatchRowDb;
            if (i >= 0) matches[i] = row;
            else matches.push(row);
          }
        }
        return { error: null };
      };
      return b;
    },
  };
  return { sb, calls, matches };
}
