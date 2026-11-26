import { describe, expect, it } from 'vitest';
import { eatsRole, householdServings, portionFactor } from '@/lib/domain/portions';
import type { Diet, Person } from '@/lib/domain/types';

const person = (age: number, diet: Diet = 'none'): Person => ({
  id: `p${age}`,
  name: `P${age}`,
  age,
  diet,
  appetite: 1,
  dislikes: [],
});

describe('portionFactor', () => {
  it('scales by age', () => {
    expect(portionFactor(4)).toBe(0.5);
    expect(portionFactor(6)).toBe(0.6);
    expect(portionFactor(8)).toBe(0.7);
    expect(portionFactor(13)).toBe(0.85);
    expect(portionFactor(38)).toBe(1);
    expect(portionFactor(1)).toBe(0.25);
  });
  it.each([
    [1, 0.25], [2, 0.4], [3, 0.4], [4, 0.5], [5, 0.5], [6, 0.6], [7, 0.6],
    [8, 0.7], [10, 0.7], [11, 0.85], [13, 0.85], [14, 1],
  ])('age %i -> %f', (age, f) => {
    expect(portionFactor(age)).toBe(f);
  });
  it('applies appetite', () => {
    expect(portionFactor(8, 1.5)).toBe(1.05);
  });
});

describe('householdServings', () => {
  it('sums and rounds to 0.1', () => {
    const people = [person(38), person(39, 'vegetarian'), person(8), person(6), person(4)];
    expect(householdServings(people)).toBe(3.8);
  });
});

describe('eatsRole', () => {
  it('respects diet', () => {
    expect(eatsRole('vegetarian', 'meat')).toBe(false);
    expect(eatsRole('pescatarian', 'fish')).toBe(true);
    expect(eatsRole('pescatarian', 'meat')).toBe(false);
    expect(eatsRole('none', 'meat')).toBe(true);
    expect(eatsRole('vegan', 'produce')).toBe(true);
  });
});
