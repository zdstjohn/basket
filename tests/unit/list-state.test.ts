import { describe, expect, it } from 'vitest';
import { foldItemState } from '@/lib/list/state';
import { buildList, type ListInputs } from '@/lib/useWeekList';
import type { ItemState } from '@/lib/db/queries/list';

const flags = (o: Partial<ItemState> = {}): ItemState => ({ have_it: false, checked: false, outside_budget: false, ...o });

describe('foldItemState', () => {
  it('ORs the flags of the old food#kind rows into one row for the food', () => {
    expect(
      foldItemState({
        'salt#volume': flags({ have_it: true }),
        'salt#count:to taste': flags({ checked: true }),
      }),
    ).toEqual({ salt: flags({ have_it: true, checked: true }) });
  });

  it('lets the row keyed exactly by the food win whole', () => {
    const out = foldItemState({
      'salt#volume': flags({ have_it: true, checked: true }),
      salt: flags(),
    });
    expect(out.salt).toEqual(flags());
  });

  it('leaves food-keyed rows unchanged', () => {
    const rice = flags({ checked: true });
    expect(foldItemState({ rice })).toEqual({ rice });
  });

  it('folds mass, volume, plain count and named count rows', () => {
    expect(
      foldItemState({
        'beans#mass': flags({ have_it: true }),
        'beans#count': flags({ outside_budget: true }),
        'beans#count:can': flags({ checked: true }),
      }),
    ).toEqual({ beans: flags({ have_it: true, checked: true, outside_budget: true }) });
  });

  it('does not treat other # text as an old key', () => {
    expect(foldItemState({ 'sauce #5': flags({ checked: true }) })).toEqual({ 'sauce #5': flags({ checked: true }) });
  });
});

describe('buildList reads old-key rows', () => {
  it('puts a food in `checked` when only its old food#kind row is checked', () => {
    const raw: ListInputs = {
      entries: [],
      people: [],
      staples: [{ canonical: 'olive oil', amount: 2, unit: 'tbsp', role: 'pantry' }],
      alwaysHave: [],
      itemState: { 'olive oil#volume': flags({ checked: true, have_it: true }) },
      itemStores: [],
      categoryStore: {},
      prices: [],
    };
    const built = buildList(raw);
    expect(built.items.map((i) => i.key)).toEqual(['olive oil']);
    expect(built.checked.has('olive oil')).toBe(true);
    expect(built.items[0].haveIt).toBe(true);
  });
});
