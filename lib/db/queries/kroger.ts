import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import type { Candidate } from '@/lib/domain/packages';
import type { Choice, MatchRow } from '@/lib/list/matches';

type Sb = SupabaseClient<Database>;
const WEEK_AND_A_DAY_MS = 8 * 24 * 60 * 60 * 1000;

/** The household's Fred Meyer searches saved in the last eight days (older ones are no use). */
export async function listMatches(sb: Sb, householdId: string, locationId: string): Promise<MatchRow[]> {
  const since = new Date(Date.now() - WEEK_AND_A_DAY_MS).toISOString();
  const { data, error } = await sb
    .from('kroger_matches')
    .select('canonical, location_id, term, candidates, fetched_at')
    .eq('household_id', householdId)
    .eq('location_id', locationId)
    .gte('fetched_at', since);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    canonical: r.canonical,
    locationId: r.location_id,
    term: r.term,
    candidates: Array.isArray(r.candidates) ? (r.candidates as unknown as Candidate[]) : [],
    fetchedAt: r.fetched_at,
  }));
}

/** The household's remembered product and search wording per food. */
export async function listChoices(sb: Sb, householdId: string): Promise<Choice[]> {
  const { data, error } = await sb
    .from('item_product_choice')
    .select('canonical, upc, search_term')
    .eq('household_id', householdId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ canonical: r.canonical, upc: r.upc, searchTerm: r.search_term }));
}
