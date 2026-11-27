import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/db/types';
import type { Candidate } from '@/lib/domain/packages';
import { MATCH_MAX_AGE_MS, type MatchRow } from '@/lib/list/matches';
import { searchProducts, toCandidates } from './products';
import { isKrogerConfigured, KrogerNotConfigured } from './token';

/** Product lookups one household may make per UTC day. */
export const DAILY_LOOKUPS = 400;

const CHUNK = 60; // kroger_spend takes at most 60 per call
const PARALLEL = 6;

type Sb = SupabaseClient<Database>;
export interface MatchContext {
  sb: Sb;
  householdId: string;
  locationId: string;
}

/** Runs `fn` over `items`, at most `limit` at a time. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function spendTotal(sb: Sb, householdId: string, n: number): Promise<number> {
  const { data, error } = await sb.rpc('kroger_spend', { h: householdId, n });
  if (error) throw new Error(error.message);
  return Number(data);
}

/**
 * Fred Meyer products found for each food, cached per household, store and food for 24 hours.
 * Foods whose cached search is missing, older than a day, or for a different search wording are searched
 * again, after the household's daily 400 is charged (kroger_spend, 60 at a time). Over the cap, or with the
 * all-households ceiling reached, nothing is searched and `limited` is set: the old rows (if any) are
 * still returned. A search that fails keeps its old row and counts in `failed`.
 */
export async function getMatches(
  canonicals: string[],
  ctx: MatchContext,
): Promise<{ matches: MatchRow[]; limited: boolean; failed: number }> {
  const names = [...new Set(canonicals)];
  const { sb, householdId, locationId } = ctx;
  if (names.length === 0) return { matches: [], limited: false, failed: 0 };

  const [cached, chosen] = await Promise.all([
    sb.from('kroger_matches').select('canonical, term, candidates, fetched_at')
      .eq('household_id', householdId).eq('location_id', locationId).in('canonical', names),
    sb.from('item_product_choice').select('canonical, search_term')
      .eq('household_id', householdId).in('canonical', names),
  ]);
  if (cached.error) throw new Error(cached.error.message);
  if (chosen.error) throw new Error(chosen.error.message);

  const rows = new Map<string, MatchRow>();
  for (const r of cached.data ?? []) {
    rows.set(r.canonical, {
      canonical: r.canonical,
      locationId,
      term: r.term,
      candidates: Array.isArray(r.candidates) ? (r.candidates as unknown as Candidate[]) : [],
      fetchedAt: r.fetched_at,
    });
  }
  const termOf = new Map(names.map((n) => [n, n]));
  for (const c of chosen.data ?? []) if (c.search_term) termOf.set(c.canonical, c.search_term);

  const now = Date.now();
  const stale = names.filter((n) => {
    const row = rows.get(n);
    return !row || row.term !== termOf.get(n) || !(now - Date.parse(row.fetchedAt) < MATCH_MAX_AGE_MS);
  });

  let limited = false;
  let failed = 0;
  if (stale.length > 0) {
    if (!isKrogerConfigured()) throw new KrogerNotConfigured();
    const { data: over, error: overErr } = await sb.rpc('kroger_limited');
    if (overErr) throw new Error(overErr.message);
    limited = over === true;
    // kroger_spend refuses by returning the household's unchanged total, so a refusal can only be told
    // from a charge by comparing with the total before: ask for it with n = 0 (adds nothing).
    let total = limited ? 0 : await spendTotal(sb, householdId, 0);
    const approved: string[] = [];
    for (let i = 0; i < stale.length && !limited; i += CHUNK) {
      const chunk = stale.slice(i, i + CHUNK);
      if (total + chunk.length > DAILY_LOOKUPS) {
        limited = true;
        break;
      }
      const after = await spendTotal(sb, householdId, chunk.length);
      if (after < total + chunk.length) {
        limited = true;
        break;
      }
      total = after;
      approved.push(...chunk);
    }

    const fetchedAt = new Date().toISOString();
    const found = await mapLimit(approved, PARALLEL, async (name): Promise<MatchRow | null> => {
      const term = termOf.get(name) ?? name;
      try {
        return { canonical: name, locationId, term, candidates: toCandidates(await searchProducts(term, locationId), term), fetchedAt };
      } catch (e) {
        if (e instanceof KrogerNotConfigured) throw e;
        failed++;
        console.error('kroger match failed', e instanceof Error ? e.message : 'unknown');
        return null;
      }
    });
    const fresh = found.filter((r): r is MatchRow => r !== null);
    if (fresh.length > 0) {
      const { error } = await sb.from('kroger_matches').upsert(
        fresh.map((r) => ({
          household_id: householdId, location_id: locationId, canonical: r.canonical, term: r.term,
          candidates: r.candidates as unknown as Json, fetched_at: r.fetchedAt,
        })),
        { onConflict: 'household_id,location_id,canonical' },
      );
      // The searches were paid for: a failed save still hands the matches to the caller (nothing is cached).
      if (error) {
        console.error('kroger match save failed', error.message);
        failed += fresh.length;
      }
      for (const r of fresh) rows.set(r.canonical, r);

      // The price history is a bonus: a failure here must not lose the matches.
      const seen = new Set<string>();
      const observed = fresh.flatMap((r) => r.candidates).filter((c) => c.regularCents > 0 && !seen.has(c.upc) && seen.add(c.upc));
      if (observed.length > 0) {
        const { error: obsErr } = await sb.from('price_observations').upsert(
          observed.map((c) => ({
            household_id: householdId, location_id: locationId, upc: c.upc,
            regular_cents: c.regularCents, promo_cents: c.promoCents,
          })),
          { onConflict: 'household_id,location_id,upc,seen_on', ignoreDuplicates: true },
        );
        if (obsErr) console.error('kroger price log failed', obsErr.message);
      }
    }
  }

  return { matches: names.flatMap((n) => rows.get(n) ?? []), limited, failed };
}
