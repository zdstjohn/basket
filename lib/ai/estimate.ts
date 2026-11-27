import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import type { Store } from '@/lib/domain/list';
import type { Quantity } from '@/lib/domain/types';
import { perBase } from '@/lib/domain/packages';
import { getMatches } from '@/lib/kroger/matches';
import { isKrogerConfigured, KrogerNotConfigured } from '@/lib/kroger/token';
import { KROGER_PRICE_MAX_AGE_MS } from '@/lib/list/prices';
import type { MatchRow } from '@/lib/list/matches';
import { generateStructured, type UsageReport } from './provider';
import type { GateResult } from './usage';
import { EstimateResultSchema } from './schemas';

export interface EstimateContext {
  sb: SupabaseClient<Database>;
  householdId: string;
  /** The household's chosen Fred Meyer store; with it, Fred Meyer items are priced from Kroger first. */
  krogerLocationId?: string | null;
  /**
   * The spend guard, taken once and only when the model is about to be asked (never for cached or Kroger
   * prices). Anything but 'ok' means the model is not asked; Kroger and cached prices still come.
   */
  gate: () => Promise<GateResult>;
  onUsage?: (e: UsageReport) => void;
}

/** What the list shows beside a Kroger-priced item. */
export interface KrogerDetail {
  productName: string | null;
  imageUrl: string | null;
  onSale: boolean;
}

export interface EstimateResult {
  /** Price per base unit in cents, by canonical name. */
  prices: Record<string, number>;
  /** Product details for the prices that came from Kroger, by canonical name. */
  kroger: Record<string, KrogerDetail>;
  /** True when some items were left unpriced because the spend guard refused the model call. */
  aiSkipped: boolean;
  /** Why the guard refused, when aiSkipped. */
  aiSkipReason?: Exclude<GateResult, 'ok'>;
}

const STORE_NAMES: Record<Store, string> = {
  fred_meyer: 'Fred Meyer',
  amazon: 'Amazon (Amazon Fresh / pantry)',
  costco: 'Costco',
};
const BASE_NAMES = { g: 'gram', ml: 'milliliter', each: 'each item' } as const;

type PriceInsert = Database['public']['Tables']['price_estimates']['Insert'];

const isStale = (updatedAt: string | undefined): boolean => {
  const at = updatedAt ? Date.parse(updatedAt) : NaN;
  return !(Date.now() - at < KROGER_PRICE_MAX_AGE_MS);
};

/**
 * Price per base unit in cents (per gram, per ml, or per item) for each canonical grocery name.
 * Cached per household in price_estimates. At a household's chosen Fred Meyer, items are priced from
 * Kroger's shelf first (rows older than a day, and earlier AI guesses, are looked up again); the model
 * is asked only about what has no price at all. Prices you typed ('user') are never touched.
 * Keyed by canonical name; when the same name appears with two kinds the last one wins.
 */
