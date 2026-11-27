import type { ScaledLine } from '@/lib/domain/scaling';
import type { Store } from '@/lib/domain/list';
import type { Quantity, Role } from '@/lib/domain/types';

export type PriceSource = 'ai' | 'user' | 'kroger';

export interface PriceRow {
  canonical: string;
  store: Store;
  kind: Quantity['kind'];
  /** Cents for one base unit: one gram, one millilitre or one item. */
  centsPerBase: number;
  source: PriceSource;
  /** Set for Kroger prices: the product it came from. */
  productName?: string | null;
  imageUrl?: string | null;
  onSale?: boolean;
  /** When the price was saved (ISO). */
  updatedAt?: string;
}

/** A Kroger price older than this is looked up again. */
export const KROGER_PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** A product photo link, only when it is https on www.kroger.com. */
export function krogerImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'www.kroger.com' ? u.href : null;
  } catch {
    return null;
  }
}

export type PriceMap = Map<string, PriceRow>;

export const STORES: Store[] = ['fred_meyer', 'amazon', 'costco'];
export const STORE_NAMES: Record<Store, string> = {
  fred_meyer: 'Fred Meyer',
  amazon: 'Amazon',
  costco: 'Costco',
};

export const isStore = (v: unknown): v is Store => typeof v === 'string' && (STORES as string[]).includes(v);

export const priceKey = (canonical: string, store: Store, kind: Quantity['kind']): string =>
  `${store}|${kind}|${canonical}`;

export function toPriceMap(rows: PriceRow[]): PriceMap {
  return new Map(rows.map((r) => [priceKey(r.canonical, r.store, r.kind), r]));
}

/** The price of this much of an item at a store, in cents; null when nobody has priced it yet. */
export function estimateFor(prices: PriceMap, canonical: string, qty: Quantity, store: Store): number | null {
  const row = prices.get(priceKey(canonical, store, qty.kind));
  return row ? Math.round(row.centsPerBase * qty.amount) : null;
}

/** A price you typed for this much of an item, in cents; null when the saved price is a guess or a shelf price. */
export function userCentsFor(prices: PriceMap, canonical: string, qty: Quantity, store: Store): number | null {
  const row = prices.get(priceKey(canonical, store, qty.kind));
  return row?.source === 'user' ? Math.round(row.centsPerBase * qty.amount) : null;
}

export function priceSourceFor(
  prices: PriceMap,
  canonical: string,
  qty: Quantity,
  store: Store,
): PriceSource | null {
  return prices.get(priceKey(canonical, store, qty.kind))?.source ?? null;
}

/** A typed price is the total for the item's current quantity; it is stored per base unit. */
export function userCentsPerBase(totalCents: number, qty: Quantity): number {
  return qty.amount > 0 ? totalCents / qty.amount : 0;
}

/** An item's store: its own choice, else its category's, else Fred Meyer. */
export function storeFor(
  canonical: string,
  role: Role,
  itemStores: ReadonlyMap<string, Store>,
  categoryStore: Record<string, unknown>,
): Store {
  const own = itemStores.get(canonical);
  if (own) return own;
  const cat = categoryStore[role];
  return isStore(cat) ? cat : 'fred_meyer';
}

/** What one meal costs this household, or null when any line has no price. */
export function mealCostCents(
  lines: ScaledLine[],
  storeOf: (canonical: string, role: Role) => Store,
  prices: PriceMap,
): number | null {
  let sum = 0;
  for (const l of lines) {
    const c = estimateFor(prices, l.canonical, l.qty, storeOf(l.canonical, l.role));
    if (c === null) return null;
    sum += c;
  }
  return sum;
}

/**
 * What each meal costs from saved prices alone (null when any line has none), and how many meals
 * have no price yet. Pure: it never asks anyone for a price.
 */
export function favoritesCosts(
  meals: { id: string; lines: ScaledLine[] }[],
  storeOf: (canonical: string, role: Role) => Store,
  prices: PriceMap,
): { costs: Map<string, number | null>; notPriced: number } {
  const costs = new Map(meals.map((m) => [m.id, mealCostCents(m.lines, storeOf, prices)]));
  let notPriced = 0;
  for (const c of costs.values()) if (c === null) notPriced += 1;
  return { costs, notPriced };
}

/** A search for the food at Amazon or Costco, opened in a new tab. */
export function storeSearchUrl(store: 'amazon' | 'costco', canonical: string): string {
  const q = encodeURIComponent(canonical);
  return store === 'amazon' ? `https://www.amazon.com/s?k=${q}` : `https://www.costco.com/CatalogSearch?keyword=${q}`;
}
