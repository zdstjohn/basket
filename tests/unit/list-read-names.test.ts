import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listItemState, listItemStores, listPrices } from '@/lib/db/queries/list';
import { listChoices } from '@/lib/db/queries/kroger';

/** A client whose every query ends in the given rows. */
function sbWith(rows: unknown[]): SupabaseClient<never> {
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get: (_t, prop) => (prop === 'then' ? (res: (v: unknown) => void) => res({ data: rows, error: null }) : () => self),
  });
  return { from: () => self } as unknown as SupabaseClient<never>;
}

describe('rows saved before names were tidied', () => {
  it('are read under the tidy key', async () => {
    const state = await listItemState(sbWith([{ item_key: 'olive  oil', have_it: true, checked: false, outside_budget: false, pack_count: null }]) as never, 'w');
    expect(state['olive oil']?.have_it).toBe(true);
    const stores = await listItemStores(sbWith([{ canonical: 'jalapeño', store: 'costco' }]) as never, 'h');
    expect(stores.get('jalapeño')).toBe('costco');
    const prices = await listPrices(sbWith([{ canonical: 'olive  oil', store: 'fred_meyer', kind: 'volume', cents_per_base: 1, source: 'ai', updated_at: null }]) as never, 'h');
    expect(prices[0].canonical).toBe('olive oil');
    const choices = await listChoices(sbWith([{ canonical: 'olive  oil', upc: '1', search_term: null }]) as never, 'h');
    expect(choices[0].canonical).toBe('olive oil');
  });
});
