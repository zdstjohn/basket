import 'server-only';
import type { Quantity } from '@/lib/domain/types';
import { toQuantity } from '@/lib/domain/units';
import { krogerImageUrl } from '@/lib/list/prices';
import { fakeProductsResponse } from './fake';
import { krogerGet } from './http';
import { parseSize } from './size';
import { isKrogerFake } from './token';

export interface KrogerPrice {
  /** Cents for one gram, one millilitre or one item. */
  centsPerBase: number;
  productName: string;
  onSale: boolean;
  imageUrl: string | null;
}

interface KrogerProduct {
  productId?: string;
  description?: string;
  images?: { perspective?: string; featured?: boolean; sizes?: { size?: string; url?: string }[] }[];
  items?: { size?: string; soldBy?: string; price?: { regular?: number; promo?: number } }[];
}

const MATCHED_LIMIT = 5;
const UNMATCHED_LIMIT = 3;
const G_PER_LB = toQuantity(1, 'lb')?.amount ?? 453.59237;

const words = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** A word as itself, without a plural "s", and without a plural "es". */
const forms = (w: string): string[] => [w, ...(w.endsWith('s') ? [w.slice(0, -1)] : []), ...(w.endsWith('es') ? [w.slice(0, -2)] : [])];
const sameWord = (a: string, b: string): boolean => forms(a).some((x) => forms(b).includes(x));

const hasEveryWord = (description: string, canonical: string): boolean => {
  const have = words(description);
  return words(canonical).every((w) => have.some((h) => sameWord(w, h)));
};

/** The product's featured front photo: small, else thumbnail; only https on www.kroger.com. */
function imageOf(p: KrogerProduct): string | null {
  const fronts = (p.images ?? []).filter((i) => i.perspective === 'front');
  const front = fronts.find((i) => i.featured) ?? fronts[0];
  if (!front) return null;
  const pick = (size: string) => front.sizes?.find((s) => s.size === size)?.url;
  return krogerImageUrl(pick('small') ?? pick('thumbnail'));
}

/** The cheapest priced item of a product for this kind of quantity, per base unit. */
function bestItem(p: KrogerProduct, kind: Quantity['kind']): { centsPerBase: number; onSale: boolean } | null {
  let best: { centsPerBase: number; onSale: boolean } | null = null;
  for (const item of p.items ?? []) {
    const regular = item.price?.regular ?? 0;
    const promo = item.price?.promo ?? 0;
    const dollars = promo > 0 ? promo : regular;
    if (!(dollars > 0)) continue;
    const cents = Math.round(dollars * 100);
    let perBase: number | null = null;
    if (item.soldBy === 'WEIGHT' && kind === 'mass') {
      perBase = cents / G_PER_LB; // sold by weight: the price is per pound
    } else {
      const size = item.size ? parseSize(item.size) : null;
      if (size && size.kind === kind) perBase = cents / size.amount;
    }
    if (perBase === null) continue;
    if (!best || perBase < best.centsPerBase) best = { centsPerBase: perBase, onSale: promo > 0 && promo < regular };
  }
  return best;
}

function cheapest(products: KrogerProduct[], kind: Quantity['kind']): KrogerPrice | null {
  let best: KrogerPrice | null = null;
  for (const p of products) {
    const item = bestItem(p, kind);
    if (!item || !p.description) continue;
    if (!best || item.centsPerBase < best.centsPerBase) {
      best = { ...item, productName: p.description, imageUrl: imageOf(p) };
    }
  }
  return best;
}

/**
 * The shelf price of a grocery item at one Kroger store, per base unit: the lowest among the first five
 * products whose names have all the item's words, else among the first three results. Null when nothing
 * is priced in the item's kind (mass, volume or count).
 */
export async function priceFor(canonical: string, kind: Quantity['kind'], locationId: string): Promise<KrogerPrice | null> {
  const body = isKrogerFake()
    ? (fakeProductsResponse(canonical) as { data?: KrogerProduct[] })
    : await krogerGet<{ data?: KrogerProduct[] }>('/products', {
        'filter.term': canonical,
        'filter.locationId': locationId,
        'filter.limit': '10',
      });
  const products = body.data ?? [];
  const matched = products.filter((p) => hasEveryWord(p.description ?? '', canonical)).slice(0, MATCHED_LIMIT);
  return cheapest(matched, kind) ?? cheapest(products.slice(0, UNMATCHED_LIMIT), kind);
}
