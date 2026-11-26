import { describe, expect, it } from 'vitest';
import { buildShoppingList, listTotals } from '@/lib/domain/list';
import type { ListItem, Store } from '@/lib/domain/list';
import type { ScaledLine } from '@/lib/domain/scaling';
import type { IngredientLine, Quantity, Role } from '@/lib/domain/types';
import { toQuantity } from '@/lib/domain/units';

const q = (amount: number, unit: string): Quantity => toQuantity(amount, unit)!;
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

  it('keeps different kinds apart with typed keys', () => {
    const items = buildShoppingList({
      ...base,
      scaled: [sl('onion', q(1, 'each'), 'A'), sl('onion', q(200, 'g'), 'B')],
    });
    expect(items.map((i) => i.key).sort()).toEqual(['onion#count', 'onion#mass']);
  });

  it('keys count units separately', () => {
    const items = buildShoppingList({
      ...base,
      scaled: [sl('black beans', q(0.25, 'can'), 'A'), sl('black beans', q(1, 'each'), 'B')],
    });
    expect(items.map((i) => i.key).sort()).toEqual(['black beans#count', 'black beans#count:can']);
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

  it('applies haveIt and outsideBudget by item key', () => {
    const items = buildShoppingList({
      ...base,
      haveIt: new Set(['onion#count']),
      outsideBudget: new Set(['onion#mass']),
      scaled: [sl('onion', q(1, 'each'), 'A'), sl('onion', q(200, 'g'), 'A')],
    });
    const c = items.find((i) => i.key === 'onion#count')!;
    const m = items.find((i) => i.key === 'onion#mass')!;
    expect(c).toMatchObject({ haveIt: true, outsideBudget: false });
    expect(m).toMatchObject({ haveIt: false, outsideBudget: true });
  });

  it('keeps unknown-unit staples as counts', () => {
    const items = buildShoppingList({
      ...base,
      scaled: [],
      staples: [{ canonical: 'Thyme', amount: 2, unit: 'Sprigs', role: 'produce' }],
    });
    expect(items[0].key).toBe('thyme#count:sprigs');
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
  key: 'x#count',
  canonical: 'x',
  qty: { amount: 1, kind: 'count', base: 'each' },
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
