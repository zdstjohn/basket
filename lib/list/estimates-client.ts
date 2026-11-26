import type { Store } from '@/lib/domain/list';
import type { Quantity } from '@/lib/domain/types';
import { krogerImageUrl, priceKey, type PriceRow } from './prices';

const MAX_BATCH = 100;

type Wanted = { canonical: string; qty: Quantity };

/**
 * Asks the server for prices of items nobody has priced at this store (or, at Fred Meyer, whose shelf price
 * is due a look): one request per call.
 * The server saves what it gets, so the rows returned here match what the next load finds.
 * Resolves to [] when the request fails (offline, over the AI cap): those items just show "—".
 */
export async function requestEstimates(items: Wanted[], store: Store): Promise<PriceRow[]> {
  // The route takes at most 120 items at a time.
  if (items.length > MAX_BATCH) {
    const parts: PriceRow[][] = [];
    for (let i = 0; i < items.length; i += MAX_BATCH) {
      parts.push(await requestEstimates(items.slice(i, i + MAX_BATCH), store));
    }
    return parts.flat();
  }
  if (items.length === 0) return [];
  try {
    const res = await fetch('/api/estimates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, store }),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      prices?: Record<string, number>;
      kroger?: Record<string, { productName: string | null; imageUrl: string | null; onSale: boolean }>;
    };
    const byName = body.prices ?? {};
    const fromKroger = body.kroger ?? {};
    const saved = new Date().toISOString();
    const out: PriceRow[] = [];
    const seen = new Set<string>();
    for (const w of items) {
      const cents = byName[w.canonical];
      const key = priceKey(w.canonical, store, w.qty.kind);
      if (typeof cents !== 'number' || seen.has(key)) continue;
      seen.add(key);
      const k = fromKroger[w.canonical];
      out.push(
        k
          ? {
              canonical: w.canonical, store, kind: w.qty.kind, centsPerBase: cents, source: 'kroger',
              productName: k.productName, imageUrl: krogerImageUrl(k.imageUrl), onSale: k.onSale, updatedAt: saved,
            }
          : { canonical: w.canonical, store, kind: w.qty.kind, centsPerBase: cents, source: 'ai' },
      );
    }
    return out;
  } catch {
    return [];
  }
}

/** The items per store that still need a price, de-duplicated by name and kind. */
export function groupMissing(
  wanted: { canonical: string; qty: Quantity; store: Store }[],
): Map<Store, Wanted[]> {
  const out = new Map<Store, Wanted[]>();
  const seen = new Set<string>();
  for (const w of wanted) {
    const key = priceKey(w.canonical, w.store, w.qty.kind);
    if (seen.has(key)) continue;
    seen.add(key);
    const list = out.get(w.store) ?? [];
    list.push({ canonical: w.canonical, qty: w.qty });
    out.set(w.store, list);
  }
  return out;
}
