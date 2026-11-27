import { describe, expect, it } from 'vitest';
import { listTotals } from '@/lib/domain/list';
import type { Candidate } from '@/lib/domain/packages';
import { parseSize } from '@/lib/kroger/size';
import type { ItemState } from '@/lib/db/queries/list';
import type { Choice, MatchRow } from '@/lib/list/matches';
import type { PriceRow } from '@/lib/list/prices';
import { buildList, type ListInputs } from '@/lib/useWeekList';
import { familyOfFive } from '@/lib/fixtures/household';
import { tacos } from '@/lib/fixtures/tacos';
import { scaleMeal } from '@/lib/domain/scaling';
import { weekEntries } from '@/lib/list/entries';
import { tacosRow, wm } from './leftover-fixtures';

const LOC = '70100023';
const flags = (o: Partial<ItemState> = {}): ItemState => ({ have_it: false, checked: false, outside_budget: false, ...o });

const cand = (upc: string, sizeText: string, regularCents: number, over: Partial<Candidate> = {}): Candidate => ({
  upc,
  name: `Product ${upc}`,
  brand: null,
  sizeText,
  size: parseSize(sizeText),
  soldBy: 'UNIT',
  regularCents,
  promoCents: null,
  imageUrl: null,
  relevant: true,
  inStock: true,
  ...over,
});
const match = (canonical: string, candidates: Candidate[], over: Partial<MatchRow> = {}): MatchRow => ({
  canonical,
  locationId: LOC,
  term: canonical,
  candidates,
  fetchedAt: new Date().toISOString(),
  ...over,
});
const price = (canonical: string, source: PriceRow['source'], centsPerBase = 1, store: PriceRow['store'] = 'fred_meyer'): PriceRow => ({
  canonical,
  store,
  kind: 'mass',
  centsPerBase,
  source,
});

const base = (over: Partial<ListInputs> = {}): ListInputs => ({
  entries: [],
  people: [],
  staples: [
    { canonical: 'olive oil', amount: 1.9, unit: 'tbsp', role: 'pantry' },
    { canonical: 'chicken thighs', amount: 11.2, unit: 'oz', role: 'meat' },
    { canonical: 'black beans', amount: 2, unit: 'cans', role: 'veg_protein' },
  ],
  alwaysHave: [],
  itemState: {},
  itemStores: [],
  categoryStore: {},
  prices: [],
  matches: [],
  choices: [],
  locationId: LOC,
  ...over,
});

const OIL = match('olive oil', [cand('0000000000001', '16.9 fl oz', 799, { promoCents: 699 })]);
const CHICKEN = match('chicken thighs', [cand('0000000000002', '1 lb', 399, { soldBy: 'WEIGHT' })]);
const BEANS = match('black beans', [cand('0000000000003', '15 oz', 125), cand('0000000000004', '15 oz', 200)]);
const all = [OIL, CHICKEN, BEANS];
const byKey = (b: ReturnType<typeof buildList>, k: string) => b.items.find((i) => i.key === k)!;

