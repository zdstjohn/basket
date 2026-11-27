import { describe, expect, it } from 'vitest';
import { addQuantities, formatNeed, formatQuantity, isVague, quantityOrCount, toQuantity } from '@/lib/domain/units';
import type { Quantity } from '@/lib/domain/types';

const q = (amount: number, unit: string): Quantity => {
  const r = toQuantity(amount, unit);
  if (!r) throw new Error(`bad unit ${unit}`);
  return r;
};

describe('toQuantity', () => {
  it('converts mass to grams', () => {
    const r = toQuantity(1, 'lb')!;
    expect(r.amount).toBeCloseTo(453.59, 1);
    expect(r.kind).toBe('mass');
    expect(r.base).toBe('g');
  });
  it('converts volume to ml', () => {
    expect(toQuantity(2, 'cups')!.amount).toBeCloseTo(473.18, 1);
    expect(toQuantity(1, 'gallon')!.amount).toBeCloseTo(3785.41, 1);
    expect(toQuantity(3, 'tbsp')!.amount).toBeCloseTo(44.36, 1);
    expect(toQuantity(1, 'FL OZ')!.amount).toBeCloseTo(29.57, 1);
  });
  it('handles count units', () => {
    expect(toQuantity(2, 'cans')).toEqual({ amount: 2, kind: 'count', base: 'each', countUnit: 'can' });
    const bare = toQuantity(1, '')!;
    expect(bare.kind).toBe('count');
    expect(bare.countUnit).toBeUndefined();
    expect(toQuantity(1, 'whole')!.countUnit).toBeUndefined();
    expect(toQuantity(2, 'bunches')!.countUnit).toBe('bunch');
  });
  it('rejects unknown units', () => {
    expect(toQuantity(1, 'smidgen')).toBeNull();
  });
  it('rejects prototype keys', () => {
    for (const k of ['constructor', 'toString', 'valueOf', '__proto__']) {
      expect(toQuantity(1, k)).toBeNull();
    }
  });
});

describe('addQuantities', () => {
  it('adds compatible quantities', () => {
    expect(addQuantities(q(2, 'cups'), q(1, 'gallon'))!.amount).toBeCloseTo(4258.6, 1);
  });
  it('refuses incompatible ones', () => {
    expect(addQuantities(q(1, 'each'), q(200, 'g'))).toBeNull();
    expect(addQuantities(q(2, 'cans'), q(1, 'bunch'))).toBeNull();
  });
});

describe('formatQuantity', () => {
  it('formats mass', () => {
    expect(formatQuantity(q(0.7, 'lb'))).toBe('11.2 oz');
    expect(formatQuantity(q(3.1, 'lb'))).toBe('3.1 lb');
  });
  it('formats volume', () => {
    expect(formatQuantity(q(2, 'cups'))).toBe('2 cups');
    expect(formatQuantity(q(1, 'cup'))).toBe('1 cup');
    expect(formatQuantity(q(2, 'gallons'))).toBe('2 gallons');
    expect(formatQuantity(q(1, 'gallon'))).toBe('1 gallon');
    expect(formatQuantity(q(0.5, 'tsp'))).toBe('0.5 tsp');
    expect(formatQuantity(q(3, 'tbsp'))).toBe('3 tbsp');
  });
  it('formats counts', () => {
    expect(formatQuantity(q(2, 'cans'))).toBe('2 cans');
    expect(formatQuantity(q(1, 'can'))).toBe('1 can');
    expect(formatQuantity(q(3, ''))).toBe('3');
    expect(formatQuantity(q(2, 'bunch'))).toBe('2 bunches');
    expect(formatQuantity(q(1, 'bunch'))).toBe('1 bunch');
    expect(formatQuantity(q(3, 'slices'))).toBe('3 slices');
    expect(formatQuantity(q(2, 'heads'))).toBe('2 heads');
  });
});

describe('quantityOrCount', () => {
  it('uses toQuantity for known units', () => {
    expect(quantityOrCount(1, 'lb')).toEqual(toQuantity(1, 'lb'));
  });

  it('falls back to a count with the trimmed lower-cased unit', () => {
    expect(quantityOrCount(2, '  Sprigs ')).toEqual({
      amount: 2,
      kind: 'count',
      base: 'each',
      countUnit: 'sprigs',
    });
  });
});

import { formatQuantityRoundedUp } from "@/lib/domain/units";

describe("formatQuantityRoundedUp", () => {
  it("rounds counts up to whole numbers", () => {
    expect(formatQuantityRoundedUp({ amount: 11.4, kind: "count", base: "each" })).toBe("12");
    expect(formatQuantityRoundedUp({ amount: 0.9, kind: "count", base: "each" })).toBe("1");
    expect(formatQuantityRoundedUp({ amount: 2.0000000001, kind: "count", base: "each" })).toBe("2");
    expect(formatQuantityRoundedUp({ amount: 1.2, kind: "count", base: "each", countUnit: "can" })).toBe("2 cans");
  });
  it("leaves weights and volumes as they were", () => {
    expect(formatQuantityRoundedUp({ amount: 453.6 * 1.2, kind: "mass", base: "g" })).toBe("1.2 lb");
  });
});

