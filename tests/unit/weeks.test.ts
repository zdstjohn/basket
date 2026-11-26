import { describe, expect, it } from 'vitest';
import { daysOfWeek, weekStartFor } from '@/lib/domain/weeks';

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
