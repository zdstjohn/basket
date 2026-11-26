import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
vi.mock('@/lib/db/server', () => ({ createServerClient: async () => ({ auth: { getUser } }) }));

import { GET } from '@/app/api/kroger/locations/route';

const call = (zip?: string) => GET(new Request(`http://x.test/api/kroger/locations${zip === undefined ? '' : `?zip=${zip}`}`));

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
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
  it('200 with the stores, Fred Meyer first', async () => {
    const res = await call('98402');
    expect(res.status).toBe(200);
    const list = (await res.json()) as { id: string; name: string }[];
    expect(list[0]).toMatchObject({ id: '70100390', name: 'Fred Meyer - Tacoma-Stevens' });
  });
});