describe('buildList in product mode', () => {
  it('prices the whole package, not the fraction used', () => {
    const b = buildList(base({ matches: all }));
    expect(b.productMode).toBe(true);
    expect(byKey(b, 'olive oil').estimateCents).toBe(699);
    expect(b.products['olive oil'].pick?.count).toBe(1);
  });

  it('prices by-the-pound meat at the shelf price and marks it approximate', () => {
    const b = buildList(base({ matches: all }));
    expect(byKey(b, 'chicken thighs').estimateCents).toBe(399);
    expect(b.products['chicken thighs'].pick?.approx).toBe(true);
  });

  it('buys one package per can', () => {
    const b = buildList(base({ matches: all }));
    expect(byKey(b, 'black beans').estimateCents).toBe(250);
    expect(b.products['black beans'].pick?.count).toBe(2);
  });

  it('follows the saved package count', () => {
    const b = buildList(base({ matches: all, itemState: { 'black beans': { ...flags(), pack_count: 3 } } }));
    expect(byKey(b, 'black beans').estimateCents).toBe(375);
  });

  it("uses the household's remembered product", () => {
    const choices: Choice[] = [{ canonical: 'black beans', upc: '0000000000004', searchTerm: null }];
    const b = buildList(base({ matches: all, choices }));
    expect(b.products['black beans'].pick?.candidate.upc).toBe('0000000000004');
    expect(byKey(b, 'black beans').estimateCents).toBe(400);
  });

  it('never guesses: no match means no price, even with an AI price saved', () => {
    const b = buildList(base({ matches: [], prices: [price('olive oil', 'ai')] }));
    expect(byKey(b, 'olive oil').estimateCents).toBeNull();
    expect(b.products['olive oil']).toBeUndefined();
  });

  it('a match with no candidates has no price either', () => {
    const b = buildList(base({ matches: [match('olive oil', [])], prices: [price('olive oil', 'ai')] }));
    expect(byKey(b, 'olive oil').estimateCents).toBeNull();
    expect(b.products['olive oil'].pick).toBeNull();
  });

  it('keeps a price you typed when there is no product', () => {
    const typed: PriceRow = { canonical: 'olive oil', store: 'fred_meyer', kind: 'volume', centsPerBase: 5, source: 'user' };
    const b = buildList(base({ matches: [], prices: [typed] }));
    expect(byKey(b, 'olive oil').estimateCents).toBe(Math.round(5 * byKey(b, 'olive oil').qty.amount));
  });

  it('ignores matches from another store', () => {
    const b = buildList(base({ matches: [match('olive oil', OIL.candidates, { locationId: 'other' })] }));
    expect(byKey(b, 'olive oil').estimateCents).toBeNull();
  });

  it('totals add up the package prices, leaving out have-it and outside-budget foods', () => {
    const b = buildList(base({ matches: all, itemState: { 'olive oil': flags({ have_it: true }), 'black beans': flags({ outside_budget: true }) } }));
    expect(listTotals(b.items).totalCents).toBe(399);
    expect(listTotals(buildList(base({ matches: all })).items).totalCents).toBe(699 + 399 + 250);
  });
});

describe('buildList prices at the other stores', () => {
  const amazon = { itemStores: [['olive oil', 'amazon']] as ListInputs['itemStores'] };
  it('an AI price on Amazon is not a price', () => {
    const b = buildList(base({ ...amazon, prices: [{ ...price('olive oil', 'ai'), store: 'amazon', kind: 'volume' }] }));
    expect(byKey(b, 'olive oil').estimateCents).toBeNull();
    expect(b.priceSource['olive oil']).toBeUndefined();
  });
  it('a price you typed counts', () => {
    const typed: PriceRow = { canonical: 'olive oil', store: 'amazon', kind: 'volume', centsPerBase: 2, source: 'user' };
    const b = buildList(base({ ...amazon, prices: [typed] }));
    expect(byKey(b, 'olive oil').estimateCents).toBe(Math.round(2 * byKey(b, 'olive oil').qty.amount));
    expect(b.priceSource['olive oil']).toBe('user');
  });
});

describe('buildList with no store chosen', () => {
  it('keeps the old estimates', () => {
    const prices: PriceRow[] = [{ canonical: 'olive oil', store: 'fred_meyer', kind: 'volume', centsPerBase: 2, source: 'ai' }];
    const b = buildList(base({ locationId: null, matches: all, prices }));
    expect(b.productMode).toBe(false);
    expect(byKey(b, 'olive oil').estimateCents).toBe(Math.round(2 * byKey(b, 'olive oil').qty.amount));
    expect(b.priceSource['olive oil']).toBe('ai');
    expect(b.products).toEqual({});
  });
});

describe('buildList reads an old cache', () => {
  it('builds without matches, choices or a store', () => {
    const old = base() as Partial<ListInputs>;
    delete old.matches;
    delete old.choices;
    delete old.locationId;
    const b = buildList(old as ListInputs);
    expect(b.productMode).toBe(false);
    expect(b.items).toHaveLength(3);
  });
});

