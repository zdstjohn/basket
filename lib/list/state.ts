import type { ItemState } from '@/lib/db/queries/list';
import type { ItemPatch } from '@/lib/list/offline';

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

/**
 * What to send for a tap: the food's flags, and `pack_count` only when the patch names it. A write that
 * carried the count along would let an offline tick on one phone reset a count set on the other.
 */
export function writeFlags(merged: ItemState, patch: ItemPatch): ItemPatch {
  const out: ItemPatch = { have_it: merged.have_it, checked: merged.checked, outside_budget: merged.outside_budget };
  if ('pack_count' in patch) out.pack_count = patch.pack_count ?? null;
  return out;
}

/** A package count the household typed: a whole number from 1 to 99; null (or no number) goes back to what the list works out. */
export function clampPackCount(count: number | null): number | null {
  if (count === null || !Number.isFinite(count)) return null;
  return Math.min(99, Math.max(1, Math.round(count)));
}
