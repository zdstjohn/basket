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
  if (Object.hasOwn(MASS, u)) return { amount: amount * MASS[u], kind: 'mass', base: 'g' };
  if (Object.hasOwn(VOLUME, u)) return { amount: amount * VOLUME[u], kind: 'volume', base: 'ml' };
  if (Object.hasOwn(COUNT, u)) {
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
    const steps: [string, number, boolean][] = [
      ['gallon', ML_PER_GALLON, true],
      ['cup', ML_PER_CUP, true],
      ['tbsp', ML_PER_TBSP, false],
    ];
    for (const [label, ml, plural] of steps) {
      if (q.amount >= ml) {
        const n = num(q.amount / ml);
        return `${n} ${label}${plural && n !== '1' ? 's' : ''}`;
      }
    }
    return `${num(q.amount / ML_PER_TSP)} tsp`;
  }
  if (!q.countUnit) return num(q.amount);
  const unit = q.countUnit;
  const suffix = q.amount === 1 ? '' : /(ch|sh|s|x|z)$/.test(unit) ? 'es' : 's';
  return `${num(q.amount)} ${unit}${suffix}`;
}

/** Like toQuantity, but never drops a line: unknown units become a named count. */
export function quantityOrCount(amount: number, unit: string): Quantity {
  return (
    toQuantity(amount, unit) ?? {
      amount,
      kind: 'count',
      base: 'each',
      countUnit: unit.trim().toLowerCase(),
    }
  );
}

/** For showing: counts round up to whole numbers (you buy whole onions); other units read as usual. */
export function formatQuantityRoundedUp(q: Quantity): string {
  if (q.kind !== 'count') return formatQuantity(q);
  return formatQuantity({ ...q, amount: Math.max(1, Math.ceil(q.amount - 1e-9)) });
}

const VAGUE = new Set([
  'to taste', 'pinch', 'pinches', 'dash', 'dashes', 'sprinkle', 'splash', 'drizzle',
  'as needed', 'garnish', 'for garnish', 'for serving',
]);

/** A count whose "unit" is really a note ("to taste", "a pinch"): it never needs buying on its own. */
export function isVague(q: Quantity): boolean {
  return q.kind === 'count' && q.countUnit !== undefined && VAGUE.has(q.countUnit);
}

/** What a row needs, in kitchen words: "2.4 tsp + to taste", "1 + 7.1 oz". A lone "1 to taste" reads as "to taste". */
export function formatNeed(parts: Quantity[]): string {
  return parts
    .map((p) => (isVague(p) && p.amount === 1 && p.countUnit ? p.countUnit : formatQuantity(p)))
    .join(' + ');
}
