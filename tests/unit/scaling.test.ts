import { describe, expect, it } from 'vitest';
import { eatersOf, scaleMeal } from '@/lib/domain/scaling';
import { scaleMealBefore } from './helpers/scale-meal-b4705e1';
import { soup } from '@/lib/fixtures/soup';
import { changeNotes, dayNote } from '@/lib/week/note';
import { tacos } from '@/lib/fixtures/tacos';
import { familyOfFive } from '@/lib/fixtures/household';
import type { Meal, Person } from '@/lib/domain/types';

const zucchini = { canonical: 'zucchini', amountPerServing: 0.25, unit: 'each', role: 'produce' as const };
/** The line's amount divided by its amount with nothing left out. */
const line = (lines: ReturnType<typeof scaleMeal>, canonical: string) =>
  lines.find((l) => l.canonical === canonical);

const grams = (l: { qty: { amount: number } }) => l.qty.amount;
/** The line's amount as a fraction of what the whole household (3.8 servings) would need, given a recipe amount in base units. */
const share = (m: Meal, canonical: string, fullBase: number): number =>
  grams(line(scaleMeal(m, familyOfFive), canonical)!) / (fullBase * (3.8 / m.baseServings));

describe('scaleMeal', () => {
  const lines = scaleMeal(tacos, familyOfFive);

  it('scales meat by the share of people who eat it', () => {
    const chicken = line(lines, 'boneless chicken thighs')!;
    expect(chicken.qty.kind).toBe('mass');
    expect(Math.abs(chicken.qty.amount - 317.5)).toBeLessThan(0.5);
  });

  it('scales non-protein lines by servings', () => {
    expect(line(lines, 'corn tortillas')!.qty.amount).toBeCloseTo(11.4, 9);
    expect(line(lines, 'yellow onion')!.qty.amount).toBeCloseTo(0.95, 9);
  });

  it('adds the vegetarian swap for the non-eaters', () => {
    const beans = line(lines, 'black beans')!;
    expect(beans.qty.amount).toBeCloseTo(0.25, 9);
    expect(beans.qty.countUnit).toBe('can');
    expect(beans.role).toBe('veg_protein');
  });

  it('honours servingsOverride', () => {
    const l = scaleMeal(tacos, familyOfFive, 5.8);
    expect(Math.abs(line(l, 'boneless chicken thighs')!.qty.amount - 484.6)).toBeLessThan(0.5);
    expect(Math.abs(line(l, 'black beans')!.qty.amount - 0.3816)).toBeLessThan(0.001);
  });

  it('has no swap when everyone eats meat', () => {
    const people: Person[] = familyOfFive.map((p) => ({ ...p, diet: 'none' }));
    expect(line(scaleMeal(tacos, people), 'black beans')).toBeUndefined();
  });

  it('drops meat and swaps in full when nobody eats meat', () => {
    const people: Person[] = familyOfFive.map((p) => ({ ...p, diet: 'vegetarian' }));
    const l = scaleMeal(tacos, people);
    expect(line(l, 'boneless chicken thighs')).toBeUndefined();
    expect(line(l, 'black beans')!.qty.amount).toBeCloseTo(0.25 * 3.8, 9);
  });

  it('has no meat and no swap for everyoneVegetarian meals', () => {
    const l = scaleMeal({ ...tacos, everyoneVegetarian: true }, familyOfFive);
    expect(line(l, 'boneless chicken thighs')).toBeUndefined();
    expect(line(l, 'black beans')).toBeUndefined();
    expect(line(l, 'corn tortillas')).toBeDefined();
  });

  it('tags every line with the meal name', () => {
    for (const l of lines) expect(l.sources).toEqual(['Chicken tacos']);
  });

  it('keeps lines with unknown units as counts', () => {
    const meal: Meal = {
      ...tacos,
      ingredients: [{ canonical: ' Thyme ', amount: 2, unit: 'Sprigs', role: 'produce' }],
      vegSwap: null,
    };
    const l = scaleMeal(meal, familyOfFive, 4);
    expect(l).toHaveLength(1);
    expect(l[0].canonical).toBe('thyme');
    expect(l[0].qty).toEqual({ amount: 2, kind: 'count', base: 'each', countUnit: 'sprigs' });
  });

  describe('swap with meat/fish mixes', () => {
    const person = (id: string, age: number, diet: Person['diet']): Person => ({
      id, name: id, age, diet, appetite: 1, dislikes: [],
    });
    const meal = (ingredients: Meal['ingredients'], vegSwap: Meal['vegSwap']): Meal => ({
      ...tacos, ingredients, vegSwap,
    });
    const salmon: Meal = meal(
      [{ canonical: 'salmon', amount: 1, unit: 'lb', role: 'fish' }],
      { canonical: 'chickpeas', amountPerServing: 0.25, unit: 'can', role: 'veg_protein' },
    );

    it('adds no swap to a meal with no meat or fish lines', () => {
      const m = meal(
        [
          { canonical: 'corn tortillas', amount: 12, unit: 'each', role: 'bakery' },
          { canonical: 'yellow onion', amount: 1, unit: 'each', role: 'produce' },
        ],
        tacos.vegSwap,
      );
      const veg = familyOfFive.map((p) => ({ ...p, diet: 'vegetarian' as const }));
      expect(line(scaleMeal(m, veg), 'black beans')).toBeUndefined();
      expect(line(scaleMeal(m, familyOfFive), 'black beans')).toBeUndefined();
    });

    it('gives pescatarians fish and no swap on a fish-only meal', () => {
      const l = scaleMeal(salmon, [person('dad', 38, 'none'), person('pesc', 39, 'pescatarian')]);
      expect(line(l, 'salmon')!.qty.amount).toBeCloseTo(0.5 * 453.59237, 6);
      expect(line(l, 'chickpeas')).toBeUndefined();
    });

    it('excludes the vegetarian from fish and swaps for them', () => {
      const l = scaleMeal(salmon, familyOfFive);
      expect(line(l, 'salmon')!.qty.amount).toBeCloseTo(0.7 * 453.59237, 6);
      expect(line(l, 'chickpeas')!.qty.amount).toBeCloseTo(0.25, 9);
    });

    it('swaps only for people who eat neither meat nor fish in a mixed meal', () => {
      const m = meal(
        [
          { canonical: 'chicken', amount: 1, unit: 'lb', role: 'meat' },
          { canonical: 'shrimp', amount: 1, unit: 'lb', role: 'fish' },
        ],
        { canonical: 'tofu', amountPerServing: 0.25, unit: 'pack', role: 'veg_protein' },
      );
      const people = [person('dad', 38, 'none'), person('pesc', 39, 'pescatarian'), person('veg', 36, 'vegetarian')];
      const l = scaleMeal(m, people);
      expect(line(l, 'chicken')!.qty.amount).toBeCloseTo(0.25 * 453.59237, 6);
      expect(line(l, 'shrimp')!.qty.amount).toBeCloseTo(0.5 * 453.59237, 6);
      const tofu = line(l, 'tofu')!;
      expect(tofu.qty.amount).toBeCloseTo(0.25, 9);
      expect(tofu.qty.countUnit).toBe('pack');
    });
  });
});

