import 'server-only';
import type { Candidate } from '@/lib/domain/packages';
import { krogerImageUrl } from '@/lib/list/prices';
import { fakeProductsResponse } from './fake';
import { krogerGet } from './http';
import { parseSize } from './size';
import { isKrogerFake } from './token';

export interface KrogerProduct {
  productId?: string;
  upc?: string;
  brand?: string;
  description?: string;
  images?: { perspective?: string; featured?: boolean; sizes?: { size?: string; url?: string }[] }[];
  items?: {
    itemId?: string;
    size?: string;
    soldBy?: string;
    price?: { regular?: number; promo?: number };
    inventory?: { stockLevel?: string };
  }[];
}

const MAX_CANDIDATES = 10;
const UPC = /^\d{13}$/;

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

const toCents = (dollars: number | undefined): number => Math.round((dollars ?? 0) * 100);

/** Up to ten products as candidates, in Kroger's order; products with no usable price or UPC are left out. */
export function toCandidates(products: KrogerProduct[], term: string): Candidate[] {
  const out: Candidate[] = [];
  for (const p of products) {
    if (out.length >= MAX_CANDIDATES) break;
    const upc = p.upc ?? p.productId ?? '';
    if (!p.description || !UPC.test(upc)) continue;
    const item = (p.items ?? []).find((i) => (i.price?.regular ?? 0) > 0 || (i.price?.promo ?? 0) > 0);
    if (!item) continue;
    const promo = toCents(item.price?.promo);
    const regular = toCents(item.price?.regular) || promo;
    out.push({
      upc,
      name: p.description,
      brand: p.brand ?? null,
      sizeText: item.size ?? '',
      size: item.size ? parseSize(item.size) : null,
      soldBy: item.soldBy === 'WEIGHT' ? 'WEIGHT' : 'UNIT',
      regularCents: regular,
      promoCents: promo > 0 && promo < regular ? promo : null,
      imageUrl: imageOf(p),
      relevant: hasEveryWord(p.description, term),
      inStock: item.inventory?.stockLevel !== 'TEMPORARILY_OUT_OF_STOCK',
    });
  }
  return out;
}

/** Kroger's first twenty products for a search term at one store. */
export async function searchProducts(term: string, locationId: string): Promise<KrogerProduct[]> {
  const body = isKrogerFake()
    ? (fakeProductsResponse(term) as { data?: KrogerProduct[] })
    : await krogerGet<{ data?: KrogerProduct[] }>('/products', {
        'filter.term': term,
        'filter.locationId': locationId,
        'filter.limit': '20',
      });
  return body.data ?? [];
}
