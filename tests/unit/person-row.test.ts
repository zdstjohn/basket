import { describe, expect, it } from 'vitest';
import { allergyText, detailText } from '@/components/PersonRow';
import { addFood, allergyHelp, exactWordsOnly, mergeList, showSuggestions } from '@/components/household/FoodChips';
import type { Person } from '@/lib/domain/types';

const p: Person = { id: 'p1', name: 'Daughter', age: 4, diet: 'none', appetite: 1, dislikes: [], allergies: [] };

describe('person row text', () => {
  it('says what a person will not eat, and drops "No restrictions" when there is something to say', () => {
    expect(detailText({ ...p, diet: 'none', dislikes: [], allergies: [] })).toBe('No restrictions');
    expect(detailText({ ...p, diet: 'none', dislikes: ['olives', 'cilantro'], allergies: [] })).toBe('Won’t eat olives, cilantro');
    expect(detailText({ ...p, diet: 'vegetarian', dislikes: ['beets'], allergies: [] })).toBe('Vegetarian · Won’t eat beets');
    expect(detailText({ ...p, diet: 'none', dislikes: [], allergies: ['tree nuts'] })).toBe('');
  });
  it('reads a person cached before allergies existed', () => {
    const old: Person = { id: 'p2', name: 'Dad', age: 38, diet: 'none', appetite: 1, dislikes: [] };
    expect(detailText(old)).toBe('No restrictions');
    expect(allergyText(old)).toBeNull();
  });
  it('gives allergies their own line', () => {
    expect(allergyText({ ...p, allergies: [] })).toBeNull();
    expect(allergyText({ ...p, allergies: ['tree nuts'] })).toBe('Allergy: tree nuts');
    expect(allergyText({ ...p, allergies: ['shellfish', 'sesame'] })).toBe('Allergies: shellfish, sesame');
  });
});

describe('addFood', () => {
  it('adds a cleaned food once', () => {
    expect(addFood([], '  Mushrooms ')).toEqual({ list: ['mushrooms'], error: null });
    expect(addFood(['mushrooms'], 'MUSHROOMS')).toEqual({ list: ['mushrooms'], error: 'That’s already on the list.' });
    expect(addFood([], '   ')).toEqual({ list: [], error: null });
    expect(addFood(Array.from({ length: 30 }, (_, i) => `f${i}`), 'x').error).toBe('That’s 30 already. Remove one first.');
  });
  it('tells nothing typed from too much typed', () => {
    expect(addFood(['olives'], 'x'.repeat(41))).toEqual({ list: ['olives'], error: 'Keep it under 40 letters.' });
  });
});

describe('allergies that match nothing', () => {
  it('knows a typo from a food family', () => {
    expect(exactWordsOnly('penuts')).toBe(true);
    expect(exactWordsOnly('peanuts')).toBe(false);
    expect(exactWordsOnly('cashew nuts')).toBe(false);
  });
  it('keeps the suggestions up while any entry matches nothing', () => {
    expect(showSuggestions([])).toBe(true);
    expect(showSuggestions(['peanuts'])).toBe(false);
    expect(showSuggestions(['peanuts', 'penuts'])).toBe(true);
  });
  it('lists what each allergy covers, once each', () => {
    expect(allergyHelp([])).toBe('None. Tap one, or type your own.');
    const both = allergyHelp(['peanuts', 'milk']);
    expect(both).toContain('Peanuts covers');
    expect(both).toContain('Milk covers');
    expect(allergyHelp(['tree nuts', 'tree nuts'])).toBe(allergyHelp(['tree nuts']));
    expect(allergyHelp(['penuts'])).toBe('');
  });
});

describe('a list changed on another phone', () => {
  it('keeps my additions and removals and takes everything else from the fresh list', () => {
    expect(mergeList(['a'], ['a', 'b'], ['a', 'c'])).toEqual(['a', 'c', 'b']);
    expect(mergeList(['a', 'b'], ['a'], ['a', 'b', 'c'])).toEqual(['a', 'c']);
    expect(mergeList(['a'], ['a'], ['a', 'c'])).toEqual(['a', 'c']);
    expect(mergeList(['a'], ['a', 'c'], ['a', 'c'])).toEqual(['a', 'c']);
  });
});