describe('scaleMeal with a person’s changes', () => {
  it('buys less of a food one person has left out', () => {
    const m = { ...soup, personChanges: [{ personId: 'daughter-4', food: 'mushrooms', action: 'leave_out' as const }] };
    // 8 oz x (3.8 / 4) x (3.3 / 3.8) = 6.6 oz
    expect(grams(line(scaleMeal(m, familyOfFive), 'cremini mushrooms')!)).toBeCloseTo(6.6 * 28.3495, 1);
    expect(grams(line(scaleMeal(m, familyOfFive), 'white beans')!)).toBe(grams(line(scaleMeal(soup, familyOfFive), 'white beans')!));
  });
  it('adds the swap for that person only', () => {
    const m = { ...soup, personChanges: [{ personId: 'daughter-4', food: 'mushrooms', action: 'swap' as const, swap: zucchini }] };
    expect(line(scaleMeal(m, familyOfFive), 'zucchini')!.qty.amount).toBeCloseTo(0.25 * 3.8 * (0.5 / 3.8), 5);
  });
  it('drops the line when everyone has left it out', () => {
    const m = { ...soup, personChanges: familyOfFive.map((p) => ({ personId: p.id, food: 'mushrooms', action: 'leave_out' as const })) };
    expect(line(scaleMeal(m, familyOfFive), 'cremini mushrooms')).toBeUndefined();
  });
  it('ignores a change for someone no longer in the household, or a food not in the meal', () => {
    const m = { ...soup, personChanges: [{ personId: 'gone', food: 'mushrooms', action: 'leave_out' as const }, { personId: 'son', food: 'olives', action: 'leave_out' as const }] };
    expect(scaleMeal(m, familyOfFive)).toEqual(scaleMeal(soup, familyOfFive));
  });
  it('combines with the vegetarian rule on meat', () => {
    const m = { ...tacos, personChanges: [{ personId: 'son', food: 'chicken', action: 'leave_out' as const }] };
    // chicken eaters: Dad 1 + Daughter 0.6 + Daughter 0.5 = 2.1 of 3.8
    expect(share(m, 'boneless chicken thighs', 453.59237)).toBeCloseTo(2.1 / 3.8, 5);
  });
  it('has one rule for who eats a line', () => {
    const m = { ...soup, personChanges: [{ personId: 'daughter-4', food: 'mushrooms', action: 'leave_out' as const }] };
    expect(eatersOf(m, soup.ingredients[0], familyOfFive).map((p) => p.id)).toEqual(['dad', 'mom', 'son', 'daughter-6']);
    expect(eatersOf(m, soup.ingredients[1], familyOfFive)).toHaveLength(5);
  });
  it('puts a person’s swap before the vegetarian swap line', () => {
    const m = { ...tacos, personChanges: [{ personId: 'son', food: 'onion', action: 'swap' as const, swap: zucchini }] };
    expect(scaleMeal(m, familyOfFive).map((l) => l.canonical).slice(-2)).toEqual(['zucchini', 'black beans']);
  });
  it('applies a change to the vegetarian swap food too', () => {
    const m = { ...tacos, personChanges: [{ personId: 'mom', food: 'black beans', action: 'leave_out' as const }] };
    expect(line(scaleMeal(m, familyOfFive), 'black beans')).toBeUndefined();
    expect(dayNote(m, familyOfFive, null)).toBe('Mom: no black beans');
  });
  it('scales a meal cached before this release, and people cached before allergies', () => {
    const old: Meal = { id: soup.id, name: soup.name, baseServings: 4, ingredients: soup.ingredients, vegSwap: null, everyoneVegetarian: false, isFavorite: false };
    expect(scaleMeal(old, familyOfFive)).toEqual(scaleMeal({ ...soup, personChanges: [] }, familyOfFive));
    expect(changeNotes(old, familyOfFive)).toEqual([]);
  });
});

