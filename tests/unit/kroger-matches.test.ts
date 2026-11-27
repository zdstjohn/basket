import { beforeEach, describe, expect, it, vi } from 'vitest';
import chicken from '../fixtures/kroger/products-chicken-thighs.json';
import { krogerSb } from '../helpers/kroger-sb';

vi.mock('@/lib/kroger/products', async (orig) => {
  const m = await orig<typeof import('@/lib/kroger/products')>();
  return { ...m, searchProducts: vi.fn() };
});

import { getMatches } from '@/lib/kroger/matches';
import { searchProducts, type KrogerProduct } from '@/lib/kroger/products';
import type { Candidate } from '@/lib/domain/packages';

const search = vi.mocked(searchProducts);
const HOUR = 3_600_000;
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();
const LOC = '70100390';
const cand = (upc: string, over: Partial<Candidate> = {}): Candidate => ({
  upc, name: 'Thing', brand: null, sizeText: '1 lb', size: null, soldBy: 'WEIGHT', regularCents: 399,
  promoCents: null, imageUrl: null, relevant: true, inStock: true, ...over,
});
const run = (sb: unknown, names: string[]) =>
  getMatches(names, { sb: sb as never, householdId: 'h1', locationId: LOC });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('KROGER_FAKE', '1');
  search.mockResolvedValue(chicken.data as KrogerProduct[]);
});

