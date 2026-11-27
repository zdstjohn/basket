import { describe, expect, it } from 'vitest';
import { toMeal } from '@/lib/db/queries/meals';
import { tacosRow, wm } from './leftover-fixtures';
import type { WeekMeal } from '@/lib/db/rows';
import { weekEntries } from '@/lib/list/entries';

const meals = new Map([[tacosRow.id, tacosRow]]);

describe('weekEntries', () => {
  it('a leftovers night is not an entry', () => {
    const rows = [wm('a', 'wed', tacosRow.id, { servings_override: 7.6 }), wm('b', 'fri', tacosRow.id, { servings_override: 0, leftover_of: 'a' })];
    expect(weekEntries(rows, meals)).toEqual([{ meal: toMeal(tacosRow), servings: 7.6 }]);
  });
  it('keeps ordinary nights, with and without an override, and drops a night whose meal did not load', () => {
    const rows = [wm('a', 'mon', tacosRow.id), wm('c', 'tue', 'gone')];
    expect(weekEntries(rows, meals)).toEqual([{ meal: toMeal(tacosRow), servings: null }]);
  });
  it('a leftovers night whose cooking night is not in the rows still buys nothing', () => {
    expect(weekEntries([wm('b', 'fri', tacosRow.id, { servings_override: 0, leftover_of: 'a' })], meals)).toEqual([]);
  });
  it('a row cached before this release has no leftover_of and still buys', () => {
    const old = { ...wm('a', 'mon', tacosRow.id) } as Partial<WeekMeal>;
    delete old.leftover_of;
    expect(weekEntries([old as WeekMeal], meals)).toHaveLength(1);
  });
});
