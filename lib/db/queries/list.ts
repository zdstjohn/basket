import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import type { Store } from '@/lib/domain/list';
import type { IngredientLine, Quantity, Role } from '@/lib/domain/types';
import type { ItemPatch } from '@/lib/list/offline';
import { isStore, krogerImageUrl, type PriceRow, type PriceSource } from '@/lib/list/prices';

type Sb = SupabaseClient<Database>;
type Json = Database['public']['Tables']['households']['Row']['category_store'];

const norm = (s: string): string => s.trim().toLowerCase();

// ---------------------------------------------------------------------------
// Staples: things bought every week, merged into the list.
// ---------------------------------------------------------------------------

export interface Staple extends IngredientLine {
  id: string;
  active: boolean;
}

export type StapleInput = Omit<Staple, 'id'> & { id?: string };

export async function listStaples(sb: Sb, householdId: string): Promise<Staple[]> {
  const { data, error } = await sb
    .from('staples')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    canonical: r.canonical,
    amount: Number(r.amount),
    unit: r.unit,
    role: r.role as Role,
    active: r.active,
  }));
}

export async function saveStaple(sb: Sb, householdId: string, s: StapleInput): Promise<void> {
  const fields = { canonical: norm(s.canonical), amount: s.amount, unit: s.unit.trim(), role: s.role, active: s.active };
  const { error } = s.id
    ? await sb.from('staples').update(fields).eq('id', s.id)
    : await sb.from('staples').insert({ household_id: householdId, ...fields });
  if (error) throw new Error(error.message);
}

export async function setStapleActive(sb: Sb, id: string, active: boolean): Promise<void> {
  const { error } = await sb.from('staples').update({ active }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteStaple(sb: Sb, id: string): Promise<void> {
  const { error } = await sb.from('staples').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Always-have: things you never need to buy (salt, pepper, oil).
// ---------------------------------------------------------------------------

export async function listAlwaysHave(sb: Sb, householdId: string): Promise<string[]> {
  const { data, error } = await sb
    .from('always_have')
    .select('canonical')
    .eq('household_id', householdId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.canonical);
}

export async function addAlwaysHave(sb: Sb, householdId: string, name: string): Promise<void> {
  const canonical = norm(name);
  if (!canonical) return;
  const { error } = await sb
    .from('always_have')
    .upsert({ household_id: householdId, canonical }, { onConflict: 'household_id,canonical' });
  if (error) throw new Error(error.message);
}

export async function removeAlwaysHave(sb: Sb, householdId: string, canonical: string): Promise<void> {
  const { error } = await sb.from('always_have').delete().eq('household_id', householdId).eq('canonical', canonical);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// This week's have-it / got-it / outside-budget flags.
// ---------------------------------------------------------------------------

export interface ItemState {
  have_it: boolean;
  checked: boolean;
  outside_budget: boolean;
}

export async function listItemState(sb: Sb, weekId: string): Promise<Record<string, ItemState>> {
  const { data, error } = await sb
    .from('week_item_state')
    .select('item_key, have_it, checked, outside_budget')
    .eq('week_id', weekId);
  if (error) throw new Error(error.message);
  const out: Record<string, ItemState> = {};
  for (const r of data ?? []) {
    out[r.item_key] = { have_it: r.have_it, checked: r.checked, outside_budget: r.outside_budget };
  }
  return out;
}

/**
 * Sets some of an item's flags for the week. The last write wins on every phone.
 * Pass `householdId` when you have it to save a lookup.
 */
export async function setItemState(
  sb: Sb,
  weekId: string,
  itemKey: string,
  patch: ItemPatch,
  householdId?: string,
): Promise<void> {
  let household = householdId;
  if (!household) {
    const { data, error, status } = await sb.from('weeks').select('household_id').eq('id', weekId).single();
    if (error) throw Object.assign(new Error(error.message), { code: error.code, status });
    household = data.household_id;
  }
  const { error, status } = await sb
    .from('week_item_state')
    .upsert({ household_id: household, week_id: weekId, item_key: itemKey, ...patch }, { onConflict: 'week_id,item_key' });
  if (error) throw Object.assign(new Error(error.message), { code: error.code, status });
}

// ---------------------------------------------------------------------------
// Where each item is bought, and what it costs.
// ---------------------------------------------------------------------------

export async function listItemStores(sb: Sb, householdId: string): Promise<Map<string, Store>> {
  const { data, error } = await sb.from('item_store').select('canonical, store').eq('household_id', householdId);
  if (error) throw new Error(error.message);
  const out = new Map<string, Store>();
  for (const r of data ?? []) if (isStore(r.store)) out.set(r.canonical, r.store);
  return out;
}

export async function setItemStore(sb: Sb, householdId: string, canonical: string, store: Store): Promise<void> {
  const { error } = await sb
    .from('item_store')
    .upsert({ household_id: householdId, canonical, store }, { onConflict: 'household_id,canonical' });
  if (error) throw new Error(error.message);
}

export async function listPrices(sb: Sb, householdId: string): Promise<PriceRow[]> {
  const { data, error } = await sb
    .from('price_estimates')
    .select('canonical, store, kind, cents_per_base, source, updated_at, product_name, product_image_url, on_sale')
    .eq('household_id', householdId);
  if (error) throw new Error(error.message);
  const out: PriceRow[] = [];
  for (const r of data ?? []) {
    if (!isStore(r.store)) continue;
    out.push({
      canonical: r.canonical,
      store: r.store,
      kind: r.kind as Quantity['kind'],
      centsPerBase: Number(r.cents_per_base),
      source: r.source === 'user' ? 'user' : r.source === 'kroger' ? 'kroger' : 'ai',
      ...(r.source === 'kroger'
        ? {
            productName: r.product_name,
            imageUrl: krogerImageUrl(r.product_image_url),
            onSale: r.on_sale,
            updatedAt: r.updated_at,
          }
        : {}),
    });
  }
  return out;
}

export async function setEstimate(
  sb: Sb,
  householdId: string,
  canonical: string,
  store: Store,
  kind: Quantity['kind'],
  centsPerBase: number,
  source: PriceSource,
): Promise<void> {
  const { error } = await sb.from('price_estimates').upsert(
    { household_id: householdId, canonical, store, kind, cents_per_base: centsPerBase, source },
    { onConflict: 'household_id,canonical,store,kind' },
  );
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Which store each kind of food comes from.
// ---------------------------------------------------------------------------

/** Members may update category_store (it is in the households update grant in 0001_init.sql). */
export async function setCategoryStore(
  sb: Sb,
  householdId: string,
  current: Record<string, unknown>,
  roles: Role[],
  store: Store,
): Promise<Record<string, unknown>> {
  const next: Record<string, unknown> = { ...current };
  for (const r of roles) next[r] = store;
  const { error } = await sb
    .from('households')
    .update({ category_store: next as Json })
    .eq('id', householdId);
  if (error) throw new Error(error.message);
  return next;
}
