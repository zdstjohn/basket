import { describe, expect, it } from 'vitest';
import { draftAsMeal, draftFlags } from '@/components/add-meal/RecipePage';
import { boxState, doneCopy, ideaNote } from '@/components/flags/DislikeBox';
import { allergyHits, inWords } from '@/components/flags/swap-notes';
import { findFlags, ingredientNames } from '@/lib/domain/flags';
import { swapIdeas } from '@/lib/domain/families';
import type { Person, PersonChange } from '@/lib/domain/types';
import { familyOfFive } from '@/lib/fixtures/household';
import { soup } from '@/lib/fixtures/soup';
import type { RecipeDraft } from '@/lib/ai/schemas';

const people: Person[] = familyOfFive.map((p) =>
  p.id === 'daughter-4' ? { ...p, dislikes: ['mushrooms'], allergies: ['tree nuts'] } : p,
);
const [flag] = findFlags(ingredientNames(soup), people);
const leaveOut: PersonChange = { personId: 'daughter-4', food: 'mushrooms', action: 'leave_out' };
const zucchini = swapIdeas('mushrooms').find((i) => i.canonical === 'zucchini')!;
const whiteBeans = swapIdeas('mushrooms').find((i) => i.canonical === 'white beans')!;
const swapZucchini: PersonChange = { personId: 'daughter-4', food: 'mushrooms', action: 'swap', swap: zucchini };

const draft: RecipeDraft = {
  name: soup.name,
  baseServings: soup.baseServings,
  ingredients: soup.ingredients,
  vegSwap: null,
  sourceUrl: null,
  photo: null,
  personChanges: [],
};

describe('the dislike box', () => {
  it('knows when a flag has been dealt with', () => {
    expect(flag.kind).toBe('dislike');
    expect(boxState(flag, [])).toBe('ask');
    expect(boxState(flag, [leaveOut])).toBe('done');
    expect(boxState(flag, [{ ...leaveOut, personId: 'son' }])).toBe('ask');
    expect(boxState(flag, [{ ...leaveOut, food: 'olives' }])).toBe('ask');
  });
  it('words the done state', () => {
    expect(doneCopy(flag, [leaveOut], people, 4)).toEqual({ head: 'Daughter (4): no mushrooms', sub: 'Mushrooms cut to 4 people' });
    expect(doneCopy(flag, [swapZucchini], people, 4).head).toBe('Daughter (4): zucchini instead of mushrooms');
  });
  it('says what a swap does to the list', () => {
    expect(ideaNote(whiteBeans, soup)).toBe('Already on the list');
    expect(ideaNote(zucchini, soup)).toBe('Adds zucchini to the list');
  });
  it('writes the count in words up to twelve', () => {
    expect([1, 4, 12, 13].map(inWords)).toEqual(['one', 'four', 'twelve', '13']);
  });
  it('a draft carries the choices into the list math', () => {
    expect(draftAsMeal({ ...draft, personChanges: [leaveOut] }).personChanges).toEqual([leaveOut]);
  });
});

describe('a restored draft', () => {
  it('still shows the allergy when its cleaned names lost the food, if the matched word was kept', () => {
    const cleaned: RecipeDraft = { ...draft, ingredients: [{ canonical: 'dried cranberries', amount: 1, unit: 'cup', role: 'pantry' }] };
    const peanutAllergy = people.map((p) => (p.id === 'son' ? { ...p, allergies: ['peanuts'] } : p));
    expect(draftFlags(cleaned, peanutAllergy).some((f) => f.kind === 'allergy')).toBe(false);
    expect(draftFlags(cleaned, peanutAllergy, ['peanuts']).some((f) => f.kind === 'allergy')).toBe(true);
  });
});

describe('a swapped-in food', () => {
  const walnuts = { canonical: 'walnuts', amountPerServing: 1, unit: 'each', role: 'other' as const };
  const sonSwap: PersonChange = { personId: 'son', food: 'mushrooms', action: 'swap', swap: walnuts };
  const withSon: Person[] = people.map((p) => (p.id === 'son' ? { ...p, dislikes: ['mushrooms'] } : p));

  it('is checked against allergies like any other ingredient', () => {
    expect(ingredientNames(soup)).not.toContain('walnuts');
    const meal = { ...soup, personChanges: [sonSwap] };
    expect(ingredientNames(meal)).toContain('walnuts');
    const flags = findFlags(ingredientNames(meal), withSon);
    expect(flags.filter((f) => f.kind === 'allergy').map((f) => f.people.map((p) => p.id))).toEqual([['daughter-4']]);
    expect(draftFlags({ ...draft, personChanges: [sonSwap] }, withSon).some((f) => f.kind === 'allergy')).toBe(true);
  });
  it('is blocked in the swap sheet, and zucchini is not', () => {
    expect(allergyHits(walnuts, withSon)).toHaveLength(1);
    expect(allergyHits(zucchini, withSon)).toEqual([]);
    expect(allergyHits(null, withSon)).toEqual([]);
  });
});

describe('boxState matches like the list math', () => {
  it('counts "mushroom" and "mushrooms" as the same food', () => {
    expect(boxState(flag, [{ ...leaveOut, food: 'mushroom' }])).toBe('done');
    expect(doneCopy(flag, [{ ...leaveOut, food: 'mushroom' }], people, 4).head).toBe('Daughter (4): no mushrooms');
  });
});
