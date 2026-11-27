import { describe, expect, it } from 'vitest';
import { perBase, offerFor, packagesNeeded, poolOf, recommend, type Candidate } from '@/lib/domain/packages';
import { quantityOrCount } from '@/lib/domain/units';
import { parseSize } from '@/lib/kroger/size';
import type { Quantity } from '@/lib/domain/types';

const q = (amount: number, unit: string): Quantity => quantityOrCount(amount, unit);
const size = (s: string): Quantity | null => parseSize(s);

describe('packagesNeeded', () => {
  const rows: [string, Quantity[], string | null, number][] = [
    ['honey', [q(1.9, 'tbsp')], '12 oz', 1],
    ['chicken broth', [q(3.8, 'cups')], '32 fl oz', 1],
    ['chicken broth', [q(4.5, 'cups')], '32 fl oz', 2],
    ['chicken broth', [q(3.8, 'cups')], '14.5 oz', 3],
    ['kosher salt', [q(2.4, 'tsp'), q(1, 'to taste')], '3 lb', 1],
    ['kosher salt', [q(1, 'to taste')], '3 lb', 1],
    ['black beans', [q(2, 'cans')], '15 oz', 2],
    ['yellow onion', [q(3, '')], '3 lb', 1],
    ['yellow onion', [q(3, '')], '1 lb', 2],
    ['yellow onion', [q(200, 'g')], '1 each', 1],
    ['boneless chicken thighs', [q(1.5, 'lb')], '1 lb', 2],
    ['eggs', [q(18, '')], '12 ct', 2],
    ['garlic', [q(3, 'cloves')], '1 ct', 1],
    ['milk', [q(1, 'gallon')], null, 1],
    ['rice', [q(500, 'lb')], '1 lb', 99],
    ['flour', [], '5 lb', 1],
    // I2: light foods and unknown item weights
    ['baby spinach', [q(4, 'cups')], '5 oz', 1],
    ['shredded cheese', [q(2, 'cups')], '8 oz', 1],
    ['hamburger buns', [q(8, '')], '12 oz', 1],
    ['dragonfruit', [q(3, '')], '1 lb', 1],
    // dozens and composite foods
    ['eggs', [q(2, 'dozen')], '12 ct', 2],
    ['pasta sauce', [q(4, 'cups')], '24 oz', 2],
    ['tomato paste', [q(2, '')], '6 oz', 1],
    // M6: plural container units
    ['ketchup', [q(2, 'bottles')], '20 oz', 2],
    ['spinach', [q(2, 'bags')], '5 oz', 2],
    ['crackers', [q(3, 'boxes')], '12 oz', 3],
    ['cilantro', [q(2, 'sprigs'), q(1, 'leaves'), q(2, 'stalks'), q(1, 'slices')], '1 ct', 1],
  ];
  for (const [name, parts, sz, want] of rows) {
    it(`${name} ${parts.map((p) => `${p.amount.toFixed(1)}${p.countUnit ?? p.base}`).join('+') || '(none)'} vs ${sz}`, () => {
      expect(packagesNeeded(name, parts, sz === null ? null : size(sz))).toBe(want);
    });
  }
  it('counts nothing for sprigs and cloves even against a heavy item', () => {
    expect(packagesNeeded('garlic', [q(20, 'cloves'), q(2, 'tsp')], size('1 lb'))).toBe(1);
  });
});

const cand = (over: Partial<Candidate> & { upc: string }): Candidate => ({
  name: 'Thing',
  brand: null,
  sizeText: '',
  size: null,
  soldBy: 'UNIT',
  regularCents: 100,
  promoCents: null,
  imageUrl: null,
  relevant: true,
  inStock: true,
  ...over,
});
const withSize = (upc: string, sizeText: string, regularCents: number, over: Partial<Candidate> = {}): Candidate =>
  cand({ upc, sizeText, size: size(sizeText), regularCents, ...over });
const upcs = (...ns: number[]) => ns.map((n) => String(n).padStart(13, '0'));

