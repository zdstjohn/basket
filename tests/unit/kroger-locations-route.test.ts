import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const getMyHousehold = vi.fn();
const rpc = vi.fn();
vi.mock('@/lib/db/server', () => ({ createServerClient: async () => ({ auth: { getUser }, rpc }) }));
vi.mock('@/lib/db/queries/household', () => ({ getMyHousehold: (...a: unknown[]) => getMyHousehold(...a) }));

import { GET } from '@/app/api/kroger/locations/route';

const call = (zip?: string) => GET(new Request(`http://x.test/api/kroger/locations${zip === undefined ? '' : `?zip=${zip}`}`));

/** kroger_spend as the database answers it: adds n and returns the total, or returns it unchanged when refused. */
function spendFake(start: number, refuse = false) {
  let total = start;
  rpc.mockImplementation(async (fn: string, args: { n?: number }) => {
    if (fn === 'kroger_limited') return { data: false, error: null };
    if (fn !== 'kroger_spend') throw new Error(`unexpected rpc ${fn}`);
    if (!refuse) total += args.n ?? 0;
    return { data: total, error: null };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
  getMyHousehold.mockResolvedValue({ id: 'h1' });
  spendFake(0);
  vi.stubEnv('KROGER_FAKE', '1');
});

describe('GET /api/kroger/locations', () => {
  it('401 signed out', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call('98402')).status).toBe(401);
  });
  it('400 for anything but five digits', async () => {
    for (const z of [undefined, '', '9840', '984021', 'abcde', '98402-1']) expect((await call(z)).status).toBe(400);
  });
  it('503 not_configured without credentials', async () => {
    vi.stubEnv('KROGER_FAKE', '');
    vi.stubEnv('KROGER_CLIENT_ID', '');
    vi.stubEnv('KROGER_CLIENT_SECRET', '');
    const res = await call('98402');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'not_configured' });
  });
  it('404 without a household, and no Kroger call is charged', async () => {
    getMyHousehold.mockResolvedValue(null);
    expect((await call('98402')).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('200 with the stores, Fred Meyer first, charging one lookup to the household', async () => {
    const res = await call('98402');
    expect(res.status).toBe(200);
    const list = (await res.json()) as { id: string; name: string }[];
    expect(list[0]).toMatchObject({ id: '70100390', name: 'Fred Meyer - Tacoma-Stevens' });
    expect(rpc).toHaveBeenCalledWith('kroger_spend', { h: 'h1', n: 1 });
  });
  it('429 when kroger_spend refuses (the household or the untrusted pool is used up), with no lookup', async () => {
    spendFake(400, true);
    const res = await call('98402');
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'slow_down' });
  });
  it('429 when the all-households ceiling is reached', async () => {
    rpc.mockImplementation(async (fn: string) => ({ data: fn === 'kroger_limited' ? true : 0, error: null }));
    expect((await call('98402')).status).toBe(429);
  });
});
