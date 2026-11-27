import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Quantity } from '@/lib/domain/types';

const getUser = vi.fn();
const getMyHousehold = vi.fn();
const checkCap = vi.fn();
const recordUsage = vi.fn();
let sbRef: unknown;

vi.mock('@/lib/db/server', () => ({ createServerClient: async () => sbRef }));
vi.mock('@/lib/db/queries/household', () => ({ getMyHousehold: (...a: unknown[]) => getMyHousehold(...a) }));
vi.mock('@/lib/ai/usage', () => ({
  checkCap: (...a: unknown[]) => checkCap(...a),
  recordUsage: (...a: unknown[]) => recordUsage(...a),
}));
vi.mock('@/lib/ai/provider', async (orig) => {
  const m = await orig<typeof import('@/lib/ai/provider')>();
  return { ...m, generateStructured: vi.fn(m.generateStructured) };
});
vi.mock('@/lib/kroger/products', async (orig) => {
  const m = await orig<typeof import('@/lib/kroger/products')>();
  return { ...m, searchProducts: vi.fn(m.searchProducts) };
});

import { POST } from '@/app/api/estimates/route';
import { generateStructured } from '@/lib/ai/provider';
import { searchProducts } from '@/lib/kroger/products';
import { krogerSb } from '../helpers/kroger-sb';
import { KrogerNotConfigured } from '@/lib/kroger/token';

const mass: Quantity = { amount: 500, kind: 'mass', base: 'g' };
const count: Quantity = { amount: 3, kind: 'count', base: 'each', countUnit: 'each' };
const HOUR = 3_600_000;

interface Cached {
  canonical: string;
  kind: string;
  cents_per_base: number;
  source: string;
  updated_at: string;
  product_name?: string | null;
  product_image_url?: string | null;
  on_sale?: boolean;
}
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();

function mockSb(cached: Cached[], extra: Parameters<typeof krogerSb>[0] = {}) {
  const { sb, calls } = krogerSb({ ...extra, estimates: cached as unknown as Record<string, unknown>[] });
  sb.auth.getUser = getUser;
  const upserts = (calls.upserts.price_estimates ??= []);
  return { sb, upserts, calls };
}

const req = (body: unknown) => new Request('http://x.test/api', { method: 'POST', body: JSON.stringify(body) });
const chicken = { canonical: 'boneless chicken thighs', qty: mass };
const eggs = { canonical: 'dragon fruit', qty: count };
const quinoa = { canonical: 'quinoa', qty: mass };
const LOC = '70100390';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(searchProducts).mockReset();
  vi.stubEnv('AI_FAKE', '1');
  vi.stubEnv('KROGER_FAKE', '1');
  getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
  getMyHousehold.mockResolvedValue({ id: 'h1', kroger_location_id: LOC, kroger_location_name: 'Fred Meyer - Tacoma-Stevens' });
  checkCap.mockResolvedValue({ ok: true, spentCents: 0, capCents: 300 });
});

