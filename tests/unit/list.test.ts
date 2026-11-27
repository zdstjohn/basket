import { describe, expect, it } from 'vitest';
import { buildShoppingList, listTotals } from '@/lib/domain/list';
import type { ListItem, Store } from '@/lib/domain/list';
import type { ScaledLine } from '@/lib/domain/scaling';
import type { IngredientLine, Quantity, Role } from '@/lib/domain/types';
import { formatQuantity, quantityOrCount } from '@/lib/domain/units';

const q = (amount: number, unit: string): Quantity => quantityOrCount(amount, unit);
const sl = (canonical: string, qty: Quantity, source: string, role: Role = 'other'): ScaledLine => ({
  canonical,
  qty,
  role,
  sources: [source],
});

const base = {
  staples: [] as IngredientLine[],
  alwaysHave: [] as string[],
  haveIt: new Set<string>(),
  outsideBudget: new Set<string>(),
  storeFor: (): Store => 'fred_meyer',
  estimateFor: (): number | null => 100,
};

describe('buildShoppingList', () => {
  it('merges meals and staples into one item', () => {
    const items = buildShoppingList({
      ...base,
      scaled: [sl('milk', q(1, 'cup'), 'A', 'dairy'), sl('milk', q(1, 'cup'), 'B', 'dairy')],
      staples: [{ canonical: 'milk', amount: 1, unit: 'gallon', role: 'dairy' }],
    });
    expect(items).toHaveLength(1);
    expect(items[0].qty.amount).toBeCloseTo(4258.6, 1);
    expect(items[0].sources).toEqual(['A', 'B', 'Staples']);
  });

  it('puts one food in one row, with a part for each kind of amount', () => {
    const items = buildShoppingList({
      ...base,
      scaled: [sl('onion', q(1, 'each'), 'A'), sl('onion', q(200, 'g'), 'B')],
    });
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe('onion');
    expect(items[0].parts.map(formatQuantity)).toEqual(['1', '7.1 oz']);
    expect(items[0].qty).toMatchObject({ kind: 'count', amount: 1 });
  });

  it('keeps count units as separate parts of the same row', () => {
    const items = buildShoppingList({
      ...base,
      scaled: [sl('black beans', q(0.25, 'can'), 'A'), sl('black beans', q(1, 'each'), 'B')],
    });
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe('black beans');
    expect(items[0].parts.map(formatQuantity)).toEqual(['1', '1 can']);
  });

  it('orders parts: plain counts, named counts, mass, volume, vague last', () => {
    const items = buildShoppingList({
      ...base,
      scaled: [
        sl('x', q(1, 'to taste'), 'A'),
        sl('x', q(1, 'cup'), 'A'),
        sl('x', q(100, 'g'), 'A'),
        sl('x', q(2, 'jar'), 'A'),
        sl('x', q(1, 'can'), 'A'),
        sl('x', q(3, ''), 'A'),
      ],
    });
    expect(items[0].parts.map(formatQuantity)).toEqual(['3', '1 can', '2 jars', '3.5 oz', '1 cup', '1 to taste']);
  });

  it('joins an amount and a "to taste" from two meals into one row', () => {
    const items = buildShoppingList({
      ...base,
      scaled: [sl('kosher salt', q(2.4, 'tsp'), 'Meal A'), sl('kosher salt', q(1, 'to taste'), 'Meal B')],
    });
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe('kosher salt');
    expect(items[0].parts.map(formatQuantity)).toEqual(['2.4 tsp', '1 to taste']);
    expect(items[0].qty.kind).toBe('volume');
    expect(items[0].sources).toEqual(['Meal A', 'Meal B']);
  });

  it('uses the first part when every part is vague', () => {
    const items = buildShoppingList({ ...base, scaled: [sl('pepper', q(1, 'to taste'), 'A')] });
    expect(items[0].qty).toMatchObject({ countUnit: 'to taste' });
  });

  it('prices a merged row as the sum of its priced parts, or null when none is priced', () => {
    const priced = buildShoppingList({
      ...base,
      scaled: [sl('kosher salt', q(2.4, 'tsp'), 'A'), sl('kosher salt', q(1, 'to taste'), 'B')],
      estimateFor: (_c, qty) => (qty.kind === 'volume' ? 50 : 299),
    });
    expect(priced[0].estimateCents).toBe(349);
    const none = buildShoppingList({
      ...base,
      scaled: [sl('kosher salt', q(2.4, 'tsp'), 'A'), sl('kosher salt', q(1, 'to taste'), 'B')],
      estimateFor: () => null,
    });
    expect(none[0].estimateCents).toBeNull();
    const one = buildShoppingList({
      ...base,
      scaled: [sl('kosher salt', q(2.4, 'tsp'), 'A'), sl('kosher salt', q(1, 'to taste'), 'B')],
      estimateFor: (_c, qty) => (qty.kind === 'volume' ? 50 : null),
    });
    expect(one[0].estimateCents).toBe(50);
  });

  it('a typed price for the row alone is the whole total; guesses for other parts are not added', () => {
    const calls: string[] = [];
    const items = buildShoppingList({
      ...base,
      scaled: [sl('onion', q(1, 'each'), 'A'), sl('onion', q(200, 'g'), 'B')],
      estimateFor: (_c, qty) => (qty.kind === 'count' ? 100 : 250),
      userCents: (_c, qty) => {
        calls.push(qty.kind);
        return qty.kind === 'count' ? 120 : null;
      },
    });
    expect(items[0].estimateCents).toBe(120);
    expect(calls).toEqual(['count']);
  });

  it('falls back to the parts when the typed price is for another kind', () => {
    const items = buildShoppingList({
      ...base,
      scaled: [sl('onion', q(1, 'each'), 'A'), sl('onion', q(200, 'g'), 'B')],
      estimateFor: (_c, qty) => (qty.kind === 'count' ? 100 : 250),
      userCents: (_c, qty) => (qty.kind === 'mass' ? 999 : null),
    });
    expect(items[0].estimateCents).toBe(350);
  });

  it('rounds counts up with tolerance, not mass', () => {
    const items = buildShoppingList({
      ...base,
      scaled: [
        sl('corn tortillas', q(11.4, 'each'), 'A'),
        sl('black beans', q(0.25, 'can'), 'A'),
        sl('eggs', q(2.0000000001, 'each'), 'A'),
        sl('flour', q(100.5, 'g'), 'A'),
      ],
    });
    const by = (c: string) => items.find((i) => i.canonical === c)!.qty.amount;
    expect(by('corn tortillas')).toBe(12);
    expect(by('black beans')).toBe(1);
    expect(by('eggs')).toBe(2);
    expect(by('flour')).toBe(100.5);
  });

  it('trims and lower-cases names before merging', () => {
    const items = buildShoppingList({
      ...base,
      scaled: [sl('Milk ', q(1, 'cup'), 'A'), sl('milk', q(1, 'cup'), 'A')],
      staples: [{ canonical: ' MILK', amount: 1, unit: 'cup', role: 'dairy' }],
    });
    expect(items).toHaveLength(1);
    expect(items[0].canonical).toBe('milk');
    expect(items[0].sources).toEqual(['A', 'Staples']);
  });

  it('marks always-have items needed by a meal or staple', () => {
    const items = buildShoppingList({
      ...base,
      alwaysHave: ['Salt'],
      scaled: [sl('salt', q(1, 'tsp'), 'A', 'pantry')],
    });
    expect(items[0]).toMatchObject({ canonical: 'salt', alwaysHave: true, haveIt: true });
  });

  it('does not create items for always-have entries nothing needs', () => {
    const items = buildShoppingList({
      ...base,
      alwaysHave: ['salt', 'pepper'],
      scaled: [sl('milk', q(1, 'cup'), 'A')],
    });
    expect(items.map((i) => i.canonical)).toEqual(['milk']);
    expect(items[0].alwaysHave).toBe(false);
  });

  it('applies haveIt and outsideBudget by food', () => {
    const items = buildShoppingList({
      ...base,
      haveIt: new Set(['onion', 'kosher salt']),
      outsideBudget: new Set(['garlic']),
      scaled: [
        sl('onion', q(1, 'each'), 'A'),
        sl('onion', q(200, 'g'), 'A'),
        sl('garlic', q(1, 'head'), 'A'),
        sl('kosher salt', q(2.4, 'tsp'), 'A'),
        sl('kosher salt', q(1, 'to taste'), 'B'),
      ],
    });
    const by = (k: string) => items.find((i) => i.key === k)!;
    expect(by('onion')).toMatchObject({ haveIt: true, outsideBudget: false });
    expect(by('garlic')).toMatchObject({ haveIt: false, outsideBudget: true });
    expect(by('kosher salt').haveIt).toBe(true);
  });

  it('keeps unknown-unit staples as counts', () => {
    const items = buildShoppingList({
      ...base,
      scaled: [],
      staples: [{ canonical: 'Thyme', amount: 2, unit: 'Sprigs', role: 'produce' }],
    });
    expect(items[0].key).toBe('thyme');
    expect(items[0].qty.amount).toBe(2);
    expect(items[0].sources).toEqual(['Staples']);
  });

  it('calls storeFor and estimateFor once per merged item after rounding', () => {
    const calls: [string, Quantity, Store][] = [];
    const items = buildShoppingList({
      ...base,
      scaled: [sl('tortillas', q(5.5, 'each'), 'A'), sl('tortillas', q(5.5, 'each'), 'B')],
      storeFor: () => 'costco',
      estimateFor: (c, qty, s) => {
        calls.push([c, qty, s]);
        return 777;
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0][1].amount).toBe(11);
    expect(calls[0][2]).toBe('costco');
    expect(items[0]).toMatchObject({ store: 'costco', estimateCents: 777 });
  });

  it('orders by store, role, then name', () => {
    const stores: Record<string, Store> = { z: 'amazon', y: 'costco', a: 'fred_meyer', b: 'fred_meyer', c: 'fred_meyer' };
    const items = buildShoppingList({
      ...base,
      storeFor: (c) => stores[c],
      scaled: [
        sl('z', q(1, 'each'), 'A', 'meat'),
        sl('y', q(1, 'each'), 'A', 'meat'),
        sl('c', q(1, 'each'), 'A', 'pantry'),
        sl('b', q(1, 'each'), 'A', 'meat'),
        sl('a', q(1, 'each'), 'A', 'produce'),
      ],
    });
    expect(items.map((i) => i.canonical)).toEqual(['b', 'a', 'c', 'z', 'y']);
  });
});

const item = (over: Partial<ListItem>): ListItem => ({
  key: 'x',
  canonical: 'x',
  qty: { amount: 1, kind: 'count', base: 'each' },
  parts: [{ amount: 1, kind: 'count', base: 'each' }],
  role: 'other',
  store: 'fred_meyer',
  estimateCents: 100,
  haveIt: false,
  alwaysHave: false,
  outsideBudget: false,
  sources: [],
  ...over,
});

describe('listTotals', () => {
  it('applies the haveIt and outsideBudget rules', () => {
    const t = listTotals([
      item({ estimateCents: 500 }),
      item({ estimateCents: 300, store: 'amazon' }),
      item({ estimateCents: 200, haveIt: true }),
      item({ estimateCents: 400, outsideBudget: true, store: 'costco' }),
      item({ estimateCents: null }),
      item({ estimateCents: null, haveIt: true }),
    ]);
    expect(t.totalCents).toBe(800);
    expect(t.byStore.fred_meyer).toEqual({ cents: 500, count: 2 });
    expect(t.byStore.amazon).toEqual({ cents: 300, count: 1 });
    expect(t.byStore.costco).toEqual({ cents: 400, count: 1 });
    expect(t.missingEstimates).toBe(1);
  });

  it('always has all three stores', () => {
    const t = listTotals([]);
    expect(t).toEqual({
      totalCents: 0,
      byStore: {
        fred_meyer: { cents: 0, count: 0 },
        amazon: { cents: 0, count: 0 },
        costco: { cents: 0, count: 0 },
      },
      missingEstimates: 0,
    });
  });
});

describe('food names', () => {
  it('merges names that differ only in spacing or Unicode form', () => {
    const items = buildShoppingList({
      ...base,
      scaled: [
        sl('olive  oil', q(1, 'tbsp'), 'A'),
        sl(' Olive oil ', q(1, 'tbsp'), 'B'),
        sl('jalapeño', q(1, ''), 'A'),
        sl('jalapeño', q(1, ''), 'B'),
      ],
    });
    expect(items.map((i) => i.key).sort()).toEqual(['jalapeño', 'olive oil']);
    expect(items.find((i) => i.key === 'jalapeño')!.qty.amount).toBe(2);
  });
  it('keeps plurals apart: the key is the food name', () => {
    const items = buildShoppingList({
      ...base,
      scaled: [sl('tomato', q(1, ''), 'A'), sl('tomatoes', q(1, ''), 'B')],
    });
    expect(items.map((i) => i.key).sort()).toEqual(['tomato', 'tomatoes']);
  });
  it('matches saved flags and always-have names written the tidy way', () => {
    const items = buildShoppingList({
      ...base,
      scaled: [sl('olive  oil', q(1, 'tbsp'), 'A'), sl('black  pepper', q(1, 'tsp'), 'A')],
      haveIt: new Set(['olive oil']),
      alwaysHave: ['Black   Pepper'],
    });
    expect(items.every((i) => i.haveIt)).toBe(true);
  });
});
