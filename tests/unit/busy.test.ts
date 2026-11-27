import { describe, expect, it } from 'vitest';
import type { Day } from '@/lib/domain/weeks';
import {
  busyChoice,
  busyDays,
  busyLine,
  busySummary,
  cleanDays,
  quickReason,
  titleSaysMakeAhead,
  withChoice,
} from '@/lib/domain/busy';

const sunWeek: Day[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

describe('busy nights', () => {
  it('cleans what the database hands back', () => {
    expect(cleanDays(['thu', 'tue', 'tue', 'someday', 5, null])).toEqual(['tue', 'thu']);
    expect(cleanDays(null)).toEqual([]);
    expect(cleanDays('tue')).toEqual([]);
    expect(busyDays(['tue'], ['thu', 'tue'])).toEqual(['tue', 'thu']);
    expect(busyDays(undefined, undefined)).toEqual([]);
  });
  it('reads and sets one night', () => {
    expect(busyChoice('tue', ['tue'], ['tue'])).toBe('every');
    expect(busyChoice('thu', ['tue'], ['thu'])).toBe('week');
    expect(busyChoice('fri', ['tue'], ['thu'])).toBe('no');
    expect(withChoice(['tue'], ['thu'], 'thu', 'every')).toEqual({ every: ['tue', 'thu'], thisWeek: [] });
    expect(withChoice(['tue'], ['thu'], 'tue', 'week')).toEqual({ every: [], thisWeek: ['tue', 'thu'] });
    expect(withChoice(['tue'], ['thu'], 'tue', 'no')).toEqual({ every: [], thisWeek: ['thu'] });
    expect(withChoice([], [], 'sat', 'no')).toEqual({ every: [], thisWeek: [] });
  });
  it('writes the line under the week, in the week’s own order', () => {
    expect(busyLine([], sunWeek)).toBe('No busy nights this week');
    expect(busyLine(['tue'], sunWeek)).toBe('Busy nights: Tue');
    expect(busyLine(['thu', 'tue'], sunWeek)).toBe('Busy nights: Tue and Thu');
    expect(busyLine(['mon', 'tue', 'thu'], sunWeek)).toBe('Busy nights: Mon, Tue and Thu');
    expect(busyLine(['tue', 'thu'], ['wed', 'thu', 'fri', 'sat', 'sun', 'mon', 'tue'])).toBe('Busy nights: Thu and Tue');
    expect(busyLine(sunWeek, sunWeek)).toBe('Busy nights: every night');
  });
  it('sums up the sheet', () => {
    expect(busySummary([], [], sunWeek)).toBe('No busy nights.');
    expect(busySummary(['tue', 'fri'], [], sunWeek)).toBe('Every Tuesday and Friday.');
    expect(busySummary([], ['thu'], sunWeek)).toBe('This Thursday.');
    expect(busySummary(['tue'], ['thu'], sunWeek)).toBe('Every Tuesday, and this Thursday.');
  });
  it.each([
    [{ totalMinutes: 30, method: null, makeAhead: false }, 'minutes'],
    [{ totalMinutes: 31, method: null, makeAhead: false }, null],
    [{ totalMinutes: null, method: null, makeAhead: false }, null],
    [{ totalMinutes: 0, method: null, makeAhead: false }, null],
    [{ totalMinutes: 480, method: 'slow_cooker', makeAhead: false }, 'slow_cooker'],
    [{ totalMinutes: 20, method: 'slow_cooker', makeAhead: true }, 'minutes'],
    [{ totalMinutes: 70, method: 'oven', makeAhead: true }, 'make_ahead'],
    [{ totalMinutes: 70, method: 'grill', makeAhead: false }, null],
  ])('quick: %o → %s', (facts, want) => expect(quickReason(facts)).toBe(want));
  it('reads make-ahead from a title', () => {
    expect(['Make-ahead breakfast burritos', 'Overnight oats', 'Freezer-friendly chili', 'Grilled cheese'].map(titleSaysMakeAhead)).toEqual([true, true, true, false]);
  });
});
