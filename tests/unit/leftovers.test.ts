import { describe, expect, it } from 'vitest';
import type { Day } from '@/lib/domain/weeks';
import {
  cookNightOf,
  cookState,
  cookedNights,
  defaultChoice,
  doubleServings,
  laterWords,
  leftoverFor,
  nightChoices,
  type Night,
} from '@/lib/domain/leftovers';

const n = (id: string, day: string, o: Partial<Night> = {}): Night => ({ id, day, slot: 'dinner', meal_id: 'm-' + id, servings_override: null, ...o });
const sunWeek: Day[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

describe('leftovers', () => {
  it('only cooked nights buy food', () => {
    const rows = [n('a', 'wed', { servings_override: 7.6 }), n('b', 'fri', { meal_id: 'm-a', leftover_of: 'a', servings_override: 0 }), n('c', 'mon')];
    expect(cookedNights(rows).map((r) => r.id)).toEqual(['a', 'c']);
    expect(cookedNights([{ ...n('old', 'tue') }])).toHaveLength(1);
    expect(leftoverFor(rows, 'a')?.id).toBe('b');
    expect(leftoverFor(rows, 'c')).toBeNull();
    expect(cookNightOf(rows, rows[1])?.id).toBe('a');
    expect(cookNightOf([rows[1]], rows[1])).toBeNull();
  });
  it('doubles to one decimal', () => {
    expect(doubleServings(3.8)).toBe(7.6);
    expect(doubleServings(3.85)).toBe(7.7);
  });
  it.each([
    [null, false, { kind: 'usual' }],
    [3.8, false, { kind: 'usual' }],
    [7.6, false, { kind: 'double', night: null }],
    [5.8, false, { kind: 'extra', servings: 2 }],
    [7.6, true, { kind: 'double', night: 'fri' }],
    [5.8, true, { kind: 'double', night: 'fri' }],
  ])('cook state for override %s (leftovers row: %s)', (override, has, want) => {
    const cook = n('a', 'wed', { servings_override: override });
    const rows = has ? [cook, n('b', 'fri', { leftover_of: 'a', meal_id: 'm-a', servings_override: 0 })] : [cook];
    expect(cookState(cook, rows, 3.8)).toEqual(want);
  });
  it('offers later nights of the same week, up to four days on', () => {
    const rows = [n('a', 'sun'), n('x', 'tue'), n('l', 'wed', { leftover_of: 'z' })];
    const got = nightChoices({ cookDay: 'sun', slot: 'dinner', weekDays: sunWeek, rows, busy: ['thu'], cookId: 'a' });
    expect(got.map((c) => [c.day, c.daysLater, c.taken, c.busy])).toEqual([
      ['mon', 1, null, false], ['tue', 2, 'dinner', false], ['wed', 3, 'leftovers', false], ['thu', 4, null, true],
    ]);
    expect(got[1].takenMealId).toBe('m-x');
    expect(defaultChoice(got)).toBe('thu');
  });
  it('offers nothing after the last night, and follows a week that starts on Wednesday', () => {
    expect(nightChoices({ cookDay: 'sat', slot: 'dinner', weekDays: sunWeek, rows: [], busy: [], cookId: 'a' })).toEqual([]);
    const wedWeek: Day[] = ['wed', 'thu', 'fri', 'sat', 'sun', 'mon', 'tue'];
    expect(nightChoices({ cookDay: 'sat', slot: 'dinner', weekDays: wedWeek, rows: [], busy: [], cookId: 'a' }).map((c) => c.day)).toEqual(['sun', 'mon', 'tue']);
  });
  it('treats its own leftovers night as free and current, and ignores other slots', () => {
    const rows = [n('a', 'wed'), n('b', 'fri', { leftover_of: 'a' }), { ...n('lunch', 'thu'), slot: 'lunch' }];
    const got = nightChoices({ cookDay: 'wed', slot: 'dinner', weekDays: sunWeek, rows, busy: [], cookId: 'a' });
    expect(got.map((c) => [c.day, c.taken, c.current])).toEqual([['thu', null, false], ['fri', null, true], ['sat', null, false]]);
    expect(defaultChoice(got)).toBe('fri');
  });
  it('falls back to the first free night, then to no set night', () => {
    const free = nightChoices({ cookDay: 'wed', slot: 'dinner', weekDays: sunWeek, rows: [n('x', 'thu')], busy: [], cookId: 'a' });
    expect(defaultChoice(free)).toBe('fri');
    const full = nightChoices({ cookDay: 'thu', slot: 'dinner', weekDays: sunWeek, rows: [n('x', 'fri'), n('y', 'sat')], busy: ['fri'], cookId: 'a' });
    expect(defaultChoice(full)).toBeNull();
  });
  it('says how far away a night is', () => {
    expect([1, 2, 4].map(laterWords)).toEqual(['The next night', '2 days later', '4 days later']);
  });
});
