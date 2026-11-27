import { afterEach, describe, expect, it, vi } from 'vitest';
import { favoritesCosts, toPriceMap, type PriceRow } from '@/lib/list/prices';
import type { ScaledLine } from '@/lib/domain/scaling';
import type { Quantity } from '@/lib/domain/types';

const grams = (amount: number): Quantity => ({ amount, kind: 'mass', base: 'g' });
const line = (canonical: string, amount: number): ScaledLine => ({ canonical, qty: grams(amount), role: 'other', sources: [] });
const price = (canonical: string, centsPerBase: number): PriceRow => ({ canonical, store: 'fred_meyer', kind: 'mass', centsPerBase, source: 'kroger' });
const storeOf = () => 'fred_meyer' as const;

afterEach(() => vi.unstubAllGlobals());

describe('favoritesCosts', () => {
  const meals = [
    { id: 'a', lines: [line('rice', 100), line('beans', 200)] },
    { id: 'b', lines: [line('rice', 100), line('saffron', 1)] },
    { id: 'c', lines: [line('saffron', 1)] },
  ];
  const prices = toPriceMap([price('rice', 1), price('beans', 2)]);

  it('prices a meal only when every line has a saved price', () => {
    const { costs } = favoritesCosts(meals, storeOf, prices);
    expect(costs.get('a')).toBe(500);
    expect(costs.get('b')).toBeNull();
    expect(costs.get('c')).toBeNull();
  });
  it('counts the meals that are not priced yet', () => {
    expect(favoritesCosts(meals, storeOf, prices).notPriced).toBe(2);
    expect(favoritesCosts(meals, storeOf, toPriceMap([])).notPriced).toBe(3);
    expect(favoritesCosts([], storeOf, prices).notPriced).toBe(0);
  });
  it('makes no request of any kind', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    favoritesCosts(meals, storeOf, prices);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('Favorites browser', () => {
  it('does not import the estimate requester', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile('components/FavoritesBrowser.tsx', 'utf8');
    expect(src).not.toMatch(/requestEstimates|estimates-client|\/api\/(estimates|kroger)/);
  });
});