describe('POST /api/estimates with a Fred Meyer store chosen', () => {
  it('prices from Kroger first and falls back to the model for the rest', async () => {
    const { sb, upserts } = mockSb([]);
    sbRef = sb;
    const res = await POST(req({ items: [chicken, eggs], store: 'fred_meyer' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prices['boneless chicken thighs']).toBeCloseTo(399 / 453.59237);
    expect(body.prices['dragon fruit']).toBe(50);
    expect(body.kroger).toEqual({
      'boneless chicken thighs': {
        productName: 'Heritage Farm Boneless Skinless Chicken Thighs',
        imageUrl: 'https://www.kroger.com/product/images/small/front/0020000000001',
        onSale: false,
      },
    });

    const saved = upserts.flatMap((u) => u.rows);
    const k = saved.find((r) => r.canonical === 'boneless chicken thighs');
    expect(k).toMatchObject({
      household_id: 'h1', store: 'fred_meyer', kind: 'mass', source: 'kroger',
      product_name: 'Heritage Farm Boneless Skinless Chicken Thighs',
      product_image_url: 'https://www.kroger.com/product/images/small/front/0020000000001',
      on_sale: false,
    });
    expect(typeof k?.updated_at).toBe('string');
    expect(saved.find((r) => r.canonical === 'dragon fruit')).toMatchObject({ source: 'ai' });
    // The model is asked only about what Kroger could not price.
    expect(generateStructured).toHaveBeenCalledTimes(1);
    const prompt = vi.mocked(generateStructured).mock.calls[0][0].prompt;
    expect(prompt).toContain('dragon fruit');
    expect(prompt).not.toContain('chicken');
  });

  it('records no AI usage, and makes no model call, when Kroger prices everything', async () => {
    sbRef = mockSb([]).sb;
    const res = await POST(req({ items: [chicken], store: 'fred_meyer' }));
    expect(res.status).toBe(200);
    expect(generateStructured).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('still answers from Kroger when the AI cap is reached', async () => {
    sbRef = mockSb([]).sb;
    checkCap.mockResolvedValue({ ok: false, spentCents: 300, capCents: 300 });
    const res = await POST(req({ items: [chicken, eggs], store: 'fred_meyer' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.prices)).toEqual(['boneless chicken thighs']);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it('is 402 at the cap when Kroger priced nothing', async () => {
    sbRef = mockSb([]).sb;
    checkCap.mockResolvedValue({ ok: false, spentCents: 300, capCents: 300 });
    const res = await POST(req({ items: [eggs], store: 'fred_meyer' }));
    expect(res.status).toBe(402);
  });

  it('refreshes a Kroger row older than 24 hours, and leaves a fresh one alone', async () => {
    const { sb, upserts } = mockSb([
      { canonical: 'boneless chicken thighs', kind: 'mass', cents_per_base: 0.5, source: 'kroger', updated_at: ago(25) },
      { canonical: 'black beans', kind: 'mass', cents_per_base: 0.4, source: 'kroger', updated_at: ago(1), product_name: 'Beans' },
    ]);
    sbRef = sb;
    const res = await POST(req({ items: [chicken, { canonical: 'black beans', qty: mass }], store: 'fred_meyer' }));
    const body = await res.json();
    expect(vi.mocked(searchProducts)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(searchProducts).mock.calls[0][0]).toBe('boneless chicken thighs');
    expect(body.prices['boneless chicken thighs']).toBeCloseTo(399 / 453.59237);
    expect(body.prices['black beans']).toBe(0.4);
    expect(body.kroger['black beans']).toMatchObject({ productName: 'Beans' });
    const saved = upserts.flatMap((u) => u.rows);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ canonical: 'boneless chicken thighs', source: 'kroger' });
  });

  it('keeps a stale Kroger row when Kroger cannot price it now', async () => {
    const { sb, upserts } = mockSb([
      { canonical: 'quinoa', kind: 'mass', cents_per_base: 0.4, source: 'kroger', updated_at: ago(30), product_name: 'Quinoa' },
    ]);
    sbRef = sb;
    const body = await (await POST(req({ items: [quinoa], store: 'fred_meyer' }))).json();
    expect(body.prices.quinoa).toBe(0.4);
    expect(upserts).toHaveLength(0);
  });

  it('never touches a "user" row', async () => {
    const { sb, upserts } = mockSb([
      { canonical: 'boneless chicken thighs', kind: 'mass', cents_per_base: 2, source: 'user', updated_at: ago(500) },
    ]);
    sbRef = sb;
    const body = await (await POST(req({ items: [chicken], store: 'fred_meyer' }))).json();
    expect(body.prices['boneless chicken thighs']).toBe(2);
    expect(searchProducts).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
  });

  it('upgrades an AI row when Kroger can price it, and keeps it when Kroger cannot', async () => {
    const { sb, upserts } = mockSb([
      { canonical: 'boneless chicken thighs', kind: 'mass', cents_per_base: 1, source: 'ai', updated_at: ago(900) },
      { canonical: 'quinoa', kind: 'mass', cents_per_base: 0.3, source: 'ai', updated_at: ago(900) },
    ]);
    sbRef = sb;
    const body = await (await POST(req({ items: [chicken, quinoa], store: 'fred_meyer' }))).json();
    expect(body.prices['boneless chicken thighs']).toBeCloseTo(399 / 453.59237);
    expect(body.prices.quinoa).toBe(0.3);
    const saved = upserts.flatMap((u) => u.rows);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ canonical: 'boneless chicken thighs', source: 'kroger' });
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it('falls back to the model, without an error, when Kroger fails', async () => {
    sbRef = mockSb([]).sb;
    vi.mocked(searchProducts).mockRejectedValueOnce(new Error('kroger down'));
    const res = await POST(req({ items: [chicken], store: 'fred_meyer' }));
    expect(res.status).toBe(200);
    expect((await res.json()).prices['boneless chicken thighs']).toBe(1);
  });

  it('logs a Kroger failure once (message only) and falls back to the model', async () => {
    sbRef = mockSb([]).sb;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(searchProducts).mockRejectedValueOnce(new Error('kroger /products 429'));
    const res = await POST(req({ items: [chicken], store: 'fred_meyer' }));
    expect((await res.json()).prices['boneless chicken thighs']).toBe(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('kroger match failed', 'kroger /products 429');
    log.mockRestore();
  });

  it('logs nothing when Kroger is not configured', async () => {
    sbRef = mockSb([]).sb;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(searchProducts).mockRejectedValueOnce(new KrogerNotConfigured());
    const res = await POST(req({ items: [chicken], store: 'fred_meyer' }));
    expect((await res.json()).prices['boneless chicken thighs']).toBe(1);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('asks Kroger for at most six items at a time', async () => {
    sbRef = mockSb([]).sb;
    let running = 0;
    let peak = 0;
    vi.mocked(searchProducts).mockImplementation(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return [];
    });
    const items = Array.from({ length: 15 }, (_, i) => ({ canonical: `item ${i}`, qty: mass }));
    await POST(req({ items, store: 'fred_meyer' }));
    expect(vi.mocked(searchProducts)).toHaveBeenCalledTimes(15);
    expect(peak).toBeLessThanOrEqual(6);
    expect(peak).toBeGreaterThan(1);
  });
});

describe('POST /api/estimates from the cached Fred Meyer matches', () => {
  const volume: Quantity = { amount: 120, kind: 'volume', base: 'ml' };
  const honey = { canonical: 'honey', qty: volume };

  it('prices a volume need from a weight-sized product as Kroger, with its product details', async () => {
    const { sb } = mockSb([]);
    sbRef = sb;
    const body = await (await POST(req({ items: [honey], store: 'fred_meyer' }))).json();
    expect(body.prices.honey).toBeGreaterThan(0);
    expect(body.kroger.honey).toMatchObject({ productName: expect.stringContaining('Honey'), onSale: false });
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it('makes no Kroger search for a food with a fresh kroger_matches row', async () => {
    const cand = {
      upc: '0002222000021', name: 'Kroger Pure Clover Honey', brand: 'Kroger', sizeText: '12 oz',
      size: { amount: 340.19, kind: 'mass', base: 'g' }, soldBy: 'UNIT', regularCents: 499, promoCents: 399,
      imageUrl: null, relevant: true, inStock: true,
    };
    const { sb, calls } = mockSb([], { matches: [{ canonical: 'honey', term: 'honey', candidates: [cand], fetched_at: ago(1) }] });
    sbRef = sb;
    const body = await (await POST(req({ items: [honey], store: 'fred_meyer' }))).json();
    expect(searchProducts).not.toHaveBeenCalled();
    expect(calls.spend).toEqual([]);
    expect(body.kroger.honey).toEqual({ productName: 'Kroger Pure Clover Honey', imageUrl: null, onSale: true });
  });

  it('leaves an item unpriced, and does not ask the model, when Kroger lookups are limited', async () => {
    const { sb } = mockSb([], { limited: true });
    sbRef = sb;
    const res = await POST(req({ items: [chicken, eggs], store: 'fred_meyer' }));
    expect(res.status).toBe(200);
    expect((await res.json()).prices).toEqual({});
    expect(generateStructured).not.toHaveBeenCalled();
    expect(searchProducts).not.toHaveBeenCalled();
  });

  it('keeps the old price of an item when lookups are limited', async () => {
    const { sb } = mockSb(
      [{ canonical: 'boneless chicken thighs', kind: 'mass', cents_per_base: 0.5, source: 'kroger', updated_at: ago(30) }],
      { used: 400 },
    );
    sbRef = sb;
    const body = await (await POST(req({ items: [chicken], store: 'fred_meyer' }))).json();
    expect(body.prices['boneless chicken thighs']).toBe(0.5);
    expect(searchProducts).not.toHaveBeenCalled();
  });
});

describe('POST /api/estimates without Kroger', () => {
  it('makes no Kroger calls when no store is chosen', async () => {
    getMyHousehold.mockResolvedValue({ id: 'h1', kroger_location_id: null });
    sbRef = mockSb([]).sb;
    const res = await POST(req({ items: [chicken], store: 'fred_meyer' }));
    expect(res.status).toBe(200);
    expect(searchProducts).not.toHaveBeenCalled();
    expect((await res.json()).kroger).toEqual({});
  });

  it('makes no Kroger calls for Amazon or Costco', async () => {
    sbRef = mockSb([]).sb;
    await POST(req({ items: [chicken], store: 'amazon' }));
    await POST(req({ items: [chicken], store: 'costco' }));
    expect(searchProducts).not.toHaveBeenCalled();
  });

  it('falls back to the model silently when Kroger is not configured', async () => {
    vi.stubEnv('KROGER_FAKE', '');
    vi.stubEnv('KROGER_CLIENT_ID', '');
    vi.stubEnv('KROGER_CLIENT_SECRET', '');
    sbRef = mockSb([]).sb;
    const res = await POST(req({ items: [chicken], store: 'fred_meyer' }));
    expect(res.status).toBe(200);
    expect((await res.json()).prices['boneless chicken thighs']).toBe(1);
  });
});
