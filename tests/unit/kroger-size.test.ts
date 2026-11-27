import { describe, expect, it } from 'vitest';
import { parseSize } from '@/lib/kroger/size';

const G_PER_OZ = 28.349523125;

describe('parseSize', () => {
  it('reads ounces and pounds as mass in grams', () => {
    expect(parseSize('16 oz')).toEqual({ amount: 16 * G_PER_OZ, kind: 'mass', base: 'g' });
    expect(parseSize('1 lb')?.amount).toBeCloseTo(453.59237);
  });
  it('reads counts', () => {
    expect(parseSize('12 ct')).toEqual({ amount: 12, kind: 'count', base: 'each' });
    expect(parseSize('1 each')).toEqual({ amount: 1, kind: 'count', base: 'each' });
  });
  it('reads volumes in millilitres', () => {
    expect(parseSize('1 gal')?.kind).toBe('volume');
    expect(parseSize('1 gal')?.amount).toBeCloseTo(3785.411784);
    expect(parseSize('64 fl oz')?.amount).toBeCloseTo(64 * 29.5735296);
  });
  it('multiplies "2 x 15 oz" packs', () => {
    expect(parseSize('2 x 15 oz')?.amount).toBeCloseTo(30 * G_PER_OZ);
    expect(parseSize('2 x 15 oz')?.kind).toBe('mass');
  });
  it('reads decimals and any case', () => {
    expect(parseSize('1.5 LB')?.amount).toBeCloseTo(1.5 * 453.59237);
  });
  it('returns null for junk', () => {
    for (const s of ['', 'large', '12', 'about 3 lb', '1 lb 4 oz', '0 oz', '16 zorks']) {
      expect(parseSize(s)).toBeNull();
    }
  });
  it('reads fractions, pack-of-size and trailing container words', () => {
    expect(parseSize('1/2 gal')?.kind).toBe('volume');
    expect(parseSize('1/2 gal')?.amount).toBeCloseTo(1892.7, 0);
    expect(parseSize('6 ct / 16.9 fl oz')?.amount).toBeCloseTo(6 * 16.9 * 29.5735296, 3);
    expect(parseSize('6 ct / 16.9 fl oz')?.kind).toBe('volume');
    expect(parseSize('5 lb bag')?.amount).toBeCloseTo(2267.96, 1);
    expect(parseSize('5 lb bag')?.kind).toBe('mass');
  });
  it('reads a bare "each" as one item', () => {
    expect(parseSize('each')).toEqual({ amount: 1, kind: 'count', base: 'each' });
    expect(parseSize('1 each')).toEqual({ amount: 1, kind: 'count', base: 'each' });
  });
  it('returns null for words and zero', () => {
    for (const s of ['', 'assorted', '0 oz']) expect(parseSize(s)).toBeNull();
  });
});
