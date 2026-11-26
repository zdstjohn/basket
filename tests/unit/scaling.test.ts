import { describe, expect, it } from 'vitest';
import { scaleMeal } from '@/lib/domain/scaling';
import { tacos } from '@/lib/fixtures/tacos';
import { familyOfFive } from '@/lib/fixtures/household';
import type { Meal, Person } from '@/lib/domain/types';

const line = (lines: ReturnType<typeof scaleMeal>, canonical: string) =>
  lines.find((l) => l.canonical === canonical);

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
});
