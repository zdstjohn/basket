import { describe, expect, it } from 'vitest';
import {
  PANTRY_BASICS, sharedFoods, sharesLine, sortByOverlap, weekFoods,
} from '@/lib/recipes/search/overlap';
import type { RecipeOption } from '@/lib/recipes/search/provider';
import type { Meal, Person } from '@/lib/domain/types';

const opt = (o: Partial<RecipeOption> = {}): RecipeOption => ({
  source: 'sites', url: 'https://a.test/r', site: 'A', title: 'T', image: 'https://a.test/i.jpg',
  rating: null, ratingCount: null, likes: null, totalMinutes: null, servings: null, ingredients: [], structured: null, ...o,
});

describe('sharedFoods', () => {
  it('matches singular and plural both ways', () => {
    expect(sharedFoods(opt({ ingredients: ['2 limes, juiced', '3 green onions'] }), ['lime', 'green onion'])).toEqual(['lime', 'green onion']);
    expect(sharedFoods(opt({ ingredients: ['1 lime', '1 green onion'] }), ['limes', 'green onions'])).toEqual(['limes', 'green onions']);
    expect(sharedFoods(opt({ ingredients: ['4 tomatoes', '2 cherries'] }), ['tomato', 'cherry'])).toEqual(['tomato', 'cherry']);
  });
  it('needs whole words, not fragments', () => {
    expect(sharedFoods(opt({ ingredients: ['1 cup oats'] }), ['oat', 'goat'])).toEqual(['oat']);
    expect(sharedFoods(opt({ ingredients: ['1 pea shoot'] }), ['pea', 'peach', 'pear'])).toEqual(['pea']);
  });
  it('uses the longest food name first so sour cream is not also cream', () => {
    const o = opt({ ingredients: ['1/2 cup sour cream'] });
    expect(sharedFoods(o, ['cream', 'sour cream'])).toEqual(['sour cream']);
    expect(sharedFoods(opt({ ingredients: ['1/2 cup sour cream', '1 cup heavy cream'] }), ['cream', 'sour cream'])).toEqual(['cream', 'sour cream']);
  });
  it('returns foods in list order and counts each food once', () => {
    const o = opt({ ingredients: ['cilantro', 'more cilantro', '1 lime'] });
    expect(sharedFoods(o, ['lime', 'rice', 'cilantro'])).toEqual(['lime', 'cilantro']);
  });
  it('ignores pantry basics even when they are on the week list', () => {
    const o = opt({ ingredients: ['salt', 'black pepper', '2 tbsp olive oil', 'water', '1 cup flour', '1 lime'] });
    expect(sharedFoods(o, [...PANTRY_BASICS, 'lime'])).toEqual(['lime']);
    expect(PANTRY_BASICS).toEqual(expect.arrayContaining([
      'salt', 'pepper', 'black pepper', 'water', 'oil', 'olive oil', 'vegetable oil', 'butter', 'sugar', 'flour',
      'baking soda', 'baking powder', 'garlic powder', 'onion powder',
    ]));
  });
  it('is empty with no ingredient data, never guessing from the title', () => {
    expect(sharedFoods(opt({ title: 'Lime cilantro rice' }), ['lime', 'cilantro'])).toEqual([]);
  });
  it('falls back to structured names when there are no ingredient lines', () => {
    const o = opt({ structured: [{ canonical: 'limes', amount: 1, unit: 'each', role: 'produce' }] });
    expect(sharedFoods(o, ['lime'])).toEqual(['lime']);
  });
});

describe('sortByOverlap', () => {
  it('orders by overlap, then loved score, then original order', () => {
    const a = opt({ url: 'a', ingredients: ['1 lime'] });
    const b = opt({ url: 'b', ingredients: ['1 lime', 'cilantro'], rating: 3, ratingCount: 10 });
    const c = opt({ url: 'c', ingredients: ['1 lime'], rating: 4.7, ratingCount: 2000 });
    const d = opt({ url: 'd', ingredients: ['rice'] });
    const e = opt({ url: 'e', ingredients: ['rice'] });
    const out = sortByOverlap([a, d, c, b, e], ['lime', 'cilantro']);
    expect(out.map((x) => x.option.url)).toEqual(['b', 'c', 'a', 'd', 'e']);
    expect(out.map((x) => x.shared.length)).toEqual([2, 1, 1, 0, 0]);
  });
  it('with no foods keeps the order given', () => {
    const list = [opt({ url: 'x' }), opt({ url: 'y' })];
    expect(sortByOverlap(list, []).map((x) => x.option.url)).toEqual(['x', 'y']);
  });
});

describe('sharesLine', () => {
  it('is null when nothing is shared', () => expect(sharesLine([])).toBeNull());
  it('uses the singular for one', () => expect(sharesLine(['cilantro'])).toBe('Shares 1 with this week: cilantro'));
  it('lists up to three', () => {
    expect(sharesLine(['cilantro', 'limes', 'sour cream'])).toBe('Shares 3 with this week: cilantro, limes, sour cream');
  });
  it('adds an ellipsis after three', () => {
    expect(sharesLine(['cilantro', 'limes', 'sour cream', 'rice'])).toBe('Shares 4 with this week: cilantro, limes, sour cream…');
  });
});

const meal = (id: string, ings: [string, Meal['ingredients'][number]['role']][]): Meal => ({
  id, name: id, baseServings: 4, vegSwap: null, everyoneVegetarian: false, isFavorite: false,
  ingredients: ings.map(([canonical, role]) => ({ canonical, amount: 1, unit: 'each', role })),
});
const adult: Person = { id: 'p', name: 'A', age: 35, diet: 'none', appetite: 1, dislikes: [] };

describe('weekFoods', () => {
  it('lists the foods of the given meals, minus always-have, distinct and without pantry basics', () => {
    const entries = [
      { meal: meal('tacos', [['Limes', 'produce'], ['cilantro', 'produce'], ['salt', 'pantry']]), servings: null },
      { meal: meal('rice', [['limes', 'produce'], ['rice', 'pantry'], ['soy sauce', 'pantry']]), servings: null },
    ];
    const foods = weekFoods(entries, [adult], ['soy sauce']);
    expect(foods.sort()).toEqual(['cilantro', 'limes', 'rice']);
  });
  it('is empty with no meals', () => expect(weekFoods([], [adult], [])).toEqual([]));
});