export async function estimatePrices(
  items: { canonical: string; qty: Quantity }[],
  store: Store,
  ctx: EstimateContext,
): Promise<EstimateResult> {
  const unique = new Map<string, Quantity>();
  for (const i of items) unique.set(`${i.canonical}#${i.qty.kind}`, i.qty);
  const wanted = [...unique.entries()].map(([k, qty]) => ({ canonical: k.slice(0, k.lastIndexOf('#')), qty }));
  const out: EstimateResult = { prices: {}, kroger: {}, aiSkipped: false };
  if (wanted.length === 0) return out;

  const { data: cached, error } = await ctx.sb
    .from('price_estimates')
    .select('canonical, kind, cents_per_base, source, updated_at, product_name, product_image_url, on_sale')
    .eq('household_id', ctx.householdId)
    .eq('store', store)
    .in('canonical', wanted.map((w) => w.canonical));
  if (error) throw new Error(error.message);
  const have = new Map((cached ?? []).map((r) => [`${r.canonical}#${r.kind}`, r]));

  const useKroger = store === 'fred_meyer' && !!ctx.krogerLocationId && isKrogerConfigured();
  const keep = (w: (typeof wanted)[number], r: NonNullable<ReturnType<typeof have.get>>) => {
    out.prices[w.canonical] = Number(r.cents_per_base);
    if (r.source === 'kroger') {
      out.kroger[w.canonical] = { productName: r.product_name ?? null, imageUrl: r.product_image_url ?? null, onSale: !!r.on_sale };
    }
  };

  const lookup: { w: (typeof wanted)[number]; was: ReturnType<typeof have.get> }[] = [];
  const missing: typeof wanted = [];
  for (const w of wanted) {
    const row = have.get(`${w.canonical}#${w.qty.kind}`);
    if (!row) {
      if (useKroger) lookup.push({ w, was: undefined });
      else missing.push(w);
    } else if (useKroger && row.source !== 'user' && (row.source !== 'kroger' || isStale(row.updated_at))) {
      lookup.push({ w, was: row });
    } else {
      keep(w, row);
    }
  }

  const shelfRows: PriceInsert[] = [];
  const aiRows: PriceInsert[] = [];
  if (lookup.length > 0 && ctx.krogerLocationId) {
    const locationId = ctx.krogerLocationId;
    let matches: MatchRow[] = [];
    let limited = false;
    try {
      ({ matches, limited } = await getMatches([...new Set(lookup.map(({ w }) => w.canonical))], {
        sb: ctx.sb, householdId: ctx.householdId, locationId,
      }));
    } catch (e) {
      // Not configured is expected and silent; anything else (bad secret, 429, outage) must show in the logs.
      if (!(e instanceof KrogerNotConfigured)) console.error('kroger price failed', e instanceof Error ? e.message : 'unknown');
      // Kroger is down or says no: the item keeps its old price, or gets an estimate
    }
    const byName = new Map(matches.map((m) => [m.canonical, m]));
    const stamp = new Date().toISOString();
    for (const { w, was } of lookup) {
      const match = byName.get(w.canonical);
      const k = match ? perBase(w.canonical, w.qty.kind, match.candidates) : null;
      if (!k) {
        if (was) keep(w, was);
        else if (!(limited && !match)) missing.push(w); // over the Kroger cap: unpriced, not a paid guess
        continue;
      }
      const c = k.candidate;
      const detail = { productName: c.name, imageUrl: c.imageUrl, onSale: c.promoCents !== null };
      out.prices[w.canonical] = k.centsPerBase;
      out.kroger[w.canonical] = detail;
      shelfRows.push({
        household_id: ctx.householdId, canonical: w.canonical, store, kind: w.qty.kind,
        cents_per_base: k.centsPerBase, source: 'kroger', product_name: detail.productName,
        product_image_url: detail.imageUrl, on_sale: detail.onSale, updated_at: stamp,
      });
    }
  }

  const gated = missing.length > 0 ? await ctx.gate() : 'ok';
  if (gated !== 'ok') {
    out.aiSkipped = true;
    out.aiSkipReason = gated;
  } else if (missing.length > 0) {
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
    for (const m of missing) {
      const cents = byName.get(m.canonical);
      if (cents === undefined) continue;
      out.prices[m.canonical] = cents;
      aiRows.push({
        household_id: ctx.householdId, canonical: m.canonical, store, kind: m.qty.kind,
        cents_per_base: cents, source: 'ai',
      });
    }
  }
  // Two writes: one bulk upsert must have the same columns on every row, and only shelf rows have product fields.
  for (const rows of [shelfRows, aiRows]) {
    if (rows.length === 0) continue;
    const { error: upErr } = await ctx.sb
      .from('price_estimates')
      .upsert(rows, { onConflict: 'household_id,canonical,store,kind' });
    if (upErr) throw new Error(upErr.message);
  }
  return out;
}

/** Just the prices of {@link estimatePrices}. */
export async function estimateCents(
  items: { canonical: string; qty: Quantity }[],
  store: Store,
  ctx: EstimateContext,
): Promise<Record<string, number>> {
  return (await estimatePrices(items, store, ctx)).prices;
}
