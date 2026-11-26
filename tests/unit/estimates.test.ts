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

import { POST } from '@/app/api/estimates/route';
import { estimateCents } from '@/lib/ai/estimate';
import { generateStructured } from '@/lib/ai/provider';

const mass: Quantity = { amount: 500, kind: 'mass', base: 'g' };
const count: Quantity = { amount: 3, kind: 'count', base: 'each', countUnit: 'each' };

function mockSb(cached: { canonical: string; kind: string; cents_per_base: number }[]) {
  const upserts: { rows: unknown[]; opts: unknown }[] = [];
  const sb = {
    auth: { getUser },
    from: (table: string) => {
      if (table !== 'price_estimates') throw new Error(`unexpected table ${table}`);
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.in = () => b;
      b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: cached, error: null }).then(res);
      b.upsert = async (rows: unknown[], opts: unknown) => (upserts.push({ rows, opts }), { error: null });
      return b;
    },
  };
  return { sb, upserts };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AI_FAKE = '1';
  getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
  getMyHousehold.mockResolvedValue({ id: 'h1' });
  checkCap.mockResolvedValue({ ok: true, spentCents: 0, capCents: 300 });
});

describe('estimateCents', () => {
  it('serves cache hits without calling the model', async () => {
    const { sb, upserts } = mockSb([{ canonical: 'rice', kind: 'mass', cents_per_base: 0.4 }]);
    const out = await estimateCents([{ canonical: 'rice', qty: mass }], 'costco', { sb: sb as never, householdId: 'h1' });
    expect(out).toEqual({ rice: 0.4 });
    expect(generateStructured).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
  });

  it('asks the model only for misses, upserts them, and reports usage', async () => {
    const { sb, upserts } = mockSb([{ canonical: 'rice', kind: 'mass', cents_per_base: 0.4 }]);
    const onUsage = vi.fn();
    const out = await estimateCents(
      [{ canonical: 'rice', qty: mass }, { canonical: 'eggs', qty: count }], 'fred_meyer',
      { sb: sb as never, householdId: 'h1', onUsage },
    );
    expect(out).toEqual({ rice: 0.4, eggs: 50 });
    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateStructured).mock.calls[0][0].prompt).toContain('eggs');
    expect(vi.mocked(generateStructured).mock.calls[0][0].prompt).not.toContain('rice');
    expect(vi.mocked(generateStructured).mock.calls[0][0].system).toContain('Tacoma');
    expect(upserts).toHaveLength(1);
    expect(upserts[0].rows).toEqual([
      { household_id: 'h1', canonical: 'eggs', store: 'fred_meyer', kind: 'count', cents_per_base: 50, source: 'ai' },
    ]);
    expect(upserts[0].opts).toEqual({ onConflict: 'household_id,canonical,store,kind' });
    expect(onUsage).toHaveBeenCalledWith({ model: 'fake', inputTokens: 100, outputTokens: 50 });
  });

  it('the fake estimator uses a fixed table by base unit', async () => {
    const { sb } = mockSb([]);
    const out = await estimateCents(
      [
        { canonical: 'chicken', qty: mass },
        { canonical: 'milk', qty: { amount: 3785, kind: 'volume', base: 'ml' } },
        { canonical: 'eggs', qty: count },
      ],
      'fred_meyer',
      { sb: sb as never, householdId: 'h1' },
    );
    expect(out).toEqual({ chicken: 1, milk: 0.1, eggs: 50 });
  });

  it('returns {} for no items without any query', async () => {
    expect(await estimateCents([], 'costco', { sb: {} as never, householdId: 'h1' })).toEqual({});
  });
});

describe('POST /api/estimates', () => {
  const req = (body: unknown) => new Request('http://x.test/api', { method: 'POST', body: JSON.stringify(body) });
  const body = { items: [{ canonical: 'eggs', qty: count }], store: 'costco' };

  it('401 signed out', async () => {
    sbRef = mockSb([]).sb;
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(req(body))).status).toBe(401);
  });

  it('402 at the cap without calling the model', async () => {
    sbRef = mockSb([]).sb;
    checkCap.mockResolvedValue({ ok: false, spentCents: 300, capCents: 300 });
    const res = await POST(req(body));
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: 'cap_reached' });
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it('200 with prices, and records estimate usage', async () => {
    sbRef = mockSb([]).sb;
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ prices: { eggs: 50 }, kroger: {} });
    expect(recordUsage).toHaveBeenCalledWith(expect.anything(), 'h1', 'estimate', 'fake', expect.objectContaining({ inputTokens: 100 }));
  });

  it('400 on a bad body', async () => {
    sbRef = mockSb([]).sb;
    expect((await POST(req({ items: 'x', store: 'costco' }))).status).toBe(400);
  });
});
