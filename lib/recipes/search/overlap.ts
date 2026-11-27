import { buildShoppingList } from '@/lib/domain/list';
import { scaleMeal } from '@/lib/domain/scaling';
import type { Meal, Person } from '@/lib/domain/types';
import { lovedScore } from './loved';
import type { RecipeOption } from './provider';

/** Foods everybody has: they never count as "shared" with another meal. */
export const PANTRY_BASICS: readonly string[] = [
  'salt', 'pepper', 'black pepper', 'water', 'oil', 'olive oil', 'vegetable oil', 'butter', 'sugar', 'flour',
  'baking soda', 'baking powder', 'garlic powder', 'onion powder', 'cooking spray', 'cornstarch',
];

const MAX_NAMES = 3;

/** One word, lower case, singular: "limes" and "lime" both become "lime". */
function singular(w: string): string {
  if (w.length > 5 && w.endsWith('leaves')) return `${w.slice(0, -6)}leaf`;
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(?:o|ch|sh|x|z)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !/(?:ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

const words = (s: string): string[] =>
  s.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean).map(singular);

const BASIC_WORDS = PANTRY_BASICS.map((b) => words(b));
// Words that may sit around a basic without making a different food ("kosher salt", "warm water").
const BASIC_MODIFIERS = new Set(
  [
    'extra', 'virgin', 'light', 'pure', 'unsalted', 'salted', 'kosher', 'sea', 'table', 'fine', 'coarse', 'ground',
    'black', 'white', 'all-purpose', 'all', 'purpose', 'granulated', 'brown', 'dark', 'powdered', 'cold', 'warm',
    'canola', 'vegetable', 'olive', 'neutral', 'cooking',
  ].flatMap(words),
);

// Only for water: "hot pepper" is produce, "hot water" is from the tap.
const WATER_MODIFIERS = new Set(['hot', 'boiling', 'lukewarm', 'ice']);

/**
 * True for salt, oil, flour and the rest of the pantry basics, and for a basic with only everyday modifiers:
 * "kosher salt", "extra virgin olive oil", "unsalted butter", "ground black pepper", "brown sugar".
 * Flour tortillas, peanut butter, sesame oil and bell pepper are different foods, so they are not basics.
 */
export function isBasic(food: string): boolean {
  const w = words(food);
  return BASIC_WORDS.some(
    (b) =>
      b.every((x) => w.includes(x)) &&
      w.every((x) => b.includes(x) || BASIC_MODIFIERS.has(x) || (b.includes('water') && WATER_MODIFIERS.has(x))),
  );
}

// A recipe word like these next to a food makes a different food: "cream cheese" is not cheese.
const QUALIFIERS = new Set(
  ['cream', 'broth', 'stock', 'paste', 'vinegar', 'noodle', 'tortilla', 'powder', 'sauce', 'juice'].map(singular),
);

/**
 * The foods on this week's shopping list that come from the given (other) meals:
 * scaled the way the list scales them, minus always-have foods and pantry basics, each food once,
 * in the list's order (by role, then name).
 */
export function weekFoods(
  entries: { meal: Meal; servings: number | null }[],
  people: Person[],
  alwaysHave: string[],
): string[] {
  const items = buildShoppingList({
    scaled: entries.flatMap((e) => scaleMeal(e.meal, people, e.servings ?? undefined)),
    staples: [],
    alwaysHave,
    haveIt: new Set(),
    outsideBudget: new Set(),
    storeFor: () => 'fred_meyer',
    estimateFor: () => null,
  });
  const seen = new Set<string>();
  const foods: string[] = [];
  for (const it of items) {
    if (it.alwaysHave || isBasic(it.canonical)) continue;
    const key = words(it.canonical).join(' ');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    foods.push(it.canonical);
  }
  return foods;
}

/**
 * Which of the week's foods the recipe uses, in the week list's order. Matching is by whole words,
 * singular or plural, longest food name first so "sour cream" does not also count as "cream".
 * A recipe with no ingredient data shares nothing.
 */
export function sharedFoods(o: RecipeOption, foods: string[]): string[] {
  const lines = o.ingredients.length > 0 ? o.ingredients : (o.structured ?? []).map((l) => l.canonical);
  if (lines.length === 0 || foods.length === 0) return [];
  const wanted = foods
    .map((food, index) => ({ food, index, w: isBasic(food) ? [] : words(food) }))
    .filter((f) => f.w.length > 0)
    .sort((a, b) => b.w.length - a.w.length || a.index - b.index);
  const lineWords = lines.map(words);
  const used = lineWords.map((l) => l.map(() => false));
  const found = new Set<number>();
  for (const f of wanted) {
    for (let li = 0; li < lineWords.length; li++) {
      const lw = lineWords[li];
      for (let start = 0; start + f.w.length <= lw.length; start++) {
        const fits = f.w.every((w, k) => lw[start + k] === w && !used[li][start + k]);
        if (!fits) continue;
        const before = lw[start - 1];
        const after = lw[start + f.w.length];
        // Green onions are their own thing on a list, so a plain "onion" does not match them.
        if (f.w.length === 1 && f.w[0] === 'onion' && before === 'green') continue;
        if ((before !== undefined && QUALIFIERS.has(before)) || (after !== undefined && QUALIFIERS.has(after))) continue;
        f.w.forEach((_, k) => (used[li][start + k] = true));
        found.add(f.index);
      }
    }
  }
  return [...found].sort((a, b) => a - b).map((i) => foods[i]);
}

export interface Ranked {
  option: RecipeOption;
  shared: string[];
}

/** Most shared foods first; ties by how loved, then by the order given (a stable sort). */
export function sortByOverlap(options: RecipeOption[], foods: string[]): Ranked[] {
  return options
    .map((option, i) => ({ option, i, shared: sharedFoods(option, foods), s: lovedScore(option) }))
    .sort((a, b) => b.shared.length - a.shared.length || b.s - a.s || a.i - b.i)
    .map(({ option, shared }) => ({ option, shared }));
}

/** "Shares 4 with this week: cilantro, limes, sour cream…", or null when nothing is shared. */
export function sharesLine(shared: string[]): string | null {
  if (shared.length === 0) return null;
  const names = shared.slice(0, MAX_NAMES).join(', ');
  return `Shares ${shared.length} with this week: ${names}${shared.length > MAX_NAMES ? '…' : ''}`;
}
