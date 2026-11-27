import type { ItemState } from '@/lib/db/queries/list';

// Flags used to be saved per kind of amount ("milk#volume", "beans#count:can"). They are now saved per
// food ("milk"). Old rows stay in the database until migration 0007 folds them, so reading them still works.
const OLD_KEY = /^([\s\S]*)#(?:mass|volume|count(?::[\s\S]*)?)$/;

/**
 * One row of flags per food. A row keyed exactly by the food wins whole (with its package count);
 * otherwise the flags are the OR of the old `food#kind` rows, which never carried a package count.
 */
export function foldItemState(state: Record<string, ItemState>): Record<string, ItemState> {
  const out: Record<string, ItemState> = {};
  const old: Record<string, ItemState> = {};
  for (const [key, flags] of Object.entries(state)) {
    const m = OLD_KEY.exec(key);
    if (!m) {
      out[key] = flags;
      continue;
    }
    const prev = old[m[1]];
    old[m[1]] = prev
      ? {
          have_it: prev.have_it || flags.have_it,
          checked: prev.checked || flags.checked,
          outside_budget: prev.outside_budget || flags.outside_budget,
        }
      : { have_it: flags.have_it, checked: flags.checked, outside_budget: flags.outside_budget };
  }
  for (const [food, flags] of Object.entries(old)) if (!(food in out)) out[food] = flags;
  return out;
}

const NO_FLAGS: ItemState = { have_it: false, checked: false, outside_budget: false };

/**
 * The flags to write for these foods after a tap: each food's folded flags (so flags that still sit on
 * old food#kind rows are kept) with the patch on top. The result is keyed by the food.
 */
export function mergeFlags(
  state: Record<string, ItemState>,
  keys: string[],
  patch: Partial<ItemState>,
): Record<string, ItemState> {
  const folded = foldItemState(state);
  const out: Record<string, ItemState> = {};
  for (const k of keys) out[k] = { ...(folded[k] ?? NO_FLAGS), ...patch };
  return out;
}
