import { describe, expect, it } from 'vitest';
import { daysOfWeek, dinnerDate, todayIn, weekStartFor } from '@/lib/domain/weeks';

const LA = 'America/Los_Angeles';

describe('weekStartFor', () => {
  it('uses the local date in the time zone (Saturday night)', () => {
    expect(weekStartFor(new Date('2026-11-29T07:59:00Z'), 'sun', LA)).toBe('2026-11-22');
  });
  it('rolls over at local midnight', () => {
    expect(weekStartFor(new Date('2026-11-29T08:00:00Z'), 'sun', LA)).toBe('2026-11-29');
  });
  it('finds the most recent start day on or before today', () => {
    expect(weekStartFor(new Date('2026-11-26T20:00:00Z'), 'mon', LA)).toBe('2026-11-23');
  });
  it('crosses month boundaries', () => {
    expect(weekStartFor(new Date('2026-12-02T20:00:00Z'), 'sun', LA)).toBe('2026-11-29');
  });
});

describe('daysOfWeek', () => {
  it('starts at the given day', () => {
    expect(daysOfWeek('mon')[0]).toBe('mon');
    expect(daysOfWeek('mon')[6]).toBe('sun');
    expect(daysOfWeek('sun')).toEqual(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
  });
});

describe('dinnerDate', () => {
  it('finds the date of a day in a week, across a month end and any start day', () => {
    expect(dinnerDate('2026-11-22', 'wed')).toBe('2026-11-25');
    expect(dinnerDate('2026-11-29', 'sat')).toBe('2026-12-05');
    expect(dinnerDate('2026-11-23', 'sun')).toBe('2026-11-29'); // a Monday-start week
  });
  it('gives the start date itself for the start day', () => {
    expect(dinnerDate('2026-11-23', 'mon')).toBe('2026-11-23');
  });
});

describe('todayIn', () => {
  it('knows today in the household zone', () => {
    expect(todayIn(LA, new Date('2026-11-27T05:30:00Z'))).toBe('2026-11-26');
  });
  it('is still the same day at 11:30 PM Pacific when UTC is the next day', () => {
    expect(todayIn(LA, new Date('2026-11-27T07:30:00Z'))).toBe('2026-11-26');
    expect(todayIn(LA, new Date('2026-11-27T08:00:00Z'))).toBe('2026-11-27');
  });
  it('is right around spring forward (2026-03-08)', () => {
    expect(todayIn(LA, new Date('2026-03-08T07:59:00Z'))).toBe('2026-03-07');
    expect(todayIn(LA, new Date('2026-03-08T08:00:00Z'))).toBe('2026-03-08');
    expect(todayIn(LA, new Date('2026-03-09T06:59:00Z'))).toBe('2026-03-08'); // 11:59 PM PDT
    expect(todayIn(LA, new Date('2026-03-09T07:00:00Z'))).toBe('2026-03-09');
  });
  it('is right around fall back (2026-11-01)', () => {
    expect(todayIn(LA, new Date('2026-11-01T06:59:00Z'))).toBe('2026-10-31'); // 11:59 PM PDT
    expect(todayIn(LA, new Date('2026-11-01T07:00:00Z'))).toBe('2026-11-01');
    expect(todayIn(LA, new Date('2026-11-02T07:59:00Z'))).toBe('2026-11-01'); // 11:59 PM PST
    expect(todayIn(LA, new Date('2026-11-02T08:00:00Z'))).toBe('2026-11-02');
  });
});