describe('changes never act on an allergy, and are live only when they remove someone', () => {
  const nuts: Meal = {
    ...soup,
    ingredients: [...soup.ingredients, { canonical: 'sliced almonds', amount: 4, unit: 'oz', role: 'pantry' }],
  };
  const allergic = familyOfFive.map((p) => (p.id === 'daughter-4' ? { ...p, allergies: ['tree nuts'] } : p));
  const stale: Meal = { ...nuts, personChanges: [{ personId: 'daughter-4', food: 'almonds', action: 'leave_out' }] };

  it('a change saved before the allergy was added buys the full amount and prints no note', () => {
    expect(scaleMeal(stale, allergic)).toEqual(scaleMeal(nuts, allergic));
    expect(eatersOf(stale, nuts.ingredients[3], allergic)).toHaveLength(5);
    expect(changeNotes(stale, allergic)).toEqual([]);
    expect(dayNote(stale, allergic, null)).toBe('Everyone vegetarian');
    // the same change without the allergy still counts
    expect(changeNotes(stale, familyOfFive)).toEqual(['Daughter (4): no almonds']);
  });
  it('a swap for someone who never eats the line adds nothing and no note', () => {
    const m = { ...tacos, personChanges: [{ personId: 'mom', food: 'chicken', action: 'swap' as const, swap: zucchini }] };
    expect(line(scaleMeal(m, familyOfFive), 'zucchini')).toBeUndefined();
    expect(scaleMeal(m, familyOfFive)).toEqual(scaleMeal(tacos, familyOfFive));
    expect(changeNotes(m, familyOfFive)).toEqual([]);
  });
  it('a leave out on a food the person never received adds no note', () => {
    const m = { ...tacos, personChanges: [{ personId: 'dad', food: 'black beans', action: 'leave_out' as const }] };
    expect(scaleMeal(m, familyOfFive)).toEqual(scaleMeal(tacos, familyOfFive));
    expect(dayNote(m, familyOfFive, null)).toBe(dayNote(tacos, familyOfFive, null));
  });
});

describe('a meal with no person changes scales exactly as it did before person changes', () => {
  let seed = 12345;
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const roles = ['meat', 'fish', 'veg_protein', 'produce', 'dairy', 'bakery', 'frozen', 'pantry', 'other'] as const;
  const diets = ['none', 'vegetarian', 'vegan', 'pescatarian'] as const;

  it('matches the old function over random meals and households', () => {
    for (let i = 0; i < 3000; i++) {
      const people: Person[] = Array.from({ length: Math.floor(rnd() * 6) }, (_, k) => ({
        id: `p${k}`, name: `P${k}`, age: Math.floor(rnd() * 60), diet: pick(diets), appetite: pick([0.5, 1, 1.5]), dislikes: [],
      }));
      const meal: Meal = {
        id: 'r', name: 'Random', baseServings: pick([1, 2, 4, 6]),
        ingredients: Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, k) => ({
          canonical: `food ${k}`, amount: 1 + Math.floor(rnd() * 9), unit: pick(['oz', 'lb', 'cup', 'each', 'can']), role: pick(roles),
        })),
        vegSwap: rnd() < 0.7 ? { canonical: 'swap food', amountPerServing: 0.25, unit: 'can', role: pick(roles) } : null,
        everyoneVegetarian: rnd() < 0.2,
        isFavorite: false,
      };
      const override = rnd() < 0.3 ? 1 + Math.floor(rnd() * 8) : undefined;
      expect(scaleMeal(meal, people, override)).toEqual(scaleMealBefore(meal, people, override));
      expect(scaleMeal({ ...meal, personChanges: [] }, people, override)).toEqual(scaleMealBefore(meal, people, override));
    }
  });
});
