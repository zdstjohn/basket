import type { ListItem, Store } from '@/lib/domain/list';

/** The keys "Check off all" ticks: this store's items still to buy, minus ones already checked or marked "I have it" / always-have. */
export function keysToCheck(items: ListItem[], store: Store, checked: ReadonlySet<string>): string[] {
  return items.filter((i) => i.store === store && !i.haveIt && !checked.has(i.key)).map((i) => i.key);
}

/** What Undo unticks: only the keys the button ticked, and only those still ticked. */
export function keysToUntick(ticked: readonly string[], checked: ReadonlySet<string>): string[] {
  return ticked.filter((k) => checked.has(k));
}

export const checkedOffMessage = (n: number): string => `Checked off ${n} ${n === 1 ? 'item' : 'items'}`;
