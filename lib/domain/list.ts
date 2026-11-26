import type { ScaledLine } from './scaling';
import type { IngredientLine, Quantity, Role } from './types';
import { addQuantities, quantityOrCount } from './units';

export type Store = 'fred_meyer' | 'amazon' | 'costco';

export interface ListItem {
  key: string;
  canonical: string;
  qty: Quantity;
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

const norm = (s: string): string => s.trim().toLowerCase();

const keyFor = (canonical: string, q: Quantity): string =>
  q.kind === 'count' && q.countUnit
    ? `${canonical}#count:${q.countUnit}`
    : `${canonical}#${q.kind}`;

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function buildShoppingList(input: {
  scaled: ScaledLine[];
  staples: IngredientLine[];
  alwaysHave: string[];
  haveIt: Set<string>;
  outsideBudget: Set<string>;
  storeFor(canonical: string, role: Role): Store;
  estimateFor(canonical: string, qty: Quantity, store: Store): number | null;
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

  const merged = new Map<string, { canonical: string; qty: Quantity; role: Role; sources: string[] }>();
  for (const line of lines) {
    const canonical = norm(line.canonical);
    const key = keyFor(canonical, line.qty);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { canonical, qty: line.qty, role: line.role, sources: [...new Set(line.sources)] });
      continue;
    }
    // Same key guarantees compatible quantities.
    existing.qty = addQuantities(existing.qty, line.qty) ?? existing.qty;
    for (const s of line.sources) if (!existing.sources.includes(s)) existing.sources.push(s);
  }

  const always = new Set(input.alwaysHave.map(norm));
  const items: ListItem[] = [];
  for (const [key, m] of merged) {
    const qty: Quantity =
      m.qty.kind === 'count'
        ? { ...m.qty, amount: Math.ceil(m.qty.amount - 1e-9) + 0 }
        : m.qty;
    const store = input.storeFor(m.canonical, m.role);
    const isAlways = always.has(m.canonical);
    items.push({
      key,
      canonical: m.canonical,
      qty,
      role: m.role,
      store,
      estimateCents: input.estimateFor(m.canonical, qty, store),
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
