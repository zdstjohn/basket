import { describe, expect, it } from "vitest";
import {
  estimateFor,
  mealCostCents,
  priceSourceFor,
  storeFor,
  toPriceMap,
  userCentsPerBase,
  type PriceRow,
} from "@/lib/list/prices";
import type { Quantity } from "@/lib/domain/types";
import type { ScaledLine } from "@/lib/domain/scaling";

const count12: Quantity = { amount: 12, kind: 'count', base: 'each' };
const grams: Quantity = { amount: 317.5, kind: 'mass', base: 'g' };

const rows: PriceRow[] = [
  { canonical: 'corn tortillas', store: 'fred_meyer', kind: 'count', centsPerBase: 0.25, source: 'user' },
  { canonical: 'chicken', store: 'fred_meyer', kind: 'mass', centsPerBase: 1, source: 'ai' },
  { canonical: 'chicken', store: 'amazon', kind: 'mass', centsPerBase: 2, source: 'ai' },
];
const prices = toPriceMap(rows);

describe('estimateFor', () => {
  it('multiplies the cached cents per base unit by the amount and rounds', () => {
    expect(estimateFor(prices, 'corn tortillas', count12, 'fred_meyer')).toBe(3);
    expect(estimateFor(prices, 'chicken', grams, 'fred_meyer')).toBe(318);
  });
  it('uses the row for that store and kind only', () => {
    expect(estimateFor(prices, 'chicken', grams, 'amazon')).toBe(635);
    expect(estimateFor(prices, 'chicken', grams, 'costco')).toBeNull();
    expect(estimateFor(prices, 'chicken', count12, 'fred_meyer')).toBeNull();
  });
  it('is null when nothing is cached', () => {
    expect(estimateFor(prices, 'saffron', count12, 'fred_meyer')).toBeNull();
  });
});

describe('priceSourceFor', () => {
  it('says where the price came from', () => {
    expect(priceSourceFor(prices, 'corn tortillas', count12, 'fred_meyer')).toBe('user');
    expect(priceSourceFor(prices, 'chicken', grams, 'fred_meyer')).toBe('ai');
    expect(priceSourceFor(prices, 'saffron', count12, 'fred_meyer')).toBeNull();
  });
});

describe('userCentsPerBase', () => {
  it('turns the total for the current quantity into cents per base unit', () => {
    expect(userCentsPerBase(300, count12)).toBe(25);
    expect(userCentsPerBase(300, count12) * 12).toBe(300);
  });
  it('keeps a free item at zero', () => {
    expect(userCentsPerBase(0, count12)).toBe(0);
  });
});

describe('storeFor', () => {
  it('prefers the item choice, then the category, then Fred Meyer', () => {
    const items = new Map([['milk', 'costco' as const]]);
    const cats = { dairy: 'amazon', produce: 'costco' };
    expect(storeFor('milk', 'dairy', items, cats)).toBe('costco');
    expect(storeFor('cheddar', 'dairy', items, cats)).toBe('amazon');
    expect(storeFor('onion', 'bakery', items, cats)).toBe('fred_meyer');
  });
  it('ignores a category value that is not a store', () => {
    expect(storeFor('x', 'dairy', new Map(), { dairy: 'walmart' })).toBe('fred_meyer');
  });
});

describe('mealCostCents', () => {
  const line = (canonical: string, qty: Quantity): ScaledLine => ({ canonical, qty, role: 'other', sources: ['m'] });
  const fm = () => 'fred_meyer' as const;
  it('adds up every line', () => {
    expect(mealCostCents([line('corn tortillas', count12), line('chicken', grams)], fm, prices)).toBe(321);
  });
  it('is null when any line has no price', () => {
    expect(mealCostCents([line('corn tortillas', count12), line('saffron', count12)], fm, prices)).toBeNull();
  });
  it('is zero for a meal with no lines', () => {
    expect(mealCostCents([], fm, prices)).toBe(0);
  });
});