describe('getMatches', () => {
  it('uses a fresh cached row with no search and no spend', async () => {
    const { sb, calls } = krogerSb({ matches: [{ canonical: 'rice', term: 'rice', candidates: [cand('0001111000001')], fetched_at: ago(1) }] });
    const r = await run(sb, ['rice']);
    expect(search).not.toHaveBeenCalled();
    expect(calls.spend).toEqual([]);
    expect(r).toMatchObject({ limited: false, failed: 0 });
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]).toMatchObject({ canonical: 'rice', locationId: LOC, term: 'rice' });
    expect(r.matches[0].candidates[0].upc).toBe('0001111000001');
  });

  it('searches again after 24 hours and replaces the row', async () => {
    const { sb, calls } = krogerSb({ matches: [{ canonical: 'chicken thighs', term: 'chicken thighs', candidates: [], fetched_at: ago(25) }] });
    const r = await run(sb, ['chicken thighs']);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('chicken thighs', LOC);
    expect(calls.spend.filter((n) => n > 0)).toEqual([1]);
    expect(r.matches[0].candidates).toHaveLength(2);
    expect(Date.now() - Date.parse(r.matches[0].fetchedAt)).toBeLessThan(10_000);
    expect(calls.upserts.kroger_matches[0].rows[0]).toMatchObject({ household_id: 'h1', location_id: LOC, canonical: 'chicken thighs', term: 'chicken thighs' });
    expect(calls.upserts.kroger_matches[0].opts).toMatchObject({ onConflict: 'household_id,location_id,canonical' });
  });

  it('searches with the chosen search term when it differs from the cached one', async () => {
    const { sb } = krogerSb({
      matches: [{ canonical: 'chicken', term: 'chicken', candidates: [cand('0001111000001')], fetched_at: ago(1) }],
      choices: [{ canonical: 'chicken', search_term: 'chicken thighs' }],
    });
    const r = await run(sb, ['chicken']);
    expect(search).toHaveBeenCalledWith('chicken thighs', LOC);
    expect(r.matches[0].term).toBe('chicken thighs');
  });

  it('is limited, searches nothing and returns the stale row when the daily 400 is used', async () => {
    const stale = [cand('0001111000001')];
    const { sb } = krogerSb({ used: 401, matches: [{ canonical: 'rice', term: 'rice', candidates: stale, fetched_at: ago(30) }] });
    const r = await run(sb, ['rice', 'beans']);
    expect(r.limited).toBe(true);
    expect(search).not.toHaveBeenCalled();
    expect(r.matches.map((m) => m.canonical)).toEqual(['rice']);
    expect(r.matches[0].candidates[0].upc).toBe('0001111000001');
  });

  it('treats a refused spend as limited even when the unchanged total is under 400', async () => {
    const { sb, calls } = krogerSb({ used: 395 });
    const names = Array.from({ length: 10 }, (_, i) => `food ${i}`);
    const r = await run(sb, names);
    expect(r.limited).toBe(true);
    expect(search).not.toHaveBeenCalled();
    expect(calls.spend.filter((n) => n > 0).every((n) => n === 10)).toBe(true);
  });

  it('is limited when all households together are over the ceiling', async () => {
    const { sb } = krogerSb({ limited: true });
    const r = await run(sb, ['rice']);
    expect(r.limited).toBe(true);
    expect(search).not.toHaveBeenCalled();
  });

  it('works in chunks of 60, one spend per chunk', async () => {
    const { sb, calls } = krogerSb({});
    search.mockResolvedValue([]);
    const names = Array.from({ length: 130 }, (_, i) => `food ${i}`);
    const r = await run(sb, names);
    expect(calls.spend.filter((n) => n > 0)).toEqual([60, 60, 10]);
    expect(search).toHaveBeenCalledTimes(130);
    expect(r.matches).toHaveLength(130);
  });

  it('stops after the chunk that crosses the cap', async () => {
    const { sb } = krogerSb({ used: 300 });
    search.mockResolvedValue([]);
    const names = Array.from({ length: 130 }, (_, i) => `food ${i}`);
    const r = await run(sb, names);
    expect(r.limited).toBe(true);
    expect(search).toHaveBeenCalledTimes(60);
  });

  it('keeps the old row and counts a failure when a search throws, logging no token', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sb } = krogerSb({ matches: [{ canonical: 'rice', term: 'rice', candidates: [cand('0001111000001')], fetched_at: ago(30) }] });
    search.mockRejectedValueOnce(new Error('kroger /products 429'));
    const r = await run(sb, ['rice']);
    expect(r.failed).toBe(1);
    expect(r.limited).toBe(false);
    expect(r.matches[0].candidates[0].upc).toBe('0001111000001');
    expect(log).toHaveBeenCalledTimes(1);
    const text = log.mock.calls[0].map(String).join(' ');
    expect(text).toContain('kroger match failed');
    expect(text).not.toMatch(/bearer|token|secret/i);
    log.mockRestore();
  });

  it('returns the matches with failed set when the search worked but saving it failed', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sb } = krogerSb({ upsertError: 'db down' });
    const r = await run(sb, ['chicken thighs']);
    expect(search).toHaveBeenCalledTimes(1);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].candidates).toHaveLength(2);
    expect(r.failed).toBe(1);
    log.mockRestore();
  });

  it('saves an empty result as no candidates and does not ask again', async () => {
    const { sb, calls } = krogerSb({});
    search.mockResolvedValue([]);
    const first = await run(sb, ['unobtainium']);
    expect(first.matches[0].candidates).toEqual([]);
    expect(calls.upserts.kroger_matches[0].rows[0].candidates).toEqual([]);
    const second = await run(sb, ['unobtainium']);
    expect(search).toHaveBeenCalledTimes(1);
    expect(second.matches[0].candidates).toEqual([]);
  });

  it('logs one price observation per candidate, ignoring duplicates', async () => {
    const { sb, calls } = krogerSb({});
    await run(sb, ['chicken thighs']);
    const o = calls.upserts.price_observations[0];
    expect(o.opts).toMatchObject({ onConflict: 'household_id,location_id,upc,seen_on', ignoreDuplicates: true });
    expect(o.rows).toEqual([
      { household_id: 'h1', location_id: LOC, upc: '0020000000001', regular_cents: 399, promo_cents: null },
      { household_id: 'h1', location_id: LOC, upc: '0020000000002', regular_cents: 599, promo_cents: null },
    ]);
  });

  it('throws KrogerNotConfigured, spending nothing, when there are no credentials', async () => {
    vi.stubEnv('KROGER_FAKE', '');
    vi.stubEnv('KROGER_CLIENT_ID', '');
    vi.stubEnv('KROGER_CLIENT_SECRET', '');
    const { sb, calls } = krogerSb({});
    await expect(run(sb, ['rice'])).rejects.toMatchObject({ name: 'KrogerNotConfigured' });
    expect(calls.spend).toEqual([]);
  });
});
