import { eachGrams, eachGramsKnown, gramsPerMl } from './density';
import type { Quantity } from './types';
import { isVague } from './units';

export interface Candidate {
  upc: string;
  name: string;
  brand: string | null;
  sizeText: string;
  size: Quantity | null;
  soldBy: 'UNIT' | 'WEIGHT';
  regularCents: number;
  promoCents: number | null;
  imageUrl: string | null;
  relevant: boolean;
  inStock: boolean;
}
export interface Offer {
  candidate: Candidate;
  count: number;
  unitCents: number;
  totalCents: number;
  onSale: boolean;
  approx: boolean;
}
export interface Recommendation {
  pick: Offer | null;
  options: Offer[];
  cheapestUpc: string | null;
  usualMissing: boolean;
}

const G_PER_LB = 453.59237;
const POUND: Quantity = { amount: G_PER_LB, kind: 'mass', base: 'g' };
const MATCHED_LIMIT = 5;
const UNMATCHED_LIMIT = 3;
const OPTIONS_LIMIT = 5;

/** Count units that add nothing to what you buy. */
const NOTHING = new Set(['clove', 'cloves', 'slice', 'slices', 'sprig', 'sprigs', 'leaf', 'leaves', 'stalk', 'stalks']);
/** Count units that are whole packages (singular or plural). */
const CONTAINERS = new Set(
  ['can', 'jar', 'pack', 'package', 'bunch', 'head', 'bottle', 'bag', 'box', 'carton', 'loaf', 'container']
    .flatMap((u) => [u, `${u}s`, `${u}es`]),
);

const clampCount = (n: number): number => Math.min(99, Math.max(1, Math.ceil(n - 1e-9)));
const validCount = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 99;

/** An amount expressed in the other kinds of quantity, via density and typical item weight. */
function convert(canonical: string, amount: number, from: Quantity['kind'], to: Quantity['kind']): number {
  if (from === to) return amount;
  const gpm = gramsPerMl(canonical);
  const grams = from === 'mass' ? amount : from === 'volume' ? amount * gpm : amount * eachGrams(canonical);
  return to === 'mass' ? grams : to === 'volume' ? grams / gpm : grams / eachGrams(canonical);
}

/** Packages of `size` that one part of a recipe needs (fractional); 0 when it adds nothing. */
function partNeeds(canonical: string, rawPart: Quantity, size: Quantity | null): number {
  // A dozen is twelve plain items.
  const dozens = rawPart.kind === 'count' && (rawPart.countUnit === 'dozen' || rawPart.countUnit === 'dozens');
  const part: Quantity = dozens ? { amount: rawPart.amount * 12, kind: 'count', base: 'each' } : rawPart;
  if (isVague(part)) return 0;
  const unit = part.countUnit;
  if (part.kind === 'count' && unit !== undefined) {
    if (NOTHING.has(unit)) return 0;
    if (CONTAINERS.has(unit)) return part.amount;
  }
  if (!size) return 0;
  if (part.kind === 'count' && size.kind !== 'count') {
    // A plain count against a weight or volume package only counts when we know what one item weighs (I2).
    const each = eachGramsKnown(canonical);
    if (each === null) return 0;
    return convert(canonical, part.amount * each, 'mass', size.kind) / size.amount;
  }
  return convert(canonical, part.amount, part.kind, size.kind) / size.amount;
}

/** Whole packages (or pounds, for a by-the-pound size of 1 lb) to buy, 1 to 99. */
export function packagesNeeded(canonical: string, parts: Quantity[], size: Quantity | null): number {
  let sum = 0;
  for (const p of parts) {
    const n = partNeeds(canonical, p, size);
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return clampCount(sum);
}

/** The candidates worth choosing among: the first five relevant ones, else the first three of all. */
export function poolOf(candidates: Candidate[]): Candidate[] {
  const relevant = candidates.filter((c) => c.relevant);
  return relevant.length > 0 ? relevant.slice(0, MATCHED_LIMIT) : candidates.slice(0, UNMATCHED_LIMIT);
}

export function offerFor(canonical: string, parts: Quantity[], c: Candidate, count?: number | null): Offer {
  const weight = c.soldBy === 'WEIGHT';
  const n = validCount(count) ? count : packagesNeeded(canonical, parts, weight ? POUND : c.size);
  const unitCents = c.promoCents ?? c.regularCents;
  return {
    candidate: c,
    count: n,
    unitCents,
    totalCents: n * unitCents,
    onSale: c.promoCents !== null && c.promoCents > 0 && c.promoCents < c.regularCents,
    approx: weight,
  };
}

export function recommend(
  canonical: string,
  parts: Quantity[],
  candidates: Candidate[],
  opts: { chosenUpc?: string | null; count?: number | null } = {},
): Recommendation {
  const chosenUpc = opts.chosenUpc || null;
  const pool = poolOf(candidates);
  const rank = new Map(candidates.map((c, i) => [c.upc, i]));
  const order = (a: Offer, b: Offer): number =>
    Number(b.candidate.inStock) - Number(a.candidate.inStock) ||
    a.totalCents - b.totalCents ||
    Number(b.onSale) - Number(a.onSale) ||
    (rank.get(a.candidate.upc) ?? 0) - (rank.get(b.candidate.upc) ?? 0);

  const offers = pool.map((c) => offerFor(canonical, parts, c, opts.count)).sort(order);
  const chosen = chosenUpc ? candidates.find((c) => c.upc === chosenUpc) : undefined;
  const usualMissing = chosenUpc !== null && !chosen;
  if (offers.length === 0 && !chosen) return { pick: null, options: [], cheapestUpc: null, usualMissing };

  let pick: Offer | null = offers[0] ?? null;
  let options = offers;
  if (chosen) {
    const existing = offers.find((o) => o.candidate.upc === chosen.upc);
    pick = existing ?? offerFor(canonical, parts, chosen, opts.count);
    if (!existing) {
      const kept = offers.slice(0, OPTIONS_LIMIT - 1);
      options = [...kept, pick].sort(order);
    }
  }
  options = options.slice(0, OPTIONS_LIMIT);
  return { pick, options, cheapestUpc: options[0]?.candidate.upc ?? null, usualMissing };
}

/** The cheapest cents per gram, millilitre or item among the pooled candidates, by shelf price. */
export function perBase(
  canonical: string,
  kind: Quantity['kind'],
  candidates: Candidate[],
): { centsPerBase: number; candidate: Candidate } | null {
  let best: { centsPerBase: number; candidate: Candidate } | null = null;
  for (const c of poolOf(candidates)) {
    const cents = c.promoCents ?? c.regularCents;
    if (!(cents > 0)) continue;
    const size = c.soldBy === 'WEIGHT' ? POUND : c.size;
    if (!size) continue;
    const amount = convert(canonical, size.amount, size.kind, kind);
    if (!(amount > 0)) continue;
    const centsPerBase = cents / amount;
    if (!best || centsPerBase < best.centsPerBase) best = { centsPerBase, candidate: c };
  }
  return best;
}
