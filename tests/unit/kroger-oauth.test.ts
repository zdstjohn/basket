import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authorizeUrl,
  exchangeCode,
  fetchProfileId,
  isCartConfigured,
  newPkce,
  refreshTokens,
} from '@/lib/kroger/oauth';

const fetchMock = vi.fn();
const KEY = Buffer.alloc(32, 7).toString('base64');
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-26T12:00:00Z'));
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  vi.stubEnv('KROGER_FAKE', '');
  vi.stubEnv('KROGER_CLIENT_ID', 'cid');
  vi.stubEnv('KROGER_CLIENT_SECRET', 'sec');
  vi.stubEnv('KROGER_TOKEN_KEY', KEY);
  vi.stubEnv('KROGER_REDIRECT_URI', 'https://basket-ashy.vercel.app/api/kroger/callback');
  vi.stubEnv('KROGER_BANNER', '');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('authorizeUrl', () => {
  it('has the exact query, in order', () => {
    expect(authorizeUrl('S', 'C')).toBe(
      'https://api.kroger.com/v1/connect/oauth2/authorize?scope=cart.basic%3Awrite%20profile.compact&response_type=code&client_id=cid&redirect_uri=https%3A%2F%2Fbasket-ashy.vercel.app%2Fapi%2Fkroger%2Fcallback&state=S&code_challenge=C&code_challenge_method=S256',
    );
  });
  it('adds banner only when set', () => {
    vi.stubEnv('KROGER_BANNER', 'fredmeyer');
    expect(authorizeUrl('S', 'C').endsWith('&banner=fredmeyer')).toBe(true);
  });
});

describe('newPkce', () => {
  it('makes a 32-byte verifier and its S256 challenge', () => {
    const { verifier, challenge } = newPkce();
    expect(Buffer.from(verifier, 'base64url')).toHaveLength(32);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(newPkce().verifier).not.toBe(verifier);
  });
});

describe('isCartConfigured', () => {
  it('needs id, secret, key and redirect', () => {
    expect(isCartConfigured()).toBe(true);
    for (const name of ['KROGER_CLIENT_ID', 'KROGER_CLIENT_SECRET', 'KROGER_TOKEN_KEY', 'KROGER_REDIRECT_URI']) {
      vi.stubEnv(name, '');
      expect(isCartConfigured(), name).toBe(false);
      vi.unstubAllEnvs();
      vi.stubEnv('KROGER_FAKE', '');
      vi.stubEnv('KROGER_CLIENT_ID', 'cid');
      vi.stubEnv('KROGER_CLIENT_SECRET', 'sec');
      vi.stubEnv('KROGER_TOKEN_KEY', KEY);
      vi.stubEnv('KROGER_REDIRECT_URI', 'https://basket-ashy.vercel.app/api/kroger/callback');
    }
  });
  it('is true under the fake, false when VERCEL=1', () => {
    vi.stubEnv('KROGER_CLIENT_ID', '');
    vi.stubEnv('KROGER_FAKE', '1');
    expect(isCartConfigured()).toBe(true);
    vi.stubEnv('VERCEL', '1');
    expect(isCartConfigured()).toBe(false);
  });
});

describe('exchangeCode', () => {
  it('posts the form with Basic auth and reads the tokens', async () => {
    fetchMock.mockResolvedValue(json(200, { access_token: 'A', refresh_token: 'R', expires_in: 1800 }));
    const t = await exchangeCode('the-code', 'the-verifier');
    expect(t).toEqual({ access: 'A', refresh: 'R', accessExp: Date.now() + 1800_000 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.kroger.com/v1/connect/oauth2/token');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('cid:sec').toString('base64')}`);
    expect(String(init.body)).toBe(
      'grant_type=authorization_code&code=the-code&redirect_uri=https%3A%2F%2Fbasket-ashy.vercel.app%2Fapi%2Fkroger%2Fcallback&code_verifier=the-verifier',
    );
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it('throws a fixed message without the body on failure', async () => {
    fetchMock.mockResolvedValue(json(400, { error: 'invalid_grant', detail: 'the-code leaked' }));
    const err = await exchangeCode('the-code', 'v').catch((e: Error) => e);
    expect((err as Error).message).toBe('kroger token 400');
    expect(String((err as Error).message)).not.toContain('leaked');
  });
  it('throws when the answer has no refresh token', async () => {
    fetchMock.mockResolvedValue(json(200, { access_token: 'A', expires_in: 1800 }));
    await expect(exchangeCode('c', 'v')).rejects.toThrow('kroger token unreadable');
  });
});

describe('refreshTokens', () => {
  it('posts grant_type=refresh_token', async () => {
    fetchMock.mockResolvedValue(json(200, { access_token: 'A2', refresh_token: 'R2', expires_in: 1800 }));
    expect(await refreshTokens('R1')).toEqual({ access: 'A2', refresh: 'R2', accessExp: Date.now() + 1800_000 });
    expect(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).toBe('grant_type=refresh_token&refresh_token=R1');
  });
  it("is 'refused' on 400 and 401", async () => {
    for (const s of [400, 401]) {
      fetchMock.mockResolvedValue(json(s, { error: 'invalid_grant' }));
      expect(await refreshTokens('R1')).toBe('refused');
    }
  });
  it('throws on 503 and on a network error', async () => {
    fetchMock.mockResolvedValue(json(503, {}));
    await expect(refreshTokens('R1')).rejects.toThrow('kroger token 503');
    fetchMock.mockRejectedValue(new Error('boom'));
    await expect(refreshTokens('R1')).rejects.toThrow();
  });
  it('keeps the old refresh token when none comes back', async () => {
    fetchMock.mockResolvedValue(json(200, { access_token: 'A2', expires_in: 60 }));
    expect((await refreshTokens('R1') as { refresh: string }).refresh).toBe('R1');
  });
});

describe('fetchProfileId', () => {
  it('reads data.id with the shopper token', async () => {
    fetchMock.mockResolvedValue(json(200, { data: { id: 'p-1' } }));
    expect(await fetchProfileId('A')).toBe('p-1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.kroger.com/v1/identity/profile');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer A');
  });
  it('never throws', async () => {
    fetchMock.mockRejectedValue(new Error('x'));
    expect(await fetchProfileId('A')).toBeNull();
    fetchMock.mockResolvedValue(json(500, {}));
    expect(await fetchProfileId('A')).toBeNull();
    fetchMock.mockResolvedValue(json(200, { nope: 1 }));
    expect(await fetchProfileId('A')).toBeNull();
  });
});

describe('fake', () => {
  it('answers without a request', async () => {
    vi.stubEnv('KROGER_FAKE', '1');
    expect(await exchangeCode('c', 'v')).toEqual({ access: 'fake-access', refresh: 'fake-refresh', accessExp: Date.now() + 30 * 60_000 });
    expect(await refreshTokens('x')).toEqual({ access: 'fake-access', refresh: 'fake-refresh', accessExp: Date.now() + 30 * 60_000 });
    expect(await fetchProfileId('x')).toBe('fake-profile');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