describe('leftover nights and the list', () => {
  const people = familyOfFive;
  const mealsMap = new Map([[tacosRow.id, tacosRow]]);
  const cook7_6 = wm('a', 'wed', tacosRow.id, { servings_override: 7.6 });
  const leftoverFri = wm('b', 'fri', tacosRow.id, { servings_override: 0, leftover_of: 'a' });
  const inputs = (entries: ListInputs['entries']): ListInputs => base({ entries, people, staples: [] });
  const grams = (i: { qty: { amount: number } }) => i.qty.amount;
  const row = (b: ReturnType<typeof buildList>, food: string) => byKey(b, food);

  it('cook double scales every food (and the swap) by two before packing, and the leftovers night adds nothing', () => {
    const single = buildList(inputs([{ meal: tacos, servings: null }]));
    const doubled = buildList(inputs(weekEntries([cook7_6, leftoverFri], mealsMap)));
    // The list rounds counts (cans, onions) up to whole ones, so exact doubling is checked on the scaled
    // amounts that feed it, and on the mass row of the finished list.
    const once = scaleMeal(tacos, people);
    const twice = scaleMeal(tacos, people, 7.6);
    for (const food of ['boneless chicken thighs', 'black beans', 'yellow onion', 'corn tortillas']) {
      const a = once.find((l) => l.canonical === food)!;
      const b = twice.find((l) => l.canonical === food)!;
      expect(b.qty.amount).toBeCloseTo(2 * a.qty.amount, 6);
    }
    expect(grams(row(doubled, 'boneless chicken thighs'))).toBeCloseTo(2 * grams(row(single, 'boneless chicken thighs')), 3);
    for (const food of ['black beans', 'yellow onion', 'corn tortillas']) {
      expect(grams(row(doubled, food))).toBe(Math.ceil(twice.find((l) => l.canonical === food)!.qty.amount - 1e-9));
    }
    expect(doubled.items).toHaveLength(single.items.length);
  });

  it('a cook-double week buys exactly what two separate dinners of that meal buy, row by row, and costs the same', () => {
    const prices = [
      match('boneless chicken thighs', [cand('0000000000011', '1 lb', 399, { soldBy: 'WEIGHT' })]),
      match('black beans', [cand('0000000000012', '15 oz', 125)]),
      match('yellow onion', [cand('0000000000013', '1 each', 100)]),
      match('corn tortillas', [cand('0000000000014', '12 each', 250)]),
    ];
    const withPrices = (entries: ListInputs['entries']): ListInputs => base({ entries, people, staples: [], matches: prices });
    const cookDoubleWeek = buildList(withPrices(weekEntries([cook7_6, leftoverFri], mealsMap)));
    const twoDinners = buildList(withPrices([{ meal: tacos, servings: null }, { meal: tacos, servings: null }]));
    const rows = (b: ReturnType<typeof buildList>) => b.items.map((i) => [i.key, i.qty.amount, i.qty.kind]).sort();
    expect(rows(cookDoubleWeek)).toEqual(rows(twoDinners));
    const amt = (food: string) => cookDoubleWeek.items.find((i) => i.key === food)!.qty.amount;
    expect(Math.round(amt('boneless chicken thighs'))).toBe(635);
    expect([amt('black beans'), amt('yellow onion'), amt('corn tortillas')]).toEqual([1, 2, 23]);
    expect(cookDoubleWeek.items.map((i) => i.estimateCents)).toEqual(twoDinners.items.map((i) => i.estimateCents));
    expect(listTotals(cookDoubleWeek.items).totalCents).toBe(listTotals(twoDinners.items).totalCents);
    expect(listTotals(cookDoubleWeek.items).totalCents).toBeGreaterThan(listTotals(buildList(withPrices([{ meal: tacos, servings: null }])).items).totalCents);
  });

  it('a phone on the last release adds nothing for a leftovers night either', () => {
    const old = buildList(inputs([{ meal: tacos, servings: 7.6 }, { meal: tacos, servings: 0 }]));
    const now = buildList(inputs([{ meal: tacos, servings: 7.6 }]));
    expect(old.items.map((i) => [i.key, i.parts])).toEqual(now.items.map((i) => [i.key, i.parts]));
  });
});