describe('isVague', () => {
  it('is true for to-taste style counts', () => {
    for (const u of ['to taste', 'pinch', 'pinches', 'dash', 'dashes', 'sprinkle', 'splash', 'drizzle', 'as needed', 'garnish', 'for garnish', 'for serving']) {
      expect(isVague(quantityOrCount(1, u))).toBe(true);
    }
  });
  it('is false for real amounts', () => {
    expect(isVague(toQuantity(1, 'tsp') as Quantity)).toBe(false);
    expect(isVague(quantityOrCount(2, 'cans'))).toBe(false);
  });
});

describe('formatNeed', () => {
  const q = quantityOrCount;
  it('joins the parts with plus signs and shows a bare vague part as its note', () => {
    expect(formatNeed([q(2.4, 'tsp'), q(1, 'to taste')])).toBe('2.4 tsp + to taste');
    expect(formatNeed([q(1, 'to taste')])).toBe('to taste');
    expect(formatNeed([q(1, ''), q(200, 'g')])).toBe('1 + 7.1 oz');
    expect(formatNeed([q(2, 'cans')])).toBe('2 cans');
  });
});

describe('unit spellings', () => {
  const mass: [string, number][] = [['lbs.', 453.59], ['LB.', 453.59], ['oz.', 28.35], ['ozs', 28.35], ['lbs', 453.59]];
  for (const [unit, grams] of mass) {
    it(`reads "${unit}" as mass`, () => {
      const r = toQuantity(1, unit)!;
      expect(r.kind).toBe('mass');
      expect(r.amount).toBeCloseTo(grams, 1);
    });
  }
  const volume: [string, number][] = [['Tbsps', 14.79], ['tbsp.', 14.79], ['tsps', 4.93], ['tsp.', 4.93], ['c.', 236.59], ['C', 236.59], ['fl. oz', 29.57], ['fl oz.', 29.57]];
  for (const [unit, ml] of volume) {
    it(`reads "${unit}" as volume`, () => {
      const r = toQuantity(1, unit)!;
      expect(r.kind).toBe('volume');
      expect(r.amount).toBeCloseTo(ml, 1);
    });
  }
  it('quantityOrCount no longer turns them into counts', () => {
    expect(quantityOrCount(2, 'lbs.').kind).toBe('mass');
    expect(quantityOrCount(3, 'Tbsps').kind).toBe('volume');
  });
  it('still returns null for unknown units', () => {
    expect(toQuantity(1, 'sprigs')).toBeNull();
    expect(toQuantity(1, 'bags')).toBeNull();
  });
});

describe('more unit spellings', () => {
  const ml = (unit: string): number | undefined => {
    const r = toQuantity(1, unit);
    return r?.kind === 'volume' ? r.amount : undefined;
  };
  it('reads quarts, pints, gallons and litres', () => {
    for (const u of ['qt', 'qts', 'quart', 'Quarts', 'qt.']) expect(ml(u)).toBeCloseTo(946.35, 1);
    for (const u of ['pt', 'pts', 'pints', 'pt.']) expect(ml(u)).toBeCloseTo(473.18, 1);
    for (const u of ['gal', 'gals', 'gallons', 'gal.']) expect(ml(u)).toBeCloseTo(3785.41, 1);
    for (const u of ['litre', 'litres', 'Liters']) expect(ml(u)).toBe(1000);
  });
  it('reads fl.oz with no space', () => {
    expect(ml('fl.oz')).toBeCloseTo(29.57, 1);
    expect(ml('fl.oz.')).toBeCloseTo(29.57, 1);
  });
  it('reads pkg and pkgs as packages', () => {
    expect(toQuantity(2, 'pkg')).toEqual({ amount: 2, kind: 'count', base: 'each', countUnit: 'package' });
    expect(toQuantity(2, 'pkgs.')!.countUnit).toBe('package');
  });
  it('reads capital T as tablespoon and small t as teaspoon, by the original case', () => {
    expect(ml('T')).toBeCloseTo(14.79, 1);
    expect(ml('T.')).toBeCloseTo(14.79, 1);
    expect(ml('t')).toBeCloseTo(4.93, 1);
    expect(ml('t.')).toBeCloseTo(4.93, 1);
    expect(ml(' T ')).toBeCloseTo(14.79, 1);
  });
  it('leaves other single letters and odd cases unknown', () => {
    expect(toQuantity(1, 'Ts')).toBeNull();
    expect(toQuantity(1, 'ts')).toBeNull();
    expect(toQuantity(1, 'x')).toBeNull();
  });
  it('reads a bare "#" as pounds, but not "#10 can"', () => {
    const r = toQuantity(2, '#')!;
    expect(r.kind).toBe('mass');
    expect(r.amount).toBeCloseTo(907.18, 1);
    expect(toQuantity(1, '#10 can')).toBeNull();
    expect(toQuantity(1, 'no.#')).toBeNull();
  });
  it('gives one count key to "pinch." and "pinch"', () => {
    expect(quantityOrCount(1, 'pinch.').countUnit).toBe('pinch');
    expect(quantityOrCount(1, ' Pinch ').countUnit).toBe('pinch');
    expect(quantityOrCount(1, 'sprigs.').countUnit).toBe('sprigs');
  });
});
