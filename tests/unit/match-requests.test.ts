import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatchRow } from '@/lib/list/matches';
import { MATCH_MAX_AGE_MS } from '@/lib/list/matches';
import { answered, began, BACKOFF_MS, failed, foodsToAsk, latchBad, pricesStale, type Asked } from '@/lib/list/match-requests';
import { requestMatches } from '@/lib/list/matches-client';

const NOW = Date.parse('2026-11-26T12:00:00Z');
const row = (canonical: string, ageMs: number): MatchRow => ({
  canonical, locationId: 'L', term: canonical, candidates: [], fetchedAt: new Date(NOW - ageMs).toISOString(),
});
const key = (f: string) => `L|${f}`;
const none = new Map<string, never>();

const MIN = 60_000;
const ask = (asked: Asked, food: string, now: number) => foodsToAsk([food], key, new Map(), none, asked, now);

describe('foodsToAsk', () => {
  it('asks for foods with no search, and not again while the request holds the food for a day', () => {
    const asked: Asked = new Map();
    expect(ask(asked, 'milk', NOW)).toEqual(['milk']);
    began(asked, key('milk'), NOW);
    expect(ask(asked, 'milk', NOW + MIN)).toEqual([]);
  });

  it('a limited or empty answer is not asked again the same day', () => {
    const asked: Asked = new Map();
    began(asked, key('milk'), NOW);
    answered(asked, key('milk'), undefined, NOW);
    expect(ask(asked, 'milk', NOW + 3_600_000)).toEqual([]);
    expect(ask(asked, 'milk', NOW + MATCH_MAX_AGE_MS + 1)).toEqual(['milk']);
  });

  it('a food is asked again after its own cached row turns a day old, not a day after the request', () => {
    const asked: Asked = new Map();
    const r = row('milk', 23 * 3_600_000); // already 23h old when it came back
    answered(asked, key('milk'), r, NOW);
    const have = new Map([['milk', r]]);
    const at = (t: number) => foodsToAsk(['milk'], key, have, none, asked, t);
    expect(at(NOW + 3_600_000 - 1000)).toEqual([]);
    expect(at(NOW + 3_600_000 + 1000)).toEqual(['milk']);
  });
});

describe('backoff after a request that got no answer', () => {
  it('retries after 5 minutes, then 15, then 60 (the cap), and not sooner', () => {
    const asked: Asked = new Map();
    let t = NOW;
    const steps = [5, 15, 60, 60];
    for (const m of steps) {
      began(asked, key('milk'), t);
      failed(asked, key('milk'), t);
      expect(ask(asked, 'milk', t + m * MIN - 1)).toEqual([]);
      expect(ask(asked, 'milk', t + m * MIN)).toEqual(['milk']);
      t += m * MIN;
    }
    expect(BACKOFF_MS).toEqual([5 * MIN, 15 * MIN, 60 * MIN]);
  });

  it('starts over at 5 minutes after a success', () => {
    const asked: Asked = new Map();
    for (let i = 0; i < 3; i++) { began(asked, key('milk'), NOW); failed(asked, key('milk'), NOW); }
    began(asked, key('milk'), NOW);
    answered(asked, key('milk'), row('milk', 0), NOW);
    expect(asked.get(key('milk'))?.failures).toBe(0);
    began(asked, key('milk'), NOW);
    failed(asked, key('milk'), NOW);
    expect(ask(asked, 'milk', NOW + 5 * MIN)).toEqual(['milk']);
  });
});

describe('requestMatches: which failures are retried', () => {
  afterEach(() => vi.unstubAllGlobals());
  const status = async (code: number) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: code })));
    return requestMatches(['milk']);
  };

  it('500, 401 and 409 are not retried soon (not unreached)', async () => {
    for (const code of [500, 401, 409]) expect(await status(code)).toMatchObject({ failed: true, unreached: false });
  });
  it('502, 503 and 504 and a thrown fetch are unreached', async () => {
    for (const code of [502, 503, 504]) expect(await status(code)).toMatchObject({ failed: true, unreached: true });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect(await requestMatches(['milk'])).toMatchObject({ failed: true, unreached: true });
  });

  it('a 500 is not asked again until the day is up; a 503 is asked after 5 minutes but not after 1', async () => {
    for (const [code, retried] of [[500, false], [503, true]] as const) {
      const asked: Asked = new Map();
      began(asked, key('milk'), NOW);
      const res = await status(code);
      if (res.unreached) failed(asked, key('milk'), NOW);
      else answered(asked, key('milk'), undefined, NOW);
      expect(ask(asked, 'milk', NOW + MIN)).toEqual([]);
      expect(ask(asked, 'milk', NOW + 5 * MIN)).toEqual(retried ? ['milk'] : []);
      expect(ask(asked, 'milk', NOW + MATCH_MAX_AGE_MS)).toEqual(['milk']);
    }
  });
});

describe('latchBad', () => {
  it('keeps a food marked when a later success is for other foods, and clears it once it has a fresh search', () => {
    let bad = latchBad(new Set(), ['milk'], new Map(), none, NOW); // milk failed
    expect([...bad]).toEqual(['milk']);
    bad = latchBad(bad, ['rice'], new Map([['rice', row('rice', 0)]]), none, NOW); // rice worked
    expect([...bad]).toEqual(['milk']);
    expect(pricesStale(['milk', 'rice'], new Map([['rice', row('rice', 0)]]), none, bad, NOW)).toBe(true);
    bad = latchBad(bad, ['milk'], new Map([['milk', row('milk', 0)]]), none, NOW);
    expect(bad.size).toBe(0);
  });

  it('overlapping responses applied to the previous set do not overwrite each other', () => {
    const a = latchBad(new Set(), ['milk'], new Map(), none, NOW);
    const b = latchBad(a, ['egg'], new Map(), none, NOW);
    expect([...b].sort()).toEqual(['egg', 'milk']);
  });
});

describe('pricesStale', () => {
  it('turns on when a saved search passes its day, with no failed lookup', () => {
    const have = new Map([['milk', row('milk', MATCH_MAX_AGE_MS - 1000)]]);
    expect(pricesStale(['milk'], have, none, new Set(), NOW)).toBe(false);
    expect(pricesStale(['milk'], have, none, new Set(), NOW + 2000)).toBe(true);
  });
  it('a food with no search is stale only after a failed lookup', () => {
    expect(pricesStale(['milk'], new Map(), none, new Set(), NOW)).toBe(false);
    expect(pricesStale(['milk'], new Map(), none, new Set(['milk']), NOW)).toBe(true);
  });
});
