import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/db/types';
import type { CartLine, CartSend, Modality } from '@/lib/domain/cart';
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

const isLine = (v: unknown): v is CartLine => {
  const l = v as Partial<CartLine> | null;
  return (
    typeof l === 'object' && l !== null && typeof l.upc === 'string' && typeof l.name === 'string' &&
    typeof l.quantity === 'number' && typeof l.cents === 'number' && typeof l.key === 'string' && typeof l.canonical === 'string'
  );
};

/** Every try at filling the cart for a week, newest first. */
export async function listCartSends(sb: Sb, weekId: string): Promise<CartSend[]> {
  const { data, error } = await sb
    .from('cart_sends')
    .select('id, created_at, user_id, profile_id, modality, status, items, total_cents')
    .eq('week_id', weekId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const raw = Array.isArray(r.items) ? (r.items as unknown[]) : [];
    const items = raw.filter(isLine);
    if (items.length < raw.length) console.error('cart send has unreadable lines');
    return {
      id: r.id,
      sentAt: r.created_at,
      userId: r.user_id,
      profileId: r.profile_id,
      modality: r.modality === 'DELIVERY' ? 'DELIVERY' : 'PICKUP',
      status: r.status === 'sent' || r.status === 'failed' ? r.status : 'pending',
      items,
      totalCents: r.total_cents,
    };
  });
}

/** How many sends the household has started since `sinceIso` that were sent or may have been (failed ones never reached Kroger). */
export async function countCartSendsSince(sb: Sb, householdId: string, sinceIso: string): Promise<number> {
  const { count, error } = await sb
    .from('cart_sends')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .in('status', ['pending', 'sent'])
    .gte('created_at', sinceIso);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Sends of the household that are `pending` or `sent` (not failed) and were started since `sinceIso`, in any week. */
export async function listLiveSendsSince(
  sb: Sb,
  householdId: string,
  sinceIso: string,
): Promise<{ id: string; createdAt: string; status: string }[]> {
  const { data, error } = await sb
    .from('cart_sends')
    .select('id, created_at, status')
    .eq('household_id', householdId)
    .in('status', ['pending', 'sent'])
    .gte('created_at', sinceIso);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ id: r.id, createdAt: r.created_at, status: r.status }));
}

/** Records a send as `pending`, before Kroger is asked. The signed-in user becomes its sender. */
export async function insertPendingSend(
  sb: Sb,
  send: { householdId: string; weekId: string; profileId: string | null; modality: Modality; items: CartLine[]; totalCents: number },
): Promise<{ id: string; createdAt: string }> {
  const { data, error } = await sb
    .from('cart_sends')
    .insert({
      household_id: send.householdId,
      week_id: send.weekId,
      profile_id: send.profileId,
      modality: send.modality,
      status: 'pending',
      items: send.items as unknown as Json,
      total_cents: send.totalCents,
    })
    .select('id, created_at')
    .single();
  if (error || !data) throw new Error('cart send insert failed');
  return { id: data.id, createdAt: data.created_at };
}

/** Settles a send: its outcome, and (when only some items went) what was actually added. Throws when it cannot be written. */
export async function settleSend(
  sb: Sb,
  id: string,
  result: { status: 'pending' | 'sent' | 'failed'; items?: CartLine[]; totalCents?: number },
): Promise<void> {
  const patch: Database['public']['Tables']['cart_sends']['Update'] = { status: result.status };
  if (result.items) patch.items = result.items as unknown as Json;
  if (result.totalCents !== undefined) patch.total_cents = result.totalCents;
  const { error } = await sb.from('cart_sends').update(patch).eq('id', id);
  if (error) throw new Error('cart send update failed');
}
