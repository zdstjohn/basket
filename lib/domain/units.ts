import type { Quantity } from './types';

const G_PER_OZ = 28.349523125;
const G_PER_LB = 453.59237;
const ML_PER_TSP = 4.92892159;
const ML_PER_TBSP = 14.78676478;
const ML_PER_FLOZ = 29.5735296;
const ML_PER_CUP = 236.5882365;
const ML_PER_PINT = 473.176473;
const ML_PER_QUART = 946.352946;
const ML_PER_GALLON = 3785.411784;

const MASS: Record<string, number> = {
  g: 1, gram: 1, grams: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
  oz: G_PER_OZ, ounce: G_PER_OZ, ounces: G_PER_OZ,
  lb: G_PER_LB, lbs: G_PER_LB, pound: G_PER_LB, pounds: G_PER_LB,
};

const VOLUME: Record<string, number> = {
  ml: 1, milliliter: 1, milliliters: 1,
  l: 1000, liter: 1000, liters: 1000,
  tsp: ML_PER_TSP, teaspoon: ML_PER_TSP, teaspoons: ML_PER_TSP,
  tbsp: ML_PER_TBSP, tablespoon: ML_PER_TBSP, tablespoons: ML_PER_TBSP,
  'fl oz': ML_PER_FLOZ, 'fluid ounce': ML_PER_FLOZ, 'fluid ounces': ML_PER_FLOZ,
  cup: ML_PER_CUP, cups: ML_PER_CUP,
  pint: ML_PER_PINT, pints: ML_PER_PINT,
  quart: ML_PER_QUART, quarts: ML_PER_QUART,
  gallon: ML_PER_GALLON, gallons: ML_PER_GALLON,
};

/** Count-unit aliases mapped to their singular form; undefined = bare number. */
const COUNT: Record<string, string | undefined> = {
  '': undefined, each: undefined, whole: undefined,
  can: 'can', cans: 'can',
  jar: 'jar', jars: 'jar',
  pack: 'pack', packs: 'pack',
  package: 'package', packages: 'package',
  bunch: 'bunch', bunches: 'bunch',
  clove: 'clove', cloves: 'clove',
  head: 'head', heads: 'head',
  slice: 'slice', slices: 'slice',
};

export function toQuantity(amount: number, unit: string): Quantity | null {
  const u = unit.trim().toLowerCase();
  if (u in MASS) return { amount: amount * MASS[u], kind: 'mass', base: 'g' };
  if (u in VOLUME) return { amount: amount * VOLUME[u], kind: 'volume', base: 'ml' };
  if (u in COUNT) {
    const countUnit = COUNT[u];
    return countUnit === undefined
      ? { amount, kind: 'count', base: 'each' }
      : { amount, kind: 'count', base: 'each', countUnit };
  }
  return null;
}

export function addQuantities(a: Quantity, b: Quantity): Quantity | null {
  if (a.kind !== b.kind || a.base !== b.base) return null;
  if (a.kind === 'count' && a.countUnit !== b.countUnit) return null;
  return { ...a, amount: a.amount + b.amount };
}

const num = (n: number): string => n.toFixed(1).replace(/\.0$/, '');

export function formatQuantity(q: Quantity): string {
  if (q.kind === 'mass') {
    return q.amount < G_PER_LB
      ? `${num(q.amount / G_PER_OZ)} oz`
      : `${num(q.amount / G_PER_LB)} lb`;
  }
  if (q.kind === 'volume') {
    const steps: [string, number][] = [
      ['gallon', ML_PER_GALLON],
      ['cup', ML_PER_CUP],
      ['tbsp', ML_PER_TBSP],
    ];
    for (const [label, ml] of steps) {
      if (q.amount >= ml) return `${num(q.amount / ml)} ${label}`;
    }
    return `${num(q.amount / ML_PER_TSP)} tsp`;
  }
  if (!q.countUnit) return num(q.amount);
  return `${num(q.amount)} ${q.countUnit}${q.amount === 1 ? '' : 's'}`;
}
