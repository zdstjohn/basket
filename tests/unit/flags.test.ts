import { describe, expect, it } from 'vitest';
import { COMMON_ALLERGENS, familyFor } from '@/lib/domain/families';
import {
  allergyCopy, findFlags, flagAmount, flagCopy, ingredientNames, namesLabel, personLabel,
} from '@/lib/domain/flags';
import type { Person } from '@/lib/domain/types';
import { familyOfFive } from '@/lib/fixtures/household';
import { soup } from '@/lib/fixtures/soup';
import { tacos } from '@/lib/fixtures/tacos';

const people: Person[] = familyOfFive.map((p) => {
  if (p.id === 'daughter-4') return { ...p, dislikes: ['mushrooms'], allergies: ['tree nuts'] };
  if (p.id === 'son') return { ...p, dislikes: ['cilantro'] };
  return p;
});
const d4 = people[4];
const son = people[2];
const grandma = { ...people[0], id: 'g', name: 'Grandma', allergies: ['sesame'] };
const more = [...people, grandma];

describe('flags', () => {
  it('labels people who share a name with their age', () => {
    expect(personLabel(d4, people)).toBe('Daughter (4)');
    expect(personLabel(son, people)).toBe('Son');
    expect(namesLabel([people[0], son], people)).toBe('Dad and Son');
    expect(namesLabel([people[0], son, d4], people)).toBe('Dad, Son and Daughter (4)');
  });
  it('a dislike reads as an offer', () => {
    const [f] = findFlags(['8 oz cremini mushrooms', '1 can white beans'], people);
    expect(f).toMatchObject({ kind: 'dislike', food: 'mushrooms', found: ['cremini mushrooms'], often: false });
    const c = flagCopy(f, people, '8 oz');
    expect(c.cardHead).toBeNull();
    expect(c.cardBody).toBe('Has cremini mushrooms. Daughter (4) won’t eat them.');
    expect(c.head).toBe('Daughter (4) won’t eat mushrooms');
    expect(c.body).toBe('This has 8 oz cremini mushrooms. Change it just for Daughter (4)?');
    expect(c.pronoun).toBe('them');
    expect(flagCopy(f, people).body).toBe('This has cremini mushrooms. Change it just for Daughter (4)?');
  });
  it('two people and a singular food', () => {
    const two = people.map((p) => (p.id === 'dad' ? { ...p, dislikes: ['cilantro'] } : p));
    const c = flagCopy(findFlags(['1 bunch cilantro'], two)[0], two, '1 bunch');
    expect(c.head).toBe('Dad and Son won’t eat cilantro');
    expect(c.body).toBe('This has 1 bunch cilantro. Change it just for them?');
    expect(c.pronoun).toBe('it');
  });
  it('an allergy reads as a warning and comes first', () => {
    const flags = findFlags(['8 oz cremini mushrooms', '1/4 cup sliced almonds'], people);
    expect(flags.map((f) => f.kind)).toEqual(['allergy', 'dislike']);
    const c = flagCopy(flags[0], people);
    expect(c.cardHead).toBe('Tree nut allergy: Daughter (4)');
    expect(c.cardBody).toBe('Lists almonds. Check labels.');
    expect(allergyCopy(flags, people)).toEqual({
      head: 'Tree nut allergy: Daughter (4)',
      body: 'This recipe lists almonds. Other ingredients can have nuts in them too, so check every label.',
    });
  });
  it('an "often has" food says so', () => {
    const c = flagCopy(findFlags(['1/2 cup pesto'], people)[0], people);
    expect(c.cardBody).toBe('Pesto often has tree nuts. Check labels.');
  });
  it('names each allergy with its people when several are hit (M13)', () => {
    expect(allergyCopy(findFlags(['sliced almonds', '2 tbsp tahini'], more), more)).toEqual({
      head: 'Tree nuts: Daughter (4) · Sesame: Grandma',
      body: 'This recipe lists almonds and tahini. Other ingredients can have them too, so check every label.',
    });
    const dad = more.map((p) => (p.id === 'dad' ? { ...p, allergies: ['sesame'] } : p));
    expect(allergyCopy(findFlags(['sliced almonds', '2 tbsp tahini'], dad), dad)?.head)
      .toBe('Tree nuts: Daughter (4) · Sesame: Dad, Grandma');
  });
  it('joins allergies typed as the same family into one', () => {
    const mix = people.map((p) => (p.id === 'dad' ? { ...p, allergies: ['almonds'] } : p));
    const flags = findFlags(['sliced almonds'], mix);
    expect(flags).toHaveLength(2);
    expect(allergyCopy(flags, mix)?.head).toBe('Tree nut allergy: Dad, Daughter (4)');
  });
  it('says "often has" in the box too, alone and merged', () => {
    expect(allergyCopy(findFlags(['1/2 cup pesto'], people), people)?.body)
      .toBe('This recipe lists pesto, which often has nuts. Other ingredients can have nuts in them too, so check every label.');
    expect(allergyCopy(findFlags(['sliced almonds', '1 cup hummus'], more), more)?.body)
      .toBe('This recipe lists almonds and hummus (often has sesame). Other ingredients can have them too, so check every label.');
  });
  it('one typed allergy can cover several families', () => {
    const who = people.map((p) => (p.id === 'son' ? { ...p, allergies: ['eggs and dairy'] } : p));
    const flags = findFlags(['2 large eggs', '1 cup cheddar', '1 cup rice'], who).filter((f) => f.kind === 'allergy' && f.food === 'eggs and dairy');
    expect(flags).toHaveLength(1);
    expect(flags[0].found).toEqual(['eggs', 'cheddar']);
    expect(flagCopy(flags[0], who).cardHead).toBe('Eggs and dairy allergy: Son');
  });
  it('a typed word with no family keeps the typed word', () => {
    const who = people.map((p) => (p.id === 'son' ? { ...p, allergies: ['lychee'] } : p));
    const flags = findFlags(['2 lychees'], who);
    expect(flagCopy(flags[0], who).cardHead).toBe('Lychee allergy: Son');
    expect(allergyCopy(flags, who)?.body)
      .toBe('This recipe lists lychees. Other ingredients can have lychee in them too, so check every label.');
  });
  it('never says safe, always says to check labels, and says nothing when nothing matches', () => {
    expect(findFlags(['1 butternut squash', 'salt'], people)).toEqual([]);
    expect(allergyCopy([], people)).toBeNull();
    const banned = /\bsafe\b|\bsafely\b|nut-free|allergen-free|allergy-free|\bfree of\b|no allergens|\bok\b|\bokay\b|OK for/i;
    for (const a of COMMON_ALLERGENS) {
      const fam = familyFor(a)!;
      const who = people.map((p) => ({ ...p, allergies: p.id === 'son' ? [a] : [] }));
      for (const line of [fam.members[0], ...fam.often.slice(0, 1)]) {
        const flags = findFlags([line], who);
        expect(flags.length).toBeGreaterThan(0);
        const text = JSON.stringify([flags.map((f) => flagCopy(f, who)), allergyCopy(flags, who)]);
        expect(text).not.toMatch(banned);
        expect(flagCopy(flags[0], who).cardBody).toMatch(/Check labels\.$/);
        expect(allergyCopy(flags, who)!.body).toMatch(/check every label\.$/);
      }
    }
    // every allergy at once, and a dislike
    const all = people.map((p) => ({ ...p, allergies: p.id === 'son' ? [...COMMON_ALLERGENS] : [] }));
    const lines = ['almonds', 'pesto', 'peanuts', 'milk', 'eggs', 'flour', 'tofu', 'salmon', 'shrimp', 'tahini', 'cilantro'];
    const flags = findFlags(lines, all);
    const text = JSON.stringify([flags.map((f) => flagCopy(f, all, '1 cup')), allergyCopy(flags, all)]);
    expect(text).not.toMatch(banned);
    expect(allergyCopy(flags, all)!.body).toMatch(/check every label\.$/);
  });
  it('a food on both lists is only an allergy', () => {
    const both = people.map((p) => (p.id === 'daughter-4' ? { ...p, dislikes: ['almonds'], allergies: ['tree nuts'] } : p));
    expect(findFlags(['sliced almonds'], both).map((f) => f.kind)).toEqual(['allergy']);
  });
  it('an allergy to one member covers the family; a dislike of one member does not', () => {
    const p2 = people.map((p) => (p.id === 'daughter-4' ? { ...p, dislikes: ['cremini'], allergies: ['almonds'] } : p));
    const flags = findFlags(['chopped walnuts', 'shiitake'], p2);
    expect(flags.map((f) => [f.kind, f.food])).toEqual([['allergy', 'almonds']]);
    expect(flagCopy(flags[0], p2).cardHead).toBe('Tree nut allergy: Daughter (4)');
  });
  it('reads people saved before allergies existed', () => {
    const old = people.map((p) => ({ id: p.id, name: p.name, age: p.age, diet: p.diet, appetite: p.appetite, dislikes: [] }));
    expect(findFlags(['sliced almonds'], old)).toEqual([]);
  });
  it('finds the recipe’s own amount', () => {
    expect(flagAmount(soup, findFlags(ingredientNames(soup), people)[0])).toBe('8 oz');
    const onion = people.map((p) => (p.id === 'son' ? { ...p, dislikes: ['onion'] } : p));
    expect(flagAmount(soup, findFlags(ingredientNames(soup), onion).find((f) => f.food === 'onion')!)).toBe('1');
    expect(flagAmount(tacos, findFlags(['sliced almonds'], people)[0])).toBe('');
  });
  it('lists ingredient names, with the vegetarian swap and structured names', () => {
    expect(ingredientNames({ ...soup, vegSwap: { canonical: 'tofu', amountPerServing: 1, unit: 'oz', role: 'veg_protein' } }))
      .toEqual(['cremini mushrooms', 'white beans', 'yellow onion', 'tofu']);
    expect(ingredientNames({ ingredients: ['1 cup a'], structured: [{ canonical: 'a' }] })).toEqual(['a']);
    expect(ingredientNames({ ingredients: ['1 cup a'], structured: null })).toEqual(['1 cup a']);
    expect(ingredientNames({ ingredients: ['1 cup a'], structured: [] })).toEqual(['1 cup a']);
  });
});
