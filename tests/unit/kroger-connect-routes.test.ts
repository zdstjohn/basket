import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
vi.mock('@/lib/db/server', () => ({ createServerClient: async () => ({ auth: { getUser } }) }));
const saveLink = vi.fn();
const deleteLink = vi.fn();
vi.mock('@/lib/kroger/link', () => ({ saveLink: (...a: unknown[]) => saveLink(...a), deleteLink: (...a: unknown[]) => deleteLink(...a) }));
const exchangeCode = vi.fn();
const fetchProfileId = vi.fn();
vi.mock('@/lib/kroger/oauth', async (orig) => ({
  ...(await orig<object>()),
  exchangeCode: (...a: unknown[]) => exchangeCode(...a),
  fetchProfileId: (...a: unknown[]) => fetchProfileId(...a),
}));

import { GET as connect } from '@/app/api/kroger/connect/route';
import { GET as callback } from '@/app/api/kroger/callback/route';
import { POST as disconnect } from '@/app/api/kroger/disconnect/route';
import { seal } from '@/lib/kroger/vault';

const ORIGIN = 'https://basket.test';
const COOKIE = 'kroger_oauth';
const ME = { id: 'u1' };

const cookiePair = (res: Response) => {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE}=`)) ?? '';
  return { raw, value: raw.split(';')[0].slice(COOKIE.length + 1) };
};
const sealedCookie = (o: object) => `${COOKIE}=${seal(JSON.stringify(o), 'oauth')}`;
const cb = (query: string, cookie?: string) =>
  callback(new Request(`${ORIGIN}/api/kroger/callback?${query}`, { headers: cookie ? { cookie } : {} }));
const loc = (res: Response) => new URL(res.headers.get('location') as string);
const good = { state: 'STATE', verifier: 'VERIFIER', next: '/household', uid: 'u1', iat: Date.now() };

let errors: unknown[][];
beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: ME } });
  saveLink.mockReset().mockResolvedValue(undefined);
  deleteLink.mockReset().mockResolvedValue(undefined);
  exchangeCode.mockReset().mockResolvedValue({ access: 'tok-a', refresh: 'tok-r', accessExp: 1 });
  fetchProfileId.mockReset().mockResolvedValue('prof');
  vi.stubEnv('KROGER_FAKE', '');
  vi.stubEnv('KROGER_CLIENT_ID', 'cid');
  vi.stubEnv('KROGER_CLIENT_SECRET', 'sec');
  vi.stubEnv('KROGER_REDIRECT_URI', `${ORIGIN}/api/kroger/callback`);
  vi.stubEnv('KROGER_TOKEN_KEY', Buffer.alloc(32, 7).toString('base64'));
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a); });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  expect(JSON.stringify(errors)).not.toMatch(/tok-a|tok-r|the-code|VERIFIER/);
});

describe('GET /api/kroger/connect', () => {
  it('sends a signed-out visitor to /login', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await connect(new Request(`${ORIGIN}/api/kroger/connect?next=/household`));
    expect([302, 307]).toContain(res.status);
    expect(loc(res).pathname).toBe('/login');
  });
  it('goes back with fm=failed when not configured', async () => {
    vi.stubEnv('KROGER_REDIRECT_URI', '');
    const res = await connect(new Request(`${ORIGIN}/api/kroger/connect?next=/household`));
    expect(loc(res).pathname).toBe('/household');
    expect(loc(res).searchParams.get('fm')).toBe('failed');
  });
  it('sets a sealed httpOnly lax cookie and redirects to Kroger with matching state', async () => {
    const res = await connect(new Request(`${ORIGIN}/api/kroger/connect?next=/household`));
    expect(res.status).toBe(302);
    const to = loc(res);
    expect(to.origin + to.pathname).toBe('https://api.kroger.com/v1/connect/oauth2/authorize');
    const { raw, value } = cookiePair(res);
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/Secure/i);
    expect(raw).toMatch(/SameSite=lax/i);
    expect(raw).toMatch(/Max-Age=600/i);
    expect(raw).toMatch(/Path=\/api\/kroger\/callback/i);
    expect(value).not.toContain('VERIFIER');
    const { unseal } = await import('@/lib/kroger/vault');
    const payload = JSON.parse(unseal(value, 'oauth') as string) as typeof good;
    expect(payload.state).toBe(to.searchParams.get('state'));
    expect(Buffer.from(payload.state, 'base64url')).toHaveLength(32);
    expect(payload.uid).toBe('u1');
    expect(payload.next).toBe('/household');
    expect(to.searchParams.get('code_challenge')).toBeTruthy();
    expect(to.searchParams.get('code_challenge')).not.toBe(payload.verifier);
  });
  it('is not Secure over plain http (local dev)', async () => {
    const res = await connect(new Request('http://localhost:3000/api/kroger/connect?next=/household'));
    expect(cookiePair(res).raw).not.toMatch(/Secure/i);
  });
  it('turns an outside next into /week', async () => {
    for (const bad of ['https://evil.test', '//evil.test', '/\\evil.test']) {
      const res = await connect(new Request(`${ORIGIN}/api/kroger/connect?next=${encodeURIComponent(bad)}`));
      const { unseal } = await import('@/lib/kroger/vault');
      expect((JSON.parse(unseal(cookiePair(res).value, 'oauth') as string) as typeof good).next).toBe('/week');
    }
  });
  it('goes to its own callback in the fake', async () => {
    vi.stubEnv('KROGER_FAKE', '1');
    const res = await connect(new Request(`${ORIGIN}/api/kroger/connect?next=/household`));
    const to = loc(res);
    expect(to.origin + to.pathname).toBe(`${ORIGIN}/api/kroger/callback`);
    expect(to.searchParams.get('code')).toBe('fake-code');
    expect(to.searchParams.get('state')).toBeTruthy();
  });
});

describe('GET /api/kroger/callback', () => {
  const failed = (res: Response) => {
    expect(loc(res).pathname).toBe('/list');
    expect(loc(res).searchParams.get('fm')).toBe('failed');
    expect(saveLink).not.toHaveBeenCalled();
    expect(exchangeCode).not.toHaveBeenCalled();
  };
  it('fails with no cookie, and clears it', async () => {
    const res = await cb('code=the-code&state=STATE');
    failed(res);
    expect(cookiePair(res).raw).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    expect(cookiePair(res).raw).toMatch(/Path=\/api\/kroger\/callback/i);
  });
  it('fails with a cookie it cannot read', async () => {
    failed(await cb('code=the-code&state=STATE', `${COOKIE}=garbage`));
  });
  it('fails with a wrong state, including a different length', async () => {
    failed(await cb('code=the-code&state=WRONG!', sealedCookie(good)));
    failed(await cb('code=the-code&state=S', sealedCookie(good)));
    failed(await cb('code=the-code', sealedCookie(good)));
  });
  it('fails when the cookie was made for another person', async () => {
    failed(await cb('code=the-code&state=STATE', sealedCookie({ ...good, uid: 'someone-else' })));
  });
  it('fails when signed out', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    failed(await cb('code=the-code&state=STATE', sealedCookie(good)));
  });
  it('fails when the sign-in cookie is older than ten minutes, or has no iat', async () => {
    failed(await cb('code=the-code&state=STATE', sealedCookie({ ...good, iat: Date.now() - 601_000 })));
    failed(await cb('code=the-code&state=STATE', sealedCookie({ ...good, iat: undefined })));
  });
  it('says denied when Kroger sends an error', async () => {
    const res = await cb('error=access_denied&state=STATE', sealedCookie(good));
    expect(loc(res).pathname).toBe('/household');
    expect(loc(res).searchParams.get('fm')).toBe('denied');
    expect(saveLink).not.toHaveBeenCalled();
    expect(exchangeCode).not.toHaveBeenCalled();
  });
  it('connects: exchanges, saves once, clears the cookie, goes to next', async () => {
    const res = await cb('code=the-code&state=STATE', sealedCookie(good));
    expect(exchangeCode).toHaveBeenCalledWith('the-code', 'VERIFIER');
    expect(fetchProfileId).toHaveBeenCalledWith('tok-a');
    expect(saveLink).toHaveBeenCalledTimes(1);
    expect(saveLink.mock.calls[0].slice(1)).toEqual(['u1', { access: 'tok-a', refresh: 'tok-r', accessExp: 1 }, 'prof']);
    expect(loc(res).origin).toBe(ORIGIN);
    expect(loc(res).pathname).toBe('/household');
    expect(loc(res).searchParams.get('fm')).toBe('connected');
    expect(cookiePair(res).raw).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
  it('keeps an existing query on next', async () => {
    const res = await cb('code=c&state=STATE', sealedCookie({ ...good, next: '/list/review?week=2026-11-23' }));
    expect(loc(res).pathname).toBe('/list/review');
    expect(loc(res).searchParams.get('week')).toBe('2026-11-23');
    expect(loc(res).searchParams.get('fm')).toBe('connected');
  });
  it('never leaves the site, even for a next that parses off-site', async () => {
    const res = await cb('code=c&state=STATE', sealedCookie({ ...good, next: '/\t/evil.test' }));
    expect(loc(res).origin).toBe(ORIGIN);
  });
  it('says failed with one fixed log line when the exchange throws', async () => {
    exchangeCode.mockRejectedValue(new Error('kroger token 400 tok-r the-code'));
    const res = await cb('code=the-code&state=STATE', sealedCookie(good));
    expect(loc(res).pathname).toBe('/household');
    expect(loc(res).searchParams.get('fm')).toBe('failed');
    expect(saveLink).not.toHaveBeenCalled();
    expect(errors).toEqual([['kroger connect failed']]);
  });
  it('says failed when saving throws', async () => {
    saveLink.mockRejectedValue(new Error('db'));
    const res = await cb('code=the-code&state=STATE', sealedCookie(good));
    expect(loc(res).searchParams.get('fm')).toBe('failed');
    expect(errors).toEqual([['kroger connect failed']]);
  });
});

describe('POST /api/kroger/disconnect', () => {
  const post = () => disconnect();
  it('401 signed out', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await post()).status).toBe(401);
    expect(deleteLink).not.toHaveBeenCalled();
  });
  it('204 after deleting the link', async () => {
    expect((await post()).status).toBe(204);
    expect(deleteLink).toHaveBeenCalledTimes(1);
    expect(deleteLink.mock.calls[0][1]).toBe('u1');
  });
  it('still 204 when cart filling is switched off', async () => {
    vi.stubEnv('KROGER_REDIRECT_URI', '');
    expect((await post()).status).toBe(204);
    expect(deleteLink).toHaveBeenCalledTimes(1);
  });
});
