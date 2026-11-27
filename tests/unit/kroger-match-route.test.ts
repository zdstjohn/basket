import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireHousehold = vi.fn();
const getMatches = vi.fn();
vi.mock('@/lib/api/household-context', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/household-context')>()),
  requireHousehold: () => requireHousehold(),
}));
vi.mock('@/lib/kroger/matches', () => ({ getMatches: (...a: unknown[]) => getMatches(...a) }));

import { NextResponse } from 'next/server';
import { POST } from '@/app/api/kroger/match/route';
import { KrogerNotConfigured } from '@/lib/kroger/token';

const post = (body: unknown) => POST(new Request('http://x.test/api/kroger/match', { method: 'POST', body: JSON.stringify(body) }));
const ok = (loc: string | null = '70100390') => ({ sb: {}, household: { id: 'h1', kroger_location_id: loc } });

beforeEach(() => {
  vi.clearAllMocks();
  requireHousehold.mockResolvedValue(ok());
  getMatches.mockResolvedValue({ matches: [], limited: false, failed: 0 });
});

describe('POST /api/kroger/match', () => {
  it('401 signed out', async () => {
    requireHousehold.mockResolvedValue(NextResponse.json({ error: 'unauthorized' }, { status: 401 }));
    expect((await post({ canonicals: ['rice'] })).status).toBe(401);
  });
  it('404 with no household', async () => {
    requireHousehold.mockResolvedValue(NextResponse.json({ error: 'no_household' }, { status: 404 }));
    expect((await post({ canonicals: ['rice'] })).status).toBe(404);
  });
  it('400 for an empty list, 61 names, an 81-character name, an empty name or junk', async () => {
    const bad = [
      { canonicals: [] },
      { canonicals: Array.from({ length: 61 }, (_, i) => `food ${i}`) },
      { canonicals: ['x'.repeat(81)] },
      { canonicals: [''] },
      { canonicals: [5] },
      {},
      null,
    ];
    for (const b of bad) expect((await post(b)).status).toBe(400);
    expect(getMatches).not.toHaveBeenCalled();
  });
  it('409 with no store chosen', async () => {
    requireHousehold.mockResolvedValue(ok(null));
    const res = await post({ canonicals: ['rice'] });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'no_store' });
  });
  it('200 with matches, trimmed, lower case and de-duplicated', async () => {
    getMatches.mockResolvedValue({ matches: [{ canonical: 'rice' }], limited: false, failed: 0 });
    const res = await post({ canonicals: [' Rice ', 'rice', 'Beans'] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ matches: [{ canonical: 'rice' }], limited: false, failed: 0 });
    expect(getMatches).toHaveBeenCalledWith(['rice', 'beans'], expect.objectContaining({ householdId: 'h1', locationId: '70100390' }));
  });
  it('503 not_configured when Kroger has no credentials', async () => {
    getMatches.mockRejectedValue(new KrogerNotConfigured());
    const res = await post({ canonicals: ['rice'] });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'not_configured' });
  });
  it('500 when anything else fails, logging only a message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    getMatches.mockRejectedValue(new Error('boom'));
    expect((await post({ canonicals: ['rice'] })).status).toBe(500);
    log.mockRestore();
  });
});
