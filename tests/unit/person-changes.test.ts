import { describe, expect, it } from 'vitest';
import { PersonChangeSchema } from '@/lib/ai/schemas';
import { setPersonChanges, toMeal } from '@/lib/db/queries/meals';
import type { MealRow } from '@/lib/db/rows';
import { isAllergyChange } from '@/lib/domain/flags';
import type { PersonChange } from '@/lib/domain/types';
import { familyOfFive } from '@/lib/fixtures/household';
import { soup } from '@/lib/fixtures/soup';

const row = (person_changes: unknown): MealRow =>
  ({
    id: 'm1', household_id: 'h1', name: 'Soup', base_servings: 4, ingredients: soup.ingredients, veg_swap: null,
    everyone_vegetarian: false, is_favorite: false, created_at: '', photo_credit: null, photo_credit_url: null,
    photo_path: null, photo_url: null, source_url: null, times_planned: 0, person_changes,
  }) as unknown as MealRow;

const good: PersonChange = { personId: 'son', food: 'mushrooms', action: 'leave_out' };
const zucchini = { canonical: 'zucchini', amountPerServing: 0.25, unit: 'each', role: 'produce' as const };

describe('PersonChangeSchema', () => {
  it('needs a swap when the action is swap, and takes a leave out without one', () => {
    expect(PersonChangeSchema.safeParse(good).success).toBe(true);
    expect(PersonChangeSchema.safeParse({ ...good, action: 'swap' }).success).toBe(false);
    expect(PersonChangeSchema.safeParse({ ...good, action: 'swap', swap: zucchini }).success).toBe(true);
    expect(PersonChangeSchema.safeParse({ ...good, food: '' }).success).toBe(false);
  });
});

describe('toMeal and person_changes', () => {
  it('drops the entries that fail and keeps the good one', () => {
    const bad = [{ personId: 5 }, 'junk', { personId: 'x', food: 'y', action: 'swap' }];
    expect(toMeal(row([good, ...bad])).personChanges).toEqual([good]);
  });
  it('reads a missing or odd column as no changes', () => {
    expect(toMeal(row(null)).personChanges).toEqual([]);
    expect(toMeal(row({ not: 'a list' })).personChanges).toEqual([]);
  });
});

describe('an allergy is never left out or swapped', () => {
  const nutty = familyOfFive.map((p) => (p.id === 'son' ? { ...p, allergies: ['tree nuts'] } : p));
  const son = nutty[2];
  it('knows a change that names one of the person’s allergies, by family', () => {
    expect(isAllergyChange({ personId: 'son', food: 'almonds', action: 'leave_out' }, son)).toBe(true);
    expect(isAllergyChange({ personId: 'son', food: 'tree nuts', action: 'swap', swap: zucchini }, son)).toBe(true);
    expect(isAllergyChange({ personId: 'son', food: 'mushrooms', action: 'leave_out' }, son)).toBe(false);
    expect(isAllergyChange({ personId: 'son', food: 'almonds', action: 'leave_out' }, familyOfFive[2])).toBe(false);
  });

  const fakeSb = (people: unknown[]) => {
    const calls: string[] = [];
    const sb = {
      from: (table: string) => {
        calls.push(table);
        if (table === 'people') return { select: () => ({ in: async () => ({ data: people, error: null }) }) };
        return { update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: row([]), error: null }) }) }) }) };
      },
    };
    return { sb: sb as never, calls };
  };

  it('setPersonChanges rejects a change for an allergy and writes nothing', async () => {
    const { sb, calls } = fakeSb([{ id: 'son', allergies: ['tree nuts'] }]);
    await expect(setPersonChanges(sb, 'm1', [{ personId: 'son', food: 'almonds', action: 'leave_out' }])).rejects.toThrow(/allergy/i);
    expect(calls).not.toContain('meals');
  });
  it('setPersonChanges saves a won’t-eat change', async () => {
    const { sb, calls } = fakeSb([{ id: 'son', allergies: ['tree nuts'] }]);
    await setPersonChanges(sb, 'm1', [good]);
    expect(calls).toContain('meals');
  });
});