describe('recommend', () => {
  const [a, b] = upcs(1, 2);
  const A = withSize(a, '16 oz', 249);
  const need = [q(20, 'oz')];
  // B2 is 32 oz, so one covers the 20 oz need.
  const B2 = withSize(b, '32 oz', 399);

  it('picks the cheapest total and lists options cheapest first', () => {
    const r = recommend('rice', need, [A, B2]);
    expect(r.pick?.candidate.upc).toBe(b);
    expect(r.pick?.count).toBe(1);
    expect(r.pick?.totalCents).toBe(399);
    expect(r.options.map((o) => o.candidate.upc)).toEqual([b, a]);
    expect(r.cheapestUpc).toBe(b);
    expect(r.usualMissing).toBe(false);
  });
  it('prefers the sale on equal totals', () => {
    const x = withSize(upcs(3)[0], '16 oz', 349, { promoCents: 299 });
    const y = withSize(upcs(4)[0], '16 oz', 299);
    const r = recommend('rice', [q(10, 'oz')], [y, x]);
    expect(r.pick?.candidate.upc).toBe(x.upc);
    expect(r.pick?.onSale).toBe(true);
  });
  it('unitCents and onSale without a promo', () => {
    const o = offerFor('rice', need, A);
    expect(o.onSale).toBe(false);
    expect(o.unitCents).toBe(249);
    expect(o.approx).toBe(false);
    expect(o.count).toBe(2);
    expect(o.totalCents).toBe(498);
  });
  it('uses the promo as the unit price', () => {
    const o = offerFor('rice', need, { ...A, promoCents: 199 });
    expect(o.unitCents).toBe(199);
    expect(o.onSale).toBe(true);
  });
  it('never picks irrelevant when a relevant one exists', () => {
    const cheapJunk = withSize(upcs(5)[0], '32 oz', 50, { relevant: false });
    expect(recommend('rice', need, [cheapJunk, A]).pick?.candidate.upc).toBe(a);
  });
  it('pools the first 3 when none is relevant', () => {
    const cs = upcs(1, 2, 3, 4).map((u, i) => withSize(u, '32 oz', 400 - i * 100, { relevant: false }));
    expect(poolOf(cs).map((c) => c.upc)).toEqual(upcs(1, 2, 3));
  });
  it('pools the first 5 relevant', () => {
    const cs = upcs(1, 2, 3, 4, 5, 6).map((u, i) => withSize(u, '32 oz', 600 - i * 10));
    expect(poolOf(cs).map((c) => c.upc)).toEqual(upcs(1, 2, 3, 4, 5));
    const r = recommend('rice', need, cs);
    expect(r.pick?.candidate.upc).toBe(upcs(5)[0]);
    expect(r.options).toHaveLength(5);
  });
  it('picks out of stock only when everything is', () => {
    const out = withSize(upcs(7)[0], '32 oz', 100, { inStock: false });
    expect(recommend('rice', need, [out, A]).pick?.candidate.upc).toBe(a);
    expect(recommend('rice', need, [out, { ...A, inStock: false }]).pick?.candidate.upc).toBe(out.upc);
  });
  it('honours the usual product', () => {
    const r = recommend('rice', need, [A, B2], { chosenUpc: a });
    expect(r.pick?.candidate.upc).toBe(a);
    expect(r.pick?.count).toBe(2);
    expect(r.pick?.totalCents).toBe(498);
    expect(r.options.map((o) => o.candidate.upc)).toEqual([b, a]);
    expect(r.cheapestUpc).toBe(b);
  });
  it('adds a usual product from outside the pool', () => {
    const cs = upcs(1, 2, 3, 4, 5, 6).map((u, i) => withSize(u, '32 oz', 600 - i * 10));
    const r = recommend('rice', need, cs, { chosenUpc: upcs(6)[0] });
    expect(r.pick?.candidate.upc).toBe(upcs(6)[0]);
    expect(r.options.some((o) => o.candidate.upc === upcs(6)[0])).toBe(true);
    expect(r.options.length).toBeLessThanOrEqual(5);
  });
  it('reports a missing usual product', () => {
    const r = recommend('rice', need, [A, B2], { chosenUpc: '0000000000000' });
    expect(r.pick?.candidate.upc).toBe(b);
    expect(r.usualMissing).toBe(true);
  });
  it('takes a valid count and ignores 0 or 100', () => {
    expect(recommend('rice', need, [A], { count: 3 }).pick).toMatchObject({ count: 3, totalCents: 747 });
    expect(recommend('rice', need, [A], { count: 0 }).pick?.count).toBe(2);
    expect(recommend('rice', need, [A], { count: 100 }).pick?.count).toBe(2);
  });
  it('sells by the pound', () => {
    const w = withSize(upcs(8)[0], '1 lb', 399, { soldBy: 'WEIGHT' });
    const r = recommend('salmon', [q(11.2, 'oz')], [w]);
    expect(r.pick).toMatchObject({ count: 1, totalCents: 399, approx: true });
  });
  it('handles no candidates', () => {
    expect(recommend('rice', need, [])).toEqual({ pick: null, options: [], cheapestUpc: null, usualMissing: false });
  });
  it('always makes whole packages and whole cents', () => {
    const cs = [A, B2, withSize(upcs(9)[0], '1 lb', 399, { soldBy: 'WEIGHT', promoCents: 301 })];
    for (const o of recommend('rice', [q(37, 'oz')], cs).options) {
      expect(Number.isInteger(o.count) && o.count >= 1).toBe(true);
      expect(Number.isInteger(o.totalCents) && o.totalCents > 0).toBe(true);
    }
  });
});

describe('perBase', () => {
  it('prices honey per ml', () => {
    const c = withSize(upcs(1)[0], '12 oz', 599);
    const r = perBase('honey', 'volume', [c]);
    expect(r?.candidate.upc).toBe(c.upc);
    expect(r?.centsPerBase).toBeCloseTo(599 / (340.19 / 1.42), 2);
  });
  it('prices eggs per gram at 50 g each', () => {
    const c = withSize(upcs(2)[0], '12 ct', 299);
    expect(perBase('eggs', 'mass', [c])?.centsPerBase).toBeCloseTo(299 / (12 * 50), 6);
  });
  it('prices by-the-pound items per gram', () => {
    const c = withSize(upcs(3)[0], '1 lb', 399, { soldBy: 'WEIGHT' });
    expect(perBase('salmon', 'mass', [c])?.centsPerBase).toBeCloseTo(399 / 453.59237, 6);
  });
  it('takes the cheapest and null with nothing readable', () => {
    const dear = withSize(upcs(4)[0], '16 oz', 500);
    const cheap = withSize(upcs(5)[0], '16 oz', 300);
    expect(perBase('rice', 'mass', [dear, cheap])?.candidate.upc).toBe(cheap.upc);
    expect(perBase('milk', 'volume', [])).toBeNull();
    expect(perBase('milk', 'volume', [cand({ upc: upcs(6)[0] })])).toBeNull();
  });
});
