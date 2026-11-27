import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import { normFood } from '@/lib/domain/list';
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
    canonical: normFood(r.canonical),
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
  return (data ?? []).map((r) => ({ canonical: normFood(r.canonical), upc: r.upc, searchTerm: r.search_term }));
}

/**
 * Remembers the household's product and/or search wording for a food. Only the keys given are written, so
 * choosing a product leaves the wording alone and a new search (`upc: null`) clears the product.
 */
export async function setChoice(
  sb: Sb,
  householdId: string,
  canonical: string,
  patch: { upc?: string | null; searchTerm?: string | null },
): Promise<void> {
  const row: Database['public']['Tables']['item_product_choice']['Insert'] = {
    household_id: householdId,
    canonical,
    updated_at: new Date().toISOString(),
  };
  if ('upc' in patch) row.upc = patch.upc ?? null;
  if ('searchTerm' in patch) row.search_term = patch.searchTerm ?? null;
  const { error } = await sb.from('item_product_choice').upsert(row, { onConflict: 'household_id,canonical' });
  if (error) throw new Error(error.message);
}

/** Forgets the household's product and wording for a food: Basket's own pick applies again. */
export async function clearChoice(sb: Sb, householdId: string, canonical: string): Promise<void> {
  const { error } = await sb.from('item_product_choice').delete().eq('household_id', householdId).eq('canonical', canonical);
  if (error) throw new Error(error.message);
}
