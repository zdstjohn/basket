import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

async function load() {
  vi.resetModules();
  return import('@/lib/kroger/token');
}

const tokenResponse = (expiresIn: number) =>
  new Response(JSON.stringify({ access_token: 'tok-' + Math.random(), expires_in: expiresIn, token_type: 'bearer' }), { status: 200 });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-26T12:00:00Z'));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('KROGER_CLIENT_ID', 'id');
  vi.stubEnv('KROGER_CLIENT_SECRET', 'secret');
  vi.stubEnv('KROGER_FAKE', '');
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => tokenResponse(1800));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getKrogerToken', () => {
  it('asks Kroger once with Basic auth for client credentials', async () => {
    const { getKrogerToken } = await load();
    const t = await getKrogerToken();
    expect(t).toMatch(/^tok-/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.kroger.com/v1/connect/oauth2/token');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('id:secret').toString('base64')}`);
    expect(String(init.body)).toBe('grant_type=client_credentials&scope=product.compact');
  });

  it('reuses the token inside the expiry window and refetches 60 s before expiry', async () => {
    const { getKrogerToken } = await load();
    const first = await getKrogerToken();
    vi.advanceTimersByTime(1000 * 1000);
    expect(await getKrogerToken()).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(745 * 1000); // 1745 s in: inside the last 60 s of 1800
    const second = await getKrogerToken();
    expect(second).not.toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives the token request a timeout', async () => {
    const { getKrogerToken } = await load();
    await getKrogerToken();
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal);
  });

  it('shares one request between calls made at the same time', async () => {
    const { getKrogerToken } = await load();
    const [a, b] = await Promise.all([getKrogerToken(), getKrogerToken()]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws KrogerNotConfigured without credentials, and never fetches', async () => {
    vi.stubEnv('KROGER_CLIENT_SECRET', '');
    const { getKrogerToken, KrogerNotConfigured, isKrogerConfigured } = await load();
    expect(isKrogerConfigured()).toBe(false);
    await expect(getKrogerToken()).rejects.toBeInstanceOf(KrogerNotConfigured);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is configured under KROGER_FAKE=1 without credentials', async () => {
    vi.stubEnv('KROGER_CLIENT_ID', '');
    vi.stubEnv('KROGER_CLIENT_SECRET', '');
    vi.stubEnv('KROGER_FAKE', '1');
    const { isKrogerConfigured } = await load();
    expect(isKrogerConfigured()).toBe(true);
  });

  it('does not keep a failed request', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    const { getKrogerToken } = await load();
    await expect(getKrogerToken()).rejects.toThrow();
    await expect(getKrogerToken()).resolves.toMatch(/^tok-/);
  });
});
