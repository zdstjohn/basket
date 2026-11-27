import { describe, expect, it } from 'vitest';
import type { MatchRow } from '@/lib/list/matches';
import { MATCH_MAX_AGE_MS } from '@/lib/list/matches';
import { foodsToAsk, forget, pricesStale, type Asked } from '@/lib/list/match-requests';

const NOW = Date.parse('2026-11-26T12:00:00Z');
const row = (canonical: string, ageMs: number): MatchRow => ({
  canonical, locationId: 'L', term: canonical, candidates: [], fetchedAt: new Date(NOW - ageMs).toISOString(),
});
const key = (f: string) => `L|${f}`;
const none = new Map<string, never>();

describe('foodsToAsk', () => {
  it('asks for foods with no search, and not again while asked within the day', () => {
    const asked: Asked = new Map();
    expect(foodsToAsk(['milk'], key, new Map(), none, asked, NOW)).toEqual(['milk']);
    asked.set(key('milk'), NOW);
    expect(foodsToAsk(['milk'], key, new Map(), none, asked, NOW + 60_000)).toEqual([]);
  });

  it('a failed request followed by a retry asks again, and a success is not repeated', () => {
    const asked: Asked = new Map([[key('milk'), NOW]]);
    forget(asked, [key('milk')]); // the request never reached the server
    expect(foodsToAsk(['milk'], key, new Map(), none, asked, NOW + 1000)).toEqual(['milk']);
    asked.set(key('milk'), NOW + 1000);
    const have = new Map([['milk', row('milk', 0)]]); // the retry worked
    expect(foodsToAsk(['milk'], key, have, none, asked, NOW + 2000)).toEqual([]);
  });

  it('asks again once the request is older than the max age', () => {
    const asked: Asked = new Map([[key('milk'), NOW]]);
    const have = new Map([['milk', row('milk', 0)]]);
    expect(foodsToAsk(['milk'], key, have, none, asked, NOW + MATCH_MAX_AGE_MS - 1)).toEqual([]);
    expect(foodsToAsk(['milk'], key, have, none, asked, NOW + MATCH_MAX_AGE_MS + 1)).toEqual(['milk']);
  });

  it('a limited answer (not forgotten) is not asked again the same day', () => {
    const asked: Asked = new Map([[key('milk'), NOW]]);
    expect(foodsToAsk(['milk'], key, new Map(), none, asked, NOW + 3_600_000)).toEqual([]);
  });
});

describe('pricesStale', () => {
  it('turns on when a saved search passes its day, with no failed lookup', () => {
    const have = new Map([['milk', row('milk', MATCH_MAX_AGE_MS - 1000)]]);
    expect(pricesStale(['milk'], have, none, false, NOW)).toBe(false);
    expect(pricesStale(['milk'], have, none, false, NOW + 2000)).toBe(true);
  });
  it('a food with no search is stale only after a failed lookup', () => {
    expect(pricesStale(['milk'], new Map(), none, false, NOW)).toBe(false);
    expect(pricesStale(['milk'], new Map(), none, true, NOW)).toBe(true);
  });
});
