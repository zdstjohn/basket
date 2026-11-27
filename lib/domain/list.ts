import type { ScaledLine } from './scaling';
import type { IngredientLine, Quantity, Role } from './types';
import { addQuantities, isVague, quantityOrCount } from './units';

export type Store = 'fred_meyer' | 'amazon' | 'costco';

export interface ListItem {
  /** The food name (`canonical`): one row per food, and the key of its have-it / got-it flags. */
  key: string;
  canonical: string;
  /** The first part that is not vague, else the first part. */
  qty: Quantity;
  /** Everything the week needs of this food: plain counts, named counts, mass, volume, then vague notes. */
  parts: Quantity[];
  role: Role;
  store: Store;
  estimateCents: number | null;
  haveIt: boolean;
  alwaysHave: boolean;
  outsideBudget: boolean;
  sources: string[];
}

const STORES: Store[] = ['fred_meyer', 'amazon', 'costco'];
const ROLES: Role[] = [
  'meat', 'fish', 'veg_protein', 'produce', 'dairy', 'bakery', 'frozen', 'pantry', 'other',
];

/** One spelling per food: trimmed, lower case, spaces collapsed, NFC. Plurals stay apart (the name is the item's key). */
export const normFood = (s: string): string => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const norm = normFood;

/** Same-kind amounts add up under one of these. */
const kindKey = (q: Quantity): string =>
  q.kind === 'count' ? `count:${q.countUnit ?? ''}` : q.kind;

/** Plain counts, named counts (by name), mass, volume; vague notes last. */
function partRank(q: Quantity): number {
  if (isVague(q)) return 4;
  if (q.kind === 'count') return q.countUnit ? 1 : 0;
  return q.kind === 'mass' ? 2 : 3;
}

const comparePart = (a: Quantity, b: Quantity): number =>
  partRank(a) - partRank(b) || cmp(a.countUnit ?? '', b.countUnit ?? '');

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function buildShoppingList(input: {
  scaled: ScaledLine[];
  staples: IngredientLine[];
  alwaysHave: string[];
  haveIt: Set<string>;
  outsideBudget: Set<string>;
  storeFor(canonical: string, role: Role): Store;
  estimateFor(canonical: string, qty: Quantity, store: Store): number | null;
  /** The total you typed for this much of the food (not a guess), or null. */
  userCents?(canonical: string, qty: Quantity, store: Store): number | null;
}): ListItem[] {
  const lines: ScaledLine[] = [
    ...input.scaled,
    ...input.staples.map((s) => ({
      canonical: s.canonical,
      qty: quantityOrCount(s.amount, s.unit),
      role: s.role,
      sources: ['Staples'],
    })),
  ];

  const merged = new Map<
    string,
    { canonical: string; parts: Map<string, Quantity>; role: Role; sources: string[] }
  >();
  for (const line of lines) {
    const canonical = norm(line.canonical);
    const existing = merged.get(canonical);
    if (!existing) {
      merged.set(canonical, {
        canonical,
        parts: new Map([[kindKey(line.qty), line.qty]]),
        role: line.role,
        sources: [...new Set(line.sources)],
      });
      continue;
    }
    const k = kindKey(line.qty);
    const have = existing.parts.get(k);
    // Same kind key guarantees compatible quantities.
    existing.parts.set(k, have ? (addQuantities(have, line.qty) ?? have) : line.qty);
    for (const s of line.sources) if (!existing.sources.includes(s)) existing.sources.push(s);
  }

  const always = new Set(input.alwaysHave.map(norm));
  const items: ListItem[] = [];
  for (const [key, m] of merged) {
    const parts = [...m.parts.values()]
      .map((p): Quantity => (p.kind === 'count' ? { ...p, amount: Math.ceil(p.amount - 1e-9) + 0 } : p))
      .sort(comparePart);
    const qty = parts.find((p) => !isVague(p)) ?? parts[0];
    const store = input.storeFor(m.canonical, m.role);
    const isAlways = always.has(m.canonical);
    // A price you typed is the total for the whole row; otherwise add up the parts that have a price.
    let estimateCents = input.userCents?.(m.canonical, qty, store) ?? null;
    if (estimateCents === null) {
      for (const p of parts) {
        const c = input.estimateFor(m.canonical, p, store);
        if (c !== null) estimateCents = (estimateCents ?? 0) + c;
      }
    }
    items.push({
      key,
      canonical: m.canonical,
      qty,
      parts,
      role: m.role,
      store,
      estimateCents,
      haveIt: isAlways || input.haveIt.has(key),
      alwaysHave: isAlways,
      outsideBudget: input.outsideBudget.has(key),
      sources: m.sources,
    });
  }

  return items.sort(
    (a, b) =>
      STORES.indexOf(a.store) - STORES.indexOf(b.store) ||
      ROLES.indexOf(a.role) - ROLES.indexOf(b.role) ||
      cmp(a.canonical, b.canonical) ||
      cmp(a.key, b.key),
  );
}

export function listTotals(items: ListItem[]): {
  totalCents: number;
  byStore: Record<Store, { cents: number; count: number }>;
  missingEstimates: number;
} {
  const byStore: Record<Store, { cents: number; count: number }> = {
    fred_meyer: { cents: 0, count: 0 },
    amazon: { cents: 0, count: 0 },
    costco: { cents: 0, count: 0 },
  };
  let totalCents = 0;
  let missingEstimates = 0;
  for (const it of items) {
    if (it.haveIt) continue;
    byStore[it.store].count += 1;
    byStore[it.store].cents += it.estimateCents ?? 0;
    if (it.estimateCents === null) missingEstimates += 1;
    if (!it.outsideBudget) totalCents += it.estimateCents ?? 0;
  }
  return { totalCents, byStore, missingEstimates };
}
