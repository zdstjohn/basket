import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import { saveMeal } from '@/lib/db/queries/meals';
import type { PersonChange } from '@/lib/domain/types';

// A chainable stand-in for the Supabase query builder (as in household-queries.test.ts).
function mockClient() {
  const inserted: unknown[] = [];
  const builder: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => unknown) => resolve({ data: { id: 'm1' }, error: null });
        return (...args: unknown[]) => {
          if (prop === 'insert') inserted.push(args[0]);
          return builder;
        };
      },
    },
  );
  const sb = { from: () => builder } as unknown as SupabaseClient<Database>;
  return { sb, inserted };
}

const draft = {
  name: 'White bean and mushroom soup',
  baseServings: 4,
  ingredients: [{ canonical: 'cremini mushrooms', amount: 8, unit: 'oz', role: 'produce' as const }],
  vegSwap: null,
  sourceUrl: 'https://example.com/soup',
  photo: { url: 'https://example.com/soup.jpg', credit: 'Example', creditUrl: 'https://example.com/soup' },
};
const leaveOut: PersonChange = { personId: 'daughter-4', food: 'mushrooms', action: 'leave_out' };

const today = {
  household_id: 'h',
  name: draft.name,
  base_servings: 4,
  ingredients: draft.ingredients,
  veg_swap: null,
  everyone_vegetarian: false,
  is_favorite: true,
  source_url: 'https://example.com/soup',
  photo_url: 'https://example.com/soup.jpg',
  photo_credit: 'Example',
  photo_credit_url: 'https://example.com/soup',
};

describe('saveMeal and person_changes', () => {
  it('saves the choices made on the draft with the meal', async () => {
    const { sb, inserted } = mockClient();
    await saveMeal(sb, 'h', { ...draft, personChanges: [leaveOut], isFavorite: true });
    expect(inserted).toEqual([{ ...today, person_changes: [leaveOut] }]);
  });
  it('saves an empty list when the draft has no choices', async () => {
    const { sb, inserted } = mockClient();
    await saveMeal(sb, 'h', { ...draft, isFavorite: true });
    expect(inserted).toEqual([{ ...today, person_changes: [] }]);
  });
});
