import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addToCart, KrogerAuth, KrogerLimited, KrogerNotAdded, KrogerUnsure } from '@/lib/kroger/cart';

const fetchMock = vi.fn();
const item = (n: number, quantity = 1) => ({ upc: `00200000000${String(n).padStart(2, '0')}`, quantity, modality: 'PICKUP' as const });
const res = (status: number) => new Response(null, { status });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('KROGER_FAKE', '');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('addToCart', () => {
  it('PUTs the items to the cart endpoint with the shopper token', async () => {
    fetchMock.mockResolvedValue(res(204));
    const out = await addToCart('tok', [{ upc: '0020000000001', quantity: 2, modality: 'PICKUP' }]);
    expect(out).toEqual({ ok: ['0020000000001'], rejected: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.kroger.com/v1/cart/add');
    expect(init.method).toBe('PUT');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.body).toBe('{"items":[{"upc":"0020000000001","quantity":2,"modality":"PICKUP"}]}');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('401 and 403 are an auth failure', async () => {
    fetchMock.mockResolvedValue(res(401));
    await expect(addToCart('tok', [item(1)])).rejects.toBeInstanceOf(KrogerAuth);
    fetchMock.mockResolvedValue(res(403));
    await expect(addToCart('tok', [item(1)])).rejects.toBeInstanceOf(KrogerAuth);
  });

  it('a timeout or network error is unsure', async () => {
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    await expect(addToCart('tok', [item(1)])).rejects.toBeInstanceOf(KrogerUnsure);
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(addToCart('tok', [item(1)])).rejects.toBeInstanceOf(KrogerUnsure);
  });

  it('a 5xx is unsure', async () => {
    fetchMock.mockResolvedValue(res(500));
    await expect(addToCart('tok', [item(1)])).rejects.toBeInstanceOf(KrogerUnsure);
  });

  it('a 400 for one item rejects it', async () => {
    fetchMock.mockResolvedValue(res(400));
    expect(await addToCart('tok', [item(1)])).toEqual({ ok: [], rejected: [item(1).upc] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a 400 for several items retries each on its own', async () => {
    const items = [item(1), item(2), item(3)];
    fetchMock.mockImplementation(async (_u: string, init: { body: string }) => {
      const sent = JSON.parse(init.body).items as { upc: string }[];
      if (sent.length > 1) return res(400);
      return sent[0].upc === items[1].upc ? res(400) : res(204);
    });
    const out = await addToCart('tok', items);
    expect(out).toEqual({ ok: [items[0].upc, items[2].upc], rejected: [items[1].upc] });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('runs at most four single calls at once', async () => {
    const items = Array.from({ length: 10 }, (_, i) => item(i));
    let live = 0;
    let peak = 0;
    fetchMock.mockImplementation(async (_u: string, init: { body: string }) => {
      if (JSON.parse(init.body).items.length > 1) return res(400);
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return res(204);
    });
    const out = await addToCart('tok', items);
    expect(out.ok).toHaveLength(10);
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it('a 500 during the single calls is unsure, and no more are started', async () => {
    const items = Array.from({ length: 12 }, (_, i) => item(i));
    fetchMock.mockImplementation(async (_u: string, init: { body: string }) => (JSON.parse(init.body).items.length > 1 ? res(400) : res(500)));
    await expect(addToCart('tok', items)).rejects.toBeInstanceOf(KrogerUnsure);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(1 + 4);
  });

  it('an unsure fan-out carries what Kroger answered for sure', async () => {
    const items = [item(1), item(2), item(3)];
    fetchMock.mockImplementation(async (_u: string, init: { body: string }) => {
      const sent = JSON.parse(init.body).items as { upc: string }[];
      if (sent.length > 1) return res(400);
      if (sent[0].upc === items[0].upc) return res(204);
      if (sent[0].upc === items[1].upc) return res(400);
      throw new DOMException('timed out', 'TimeoutError');
    });
    const err = await addToCart('tok', items).catch((e) => e);
    expect(err).toBeInstanceOf(KrogerUnsure);
    expect(err.outcome).toEqual({ ok: [items[0].upc], rejected: [items[1].upc], unknown: [items[2].upc] });
  });

  it('the items never tried after a failure are unknown too', async () => {
    const items = Array.from({ length: 12 }, (_, i) => item(i));
    fetchMock.mockImplementation(async (_u: string, init: { body: string }) => (JSON.parse(init.body).items.length > 1 ? res(400) : res(500)));
    const err = await addToCart('tok', items).catch((e) => e);
    expect(err.outcome.ok).toEqual([]);
    expect(err.outcome.unknown).toHaveLength(12);
  });

  it('a definite 4xx for the whole batch, even 429, means nothing was added', async () => {
    for (const status of [404, 422, 429]) {
      fetchMock.mockResolvedValue(res(status));
      const err = await addToCart('tok', [item(1), item(2)]).catch((e) => e);
      expect(err).toBeInstanceOf(KrogerNotAdded);
      expect(err.status).toBe(status);
    }
  });

  it('asks to be charged for the single calls, and stops when refused', async () => {
    fetchMock.mockResolvedValue(res(400));
    const charge = vi.fn().mockResolvedValue(false);
    await expect(addToCart('tok', [item(1), item(2)], { charge })).rejects.toBeInstanceOf(KrogerLimited);
    expect(charge).toHaveBeenCalledWith(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('with the fake on, nothing leaves the machine and one product is rejected', async () => {
    vi.stubEnv('KROGER_FAKE', '1');
    const out = await addToCart('fake-access', [item(1), { upc: '0020000000999', quantity: 1, modality: 'PICKUP' }]);
    expect(out).toEqual({ ok: [item(1).upc], rejected: ['0020000000999'] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
