import { describe, expect, it } from 'vitest';
import { addQuantities, formatQuantity, toQuantity } from '@/lib/domain/units';
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
  });
});
