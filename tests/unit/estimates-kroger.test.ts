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
  return { ...m, priceFor: vi.fn(m.priceFor) };
});

import { POST } from '@/app/api/estimates/route';
import { generateStructured } from '@/lib/ai/provider';
import { priceFor } from '@/lib/kroger/products';

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

function mockSb(cached: Cached[]) {
  const upserts: { rows: Record<string, unknown>[]; opts: unknown }[] = [];
  const sb = {
    auth: { getUser },
    from: (table: string) => {
      if (table !== 'price_estimates') throw new Error(`unexpected table ${table}`);
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.in = () => b;
      b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: cached, error: null }).then(res);
      b.upsert = async (rows: Record<string, unknown>[], opts: unknown) => (upserts.push({ rows, opts }), { error: null });
      return b;
    },
  };
  return { sb, upserts };
}

const req = (body: unknown) => new Request('http://x.test/api', { method: 'POST', body: JSON.stringify(body) });
const chicken = { canonical: 'boneless chicken thighs', qty: mass };
const eggs = { canonical: 'eggs', qty: count };
const LOC = '70100390';

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(body.prices.eggs).toBe(50);
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
    expect(saved.find((r) => r.canonical === 'eggs')).toMatchObject({ source: 'ai' });
    // The model is asked only about what Kroger could not price.
    expect(generateStructured).toHaveBeenCalledTimes(1);
    const prompt = vi.mocked(generateStructured).mock.calls[0][0].prompt;
    expect(prompt).toContain('eggs');
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
    expect(vi.mocked(priceFor)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(priceFor).mock.calls[0][0]).toBe('boneless chicken thighs');
    expect(body.prices['boneless chicken thighs']).toBeCloseTo(399 / 453.59237);
    expect(body.prices['black beans']).toBe(0.4);
    expect(body.kroger['black beans']).toMatchObject({ productName: 'Beans' });
    const saved = upserts.flatMap((u) => u.rows);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ canonical: 'boneless chicken thighs', source: 'kroger' });
  });

  it('keeps a stale Kroger row when Kroger cannot price it now', async () => {
    const { sb, upserts } = mockSb([
      { canonical: 'black beans', kind: 'mass', cents_per_base: 0.4, source: 'kroger', updated_at: ago(30), product_name: 'Beans' },
    ]);
    sbRef = sb;
    const body = await (await POST(req({ items: [{ canonical: 'black beans', qty: mass }], store: 'fred_meyer' }))).json();
    expect(body.prices['black beans']).toBe(0.4);
    expect(upserts).toHaveLength(0);
  });

  it('never touches a "user" row', async () => {
    const { sb, upserts } = mockSb([
      { canonical: 'boneless chicken thighs', kind: 'mass', cents_per_base: 2, source: 'user', updated_at: ago(500) },
    ]);
    sbRef = sb;
    const body = await (await POST(req({ items: [chicken], store: 'fred_meyer' }))).json();
    expect(body.prices['boneless chicken thighs']).toBe(2);
    expect(priceFor).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
  });

  it('upgrades an AI row when Kroger can price it, and keeps it when Kroger cannot', async () => {
    const { sb, upserts } = mockSb([
      { canonical: 'boneless chicken thighs', kind: 'mass', cents_per_base: 1, source: 'ai', updated_at: ago(900) },
      { canonical: 'black beans', kind: 'mass', cents_per_base: 0.3, source: 'ai', updated_at: ago(900) },
    ]);
    sbRef = sb;
    const body = await (await POST(req({ items: [chicken, { canonical: 'black beans', qty: mass }], store: 'fred_meyer' }))).json();
    expect(body.prices['boneless chicken thighs']).toBeCloseTo(399 / 453.59237);
    expect(body.prices['black beans']).toBe(0.3);
    const saved = upserts.flatMap((u) => u.rows);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ canonical: 'boneless chicken thighs', source: 'kroger' });
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it('falls back to the model, without an error, when Kroger fails', async () => {
    sbRef = mockSb([]).sb;
    vi.mocked(priceFor).mockRejectedValueOnce(new Error('kroger down'));
    const res = await POST(req({ items: [chicken], store: 'fred_meyer' }));
    expect(res.status).toBe(200);
    expect((await res.json()).prices['boneless chicken thighs']).toBe(1);
  });

  it('asks Kroger for at most six items at a time', async () => {
    sbRef = mockSb([]).sb;
    let running = 0;
    let peak = 0;
    vi.mocked(priceFor).mockImplementation(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return null;
    });
    const items = Array.from({ length: 15 }, (_, i) => ({ canonical: `item ${i}`, qty: mass }));
    await POST(req({ items, store: 'fred_meyer' }));
    expect(vi.mocked(priceFor)).toHaveBeenCalledTimes(15);
    expect(peak).toBeLessThanOrEqual(6);
    expect(peak).toBeGreaterThan(1);
  });
});

describe('POST /api/estimates without Kroger', () => {
  it('makes no Kroger calls when no store is chosen', async () => {
    getMyHousehold.mockResolvedValue({ id: 'h1', kroger_location_id: null });
    sbRef = mockSb([]).sb;
    const res = await POST(req({ items: [chicken], store: 'fred_meyer' }));
    expect(res.status).toBe(200);
    expect(priceFor).not.toHaveBeenCalled();
    expect((await res.json()).kroger).toEqual({});
  });

  it('makes no Kroger calls for Amazon or Costco', async () => {
    sbRef = mockSb([]).sb;
    await POST(req({ items: [chicken], store: 'amazon' }));
    await POST(req({ items: [chicken], store: 'costco' }));
    expect(priceFor).not.toHaveBeenCalled();
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
