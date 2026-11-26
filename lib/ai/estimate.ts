import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import type { Store } from '@/lib/domain/list';
import type { Quantity } from '@/lib/domain/types';
import { generateStructured } from './provider';
import { EstimateResultSchema } from './schemas';

export interface EstimateContext {
  sb: SupabaseClient<Database>;
  householdId: string;
  onUsage?: (e: { model: string; inputTokens: number; outputTokens: number }) => void;
}

const STORE_NAMES: Record<Store, string> = {
  fred_meyer: 'Fred Meyer',
  amazon: 'Amazon (Amazon Fresh / pantry)',
  costco: 'Costco',
};
const BASE_NAMES = { g: 'gram', ml: 'milliliter', each: 'each item' } as const;

/**
 * Price per base unit in cents (per gram, per ml, or per item) for each canonical grocery name.
 * Cached per household in price_estimates; only uncached names go to the model.
 * Keyed by canonical name; when the same name appears with two kinds the last one wins.
 */
export async function estimateCents(
  items: { canonical: string; qty: Quantity }[],
  store: Store,
  ctx: EstimateContext,
): Promise<Record<string, number>> {
  const unique = new Map<string, Quantity>();
  for (const i of items) unique.set(`${i.canonical}#${i.qty.kind}`, i.qty);
  const wanted = [...unique.entries()].map(([k, qty]) => ({ canonical: k.slice(0, k.lastIndexOf('#')), qty }));
  if (wanted.length === 0) return {};

  const { data: cached, error } = await ctx.sb
    .from('price_estimates')
    .select('canonical, kind, cents_per_base')
    .eq('household_id', ctx.householdId)
    .eq('store', store)
    .in('canonical', wanted.map((w) => w.canonical));
  if (error) throw new Error(error.message);
  const have = new Map((cached ?? []).map((r) => [`${r.canonical}#${r.kind}`, Number(r.cents_per_base)]));

  const result: Record<string, number> = {};
  const missing: typeof wanted = [];
  for (const w of wanted) {
    const hit = have.get(`${w.canonical}#${w.qty.kind}`);
    if (hit === undefined) missing.push(w);
    else result[w.canonical] = hit;
  }

  if (missing.length > 0) {
    const r = await generateStructured({
      task: 'estimate',
      schema: EstimateResultSchema,
      system:
        `You estimate typical grocery shelf prices in Tacoma, Washington, USA at ${STORE_NAMES[store]}, in US cents. ` +
        'For each item return centsPerBase: the price of ONE base unit (one gram, one milliliter, or one item as given). ' +
        'Use ordinary non-sale prices; be realistic, not cheap.',
      onUsage: ctx.onUsage,
      prompt:
        'Items: ' +
        JSON.stringify(missing.map((m) => ({ canonical: m.canonical, baseUnit: BASE_NAMES[m.qty.base] }))),
    });
    const byName = new Map(r.object.prices.map((p) => [p.canonical, p.centsPerBase]));
    const rows: Database['public']['Tables']['price_estimates']['Insert'][] = [];
    for (const m of missing) {
      const cents = byName.get(m.canonical);
      if (cents === undefined) continue;
      result[m.canonical] = cents;
      rows.push({
        household_id: ctx.householdId, canonical: m.canonical, store, kind: m.qty.kind,
        cents_per_base: cents, source: 'ai',
      });
    }
    if (rows.length > 0) {
      const { error: upErr } = await ctx.sb
        .from('price_estimates')
        .upsert(rows, { onConflict: 'household_id,canonical,store,kind' });
      if (upErr) throw new Error(upErr.message);
    }
  }
  return result;
}
