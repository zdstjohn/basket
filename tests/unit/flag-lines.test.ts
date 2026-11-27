import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AllergyBox } from '@/components/flags/AllergyBox';
import { cardFlagText, cardLines, FlagLines } from '@/components/flags/FlagLines';
import { allergyLabel, draftFlags } from '@/components/add-meal/RecipePage';
import { findFlags, ingredientNames } from '@/lib/domain/flags';
import type { Person } from '@/lib/domain/types';
import { familyOfFive } from '@/lib/fixtures/household';
import { soup } from '@/lib/fixtures/soup';
import { fakeSpoonacular } from '@/lib/recipes/search/fake';

const people: Person[] = familyOfFive.map((p) =>
  p.id === 'daughter-4' ? { ...p, dislikes: ['mushrooms'], allergies: ['tree nuts'] } : p,
);

const results = await fakeSpoonacular('soup');
const soupOption = results.find((o) => o.title === 'White bean and mushroom soup')!;
const pilaf = results.find((o) => o.title === 'Broccolini quinoa pilaf with toasted almonds')!;
const [tacosOption] = await fakeSpoonacular('tacos');

describe('the flag text on a card', () => {
  it('speaks the flag in the card name', () => {
    expect(cardFlagText(pilaf, people)).toBe(', Tree nut allergy: Daughter (4). Lists almonds. Check labels.');
    expect(cardFlagText(soupOption, people)).toBe(', Has cremini mushrooms. Daughter (4) won’t eat them.');
    expect(cardFlagText(tacosOption, people)).toBe('');
  });
  it('speaks it for a saved meal too, and never says safe', () => {
    expect(cardFlagText(soup, people)).toBe(', Has cremini mushrooms. Daughter (4) won’t eat them.');
    expect(cardFlagText(pilaf, people) + cardFlagText(soup, people)).not.toMatch(/\bsafe\b|nut-free|allergen-free|free of|no allergens/i);
  });
  it('says nothing before people are known, or when nobody listed anything', () => {
    expect(cardFlagText(pilaf, [])).toBe('');
    expect(cardFlagText(pilaf, familyOfFive)).toBe('');
  });
  it('shows one allergy line when one person lists both "tree nuts" and "almonds"', () => {
    const both = people.map((p) => (p.id === 'daughter-4' ? { ...p, allergies: ['tree nuts', 'almonds'] } : p));
    expect(cardFlagText(pilaf, both)).toBe(', Tree nut allergy: Daughter (4). Lists almonds. Check labels.');
  });
});

describe('the lines on a card', () => {
  it('keeps at most three extra lines on a card and never drops the allergy', () => {
    expect(cardLines({ shares: true, made: true, allergy: true, dislike: true })).toEqual(['made', 'allergy', 'dislike']);
    expect(cardLines({ shares: true, made: false, allergy: true, dislike: true })).toEqual(['shares', 'allergy', 'dislike']);
    expect(cardLines({ shares: true, made: false, allergy: false, dislike: false })).toEqual(['shares']);
  });
});

describe('what the components print', () => {
  const flags = findFlags(ingredientNames(pilaf), people);
  it('prints the allergy line with the warning icon, and no word like safe', () => {
    const html = renderToStaticMarkup(createElement(FlagLines, { flags, people }));
    expect(html).toContain('data-testid="result-flag"');
    expect(html).toContain('data-kind="allergy"');
    expect(html).toContain('Tree nut allergy: Daughter (4)');
    expect(html).toContain('Lists almonds. Check labels.');
    expect(html).toContain('<svg');
    expect(html).not.toMatch(/\bsafe\b|nut-free|allergen-free|free of|no allergens/i);
  });
  it('prints the box as an alert that says to check every label', () => {
    const html = renderToStaticMarkup(createElement(AllergyBox, { flags, people }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-testid="allergy-box"');
    expect(html).toContain('<strong class="font-semibold">almonds</strong>');
    expect(html).toContain('check every label');
  });
  it('prints nothing without an allergy or a flag', () => {
    expect(renderToStaticMarkup(createElement(AllergyBox, { flags: [], people }))).toBe('');
    expect(renderToStaticMarkup(createElement(FlagLines, { flags: [], people }))).toBe('');
  });
  it('marks the matching ingredient row with the family', () => {
    const allergies = flags.filter((f) => f.kind === 'allergy');
    expect(allergyLabel('sliced almonds', allergies)).toBe('tree nut');
    expect(allergyLabel('quinoa', allergies)).toBeNull();
  });
});

describe('the draft checks the picked recipe\'s own lines too', () => {
  const peanuts = people.map((p) => (p.id === 'daughter-4' ? { ...p, allergies: ['peanuts'] } : p));
  const draft = {
    name: 'Noodles', baseServings: 4, vegSwap: null, sourceUrl: null, photo: null,
    ingredients: [{ canonical: 'noodles', amount: 1, unit: 'lb', role: 'pantry' as const }],
  } as unknown as Parameters<typeof draftFlags>[0];
  it('still flags when the cleaned names dropped the peanut', () => {
    expect(draftFlags(draft, peanuts)).toEqual([]);
    const flags = draftFlags(draft, peanuts, ['1 lb noodles', '1/4 cup peanuts']);
    expect(flags.map((f) => f.kind)).toEqual(['allergy']);
    expect(flags[0].found).toEqual(['peanuts']);
  });
  it('bolds a whole word only', () => {
    const f = findFlags(['1/4 cup peanuts'], peanuts);
    const html = renderToStaticMarkup(createElement(AllergyBox, { flags: f, people: peanuts }));
    expect(html).toContain('<strong class="font-semibold">peanuts</strong>');
    expect(html).not.toContain('pea<strong');
  });
});
