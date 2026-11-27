import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requireHousehold = vi.fn();
vi.mock('@/lib/api/household-context', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/household-context')>()),
  requireHousehold: () => requireHousehold(),
}));
const getUserAccess = vi.fn();
const deleteLink = vi.fn();
vi.mock('@/lib/kroger/link', () => ({
  getUserAccess: (...a: unknown[]) => getUserAccess(...a),
  deleteLink: (...a: unknown[]) => deleteLink(...a),
}));
const addToCart = vi.fn();
vi.mock('@/lib/kroger/cart', async (orig) => ({
  ...(await orig<typeof import('@/lib/kroger/cart')>()),
  addToCart: (...a: unknown[]) => addToCart(...a),
}));

import { NextResponse } from 'next/server';
import { POST } from '@/app/api/kroger/cart/route';
import { KrogerAuth, KrogerLimited, KrogerUnsure } from '@/lib/kroger/cart';

const WEEK = '6f1c2f6e-5b0e-4c43-8f4e-0a7d3d9a1b11';
const SECRET = 'tok-secret-123';
const MILK = '0001111041700';
const EGGS = '0001111060903';
const cand = (upc: string, name: string, regularCents: number, promoCents: number | null = null) => ({
  upc, name, brand: null, sizeText: '1 ea', size: null, soldBy: 'UNIT', regularCents, promoCents,
  imageUrl: null, relevant: true, inStock: true,
});

type Row = Record<string, unknown>;

/** A Supabase stand-in with just enough query behaviour for the cart route, and a log of what was written. */
function world(opts: { week?: boolean; insertError?: boolean; existing?: Row[]; spendUsed?: number } = {}) {
  const sends: Row[] = [...(opts.existing ?? [])];
  const log: string[] = [];
  let seq = sends.length;
  let used = opts.spendUsed ?? 0;
  const tables: Record<string, Row[]> = {
    weeks: opts.week === false ? [] : [{ id: WEEK, household_id: 'h1' }],
    kroger_matches: [
      { household_id: 'h1', canonical: 'milk', location_id: 'L1', term: 'milk', fetched_at: new Date().toISOString(), candidates: [cand(MILK, 'Milk 1 gal', 400, 350)] },
      { household_id: 'h1', canonical: 'eggs', location_id: 'L1', term: 'eggs', fetched_at: new Date().toISOString(), candidates: [cand(EGGS, 'Eggs 12', 300)] },
    ],
    cart_sends: sends,
  };
  const sb = {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    rpc: async (fn: string, args: { n?: number }) => {
      if (fn === 'kroger_limited') return { data: false, error: null };
      const n = args.n ?? 0;
      if (used + n <= 400) used += n;
      return { data: used, error: null };
    },
    from: (table: string) => {
      const eqs: [string, unknown][] = [];
      const gtes: [string, string][] = [];
      let head = false;
      let patch: Row | null = null;
      let inserted: Row | null = null;
      let ordered = false;
      const match = () =>
        tables[table]
          .filter((r) => eqs.every(([c, v]) => r[c] === v) && gtes.every(([c, v]) => String(r[c]) >= v))
          .sort((a, b) => (ordered ? String(b.created_at).localeCompare(String(a.created_at)) || String(b.id).localeCompare(String(a.id)) : 0));
      const run = async () => {
        await Promise.resolve();
        if (inserted) {
          if (opts.insertError) return { data: null, error: { message: 'boom' } };
          const row: Row = { ...(inserted as Row), id: `s${String(++seq).padStart(4, '0')}`, created_at: new Date().toISOString(), user_id: 'u1' };
          sends.push(row);
          log.push(`insert:${row.status}`);
          return { data: row, error: null };
        }
        if (patch) {
          for (const r of match()) Object.assign(r, patch);
          log.push(`update:${String(patch.status)}`);
          return { data: null, error: null };
        }
        const rows = match();
        return head ? { data: null, count: rows.length, error: null } : { data: rows, error: null };
      };
      const b: Record<string, unknown> = {};
      b.select = (_c?: string, o?: { head?: boolean }) => ((head = Boolean(o?.head)), b);
      b.eq = (c: string, v: unknown) => (eqs.push([c, v]), b);
      b.gte = (c: string, v: string) => (gtes.push([c, v]), b);
      b.order = () => ((ordered = true), b);
      b.insert = (r: Row) => ((inserted = r), b);
      b.update = (p: Row) => ((patch = p), b);
      b.single = run;
      b.maybeSingle = async () => {
        const r = await run();
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
      };
      b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej);
      return b;
    },
  };
  return { sb, sends, log, spent: () => used };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request('http://x.test/api/kroger/cart', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));
const lines = (...l: [string, string, number][]) => l.map(([key, upc, quantity]) => ({ key, upc, quantity }));
const body = (extra: Record<string, unknown> = {}) => ({
  weekId: WEEK,
  modality: 'PICKUP',
  lines: lines(['milk#volume', MILK, 2], ['eggs#count', EGGS, 1]),
  resend: false,
  ...extra,
});

let w: ReturnType<typeof world>;
let logs: unknown[][];
const setup = (o: Parameters<typeof world>[0] = {}, household: Row = { id: 'h1', kroger_location_id: 'L1' }) => {
  w = world(o);
  requireHousehold.mockResolvedValue({ sb: w.sb, household });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('KROGER_FAKE', '1');
  logs = [];
  for (const m of ['error', 'warn', 'log', 'info'] as const) vi.spyOn(console, m).mockImplementation((...a) => void logs.push(a));
  getUserAccess.mockResolvedValue({ access: SECRET, profileId: 'p1' });
  deleteLink.mockResolvedValue(undefined);
  addToCart.mockImplementation(async (_a: string, items: { upc: string }[]) => {
    expect(w.log).toContain('insert:pending');
    return { ok: items.map((i) => i.upc), rejected: [] };
  });
  setup();
});
afterEach(() => {
  expect(JSON.stringify(logs)).not.toContain(SECRET);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('POST /api/kroger/cart', () => {
  it('records a pending row before calling Kroger, then marks it sent', async () => {
    const res = await post(body());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 2, rejected: [] });
    expect(w.log).toEqual(['insert:pending', 'update:sent']);
    expect(addToCart).toHaveBeenCalledTimes(1);
    expect(addToCart.mock.calls[0][0]).toBe(SECRET);
    expect(addToCart.mock.calls[0][1]).toEqual([
      { upc: MILK, quantity: 2, modality: 'PICKUP' },
      { upc: EGGS, quantity: 1, modality: 'PICKUP' },
    ]);
    const row = w.sends[0] as { status: string; total_cents: number; profile_id: string; modality: string; items: { upc: string; cents: number; name: string; key: string; canonical: string }[] };
    expect(row.status).toBe('sent');
    expect(row.profile_id).toBe('p1');
    expect(row.modality).toBe('PICKUP');
    expect(row.total_cents).toBe(2 * 350 + 300);
    expect(row.items.map((i) => [i.upc, i.cents, i.name, i.key, i.canonical])).toEqual([
      [MILK, 700, 'Milk 1 gal', 'milk#volume', 'milk'],
      [EGGS, 300, 'Eggs 12', 'eggs#count', 'eggs'],
    ]);
  });

  it('refuses a signed-out visitor, and a household with no store', async () => {
    requireHousehold.mockResolvedValue(NextResponse.json({ error: 'unauthorized' }, { status: 401 }));
    expect((await post(body())).status).toBe(401);
    setup({}, { id: 'h1', kroger_location_id: null });
    const res = await post(body());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('no_store');
  });

  it('400 for a bad body, and no row', async () => {
    const bad = [
      {},
      body({ weekId: 'nope' }),
      body({ modality: 'SHIP' }),
      body({ lines: [] }),
      body({ lines: lines(['k', '123', 1]) }),
      body({ lines: lines(['k', MILK, 0]) }),
      body({ lines: lines(['k', MILK, 100]) }),
      body({ lines: lines(['k', MILK, 1.5]) }),
      body({ lines: lines(['', MILK, 1]) }),
      body({ lines: lines(['a', MILK, 1], ['b', MILK, 1]) }),
      body({ resend: 'yes' }),
      body({ lines: Array.from({ length: 151 }, (_, i) => ({ key: `k${i}`, upc: String(i).padStart(13, '0'), quantity: 1 })) }),
    ];
    for (const b of bad) expect((await post(b)).status).toBe(400);
    expect(w.sends).toHaveLength(0);
    expect(addToCart).not.toHaveBeenCalled();
  });

  it('400 for malformed JSON', async () => {
    const res = await POST(new Request('http://x.test/api/kroger/cart', { method: 'POST', body: '{nope' }));
    expect(res.status).toBe(400);
  });

  it('refuses a cross-site request', async () => {
    expect((await post(body(), { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await post(body(), { 'sec-fetch-site': 'same-origin' })).status).toBe(200);
    expect(w.sends).toHaveLength(1);
  });

  it('429 too_many on the 21st send in a day, before any Kroger call', async () => {
    const recent = Array.from({ length: 20 }, (_, i) => ({ id: `old${i}`, household_id: 'h1', week_id: WEEK, user_id: 'u1', status: 'failed', items: [], created_at: new Date(Date.now() - 3_600_000).toISOString() }));
    setup({ existing: recent });
    const res = await post(body());
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('too_many');
    expect(addToCart).not.toHaveBeenCalled();
    expect(getUserAccess).not.toHaveBeenCalled();
  });

  it('sends from a day ago do not count against the limit', async () => {
    const old = Array.from({ length: 25 }, (_, i) => ({ id: `old${i}`, household_id: 'h1', week_id: 'other', user_id: 'u1', status: 'failed', items: [], created_at: new Date(Date.now() - 25 * 3_600_000).toISOString() }));
    setup({ existing: old });
    expect((await post(body())).status).toBe(200);
  });

  it('409 not_connected when this person has no link, using only their own', async () => {
    getUserAccess.mockResolvedValue(null);
    const res = await post(body());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('not_connected');
    expect(getUserAccess).toHaveBeenCalledWith(w.sb, 'u1');
    expect(w.sends).toHaveLength(0);
  });

  it('503 when the link cannot be read, and no row', async () => {
    getUserAccess.mockRejectedValue(new Error('network'));
    expect((await post(body())).status).toBe(503);
    expect(w.sends).toHaveLength(0);
  });

  it('404 when the week cannot be read', async () => {
    setup({ week: false });
    expect((await post(body())).status).toBe(404);
    expect(w.sends).toHaveLength(0);
  });

  it('400 unknown_product when a UPC is not in the cache, and no row', async () => {
    const res = await post(body({ lines: lines(['x', '0009999999999', 1]) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('unknown_product');
    expect(w.sends).toHaveLength(0);
    expect(addToCart).not.toHaveBeenCalled();
  });

  it('ignores a price in the body: the recorded cents are the cached ones', async () => {
    const lie = body({ lines: [{ key: 'milk#volume', upc: MILK, quantity: 1, cents: 1, name: 'Free milk', price: 1 }], cents: 1 });
    expect((await post(lie)).status).toBe(200);
    const row = w.sends[0] as { items: { cents: number; name: string }[]; total_cents: number };
    expect(row.items[0]).toMatchObject({ cents: 350, name: 'Milk 1 gal' });
    expect(row.total_cents).toBe(350);
  });

  it('a second identical request is 409 already_sent with no Kroger call; resend sends again', async () => {
    expect((await post(body())).status).toBe(200);
    addToCart.mockClear();
    const again = await post(body());
    expect(again.status).toBe(409);
    expect((await again.json()).error).toBe('already_sent');
    expect(addToCart).not.toHaveBeenCalled();
    expect(w.sends).toHaveLength(1);
    const forced = await post(body({ resend: true }));
    expect(forced.status).toBe(200);
    expect(addToCart).toHaveBeenCalledTimes(1);
    expect(w.sends).toHaveLength(2);
  });

  it('sent 2, wanted 3: sends only the 1 more', async () => {
    expect((await post(body({ lines: lines(['milk#volume', MILK, 2]) }))).status).toBe(200);
    addToCart.mockClear();
    const res = await post(body({ lines: lines(['milk#volume', MILK, 3]) }));
    expect(res.status).toBe(200);
    expect(addToCart.mock.calls[0][1]).toEqual([{ upc: MILK, quantity: 1, modality: 'PICKUP' }]);
    expect((w.sends[1] as { items: { quantity: number; cents: number }[] }).items).toMatchObject([{ quantity: 1, cents: 350 }]);
    // and now 3 are on record
    addToCart.mockClear();
    expect((await post(body({ lines: lines(['milk#volume', MILK, 3]) }))).status).toBe(409);
  });

  it('an unsure answer leaves the row pending, 504, and the next send is already_sent', async () => {
    addToCart.mockRejectedValueOnce(new KrogerUnsure('timeout'));
    const res = await post(body());
    expect(res.status).toBe(504);
    expect((await res.json()).error).toBe('unsure');
    expect((w.sends[0] as { status: string }).status).toBe('pending');
    const next = await post(body());
    expect(next.status).toBe(409);
    expect((await next.json()).error).toBe('already_sent');
  });

  it('a 401 is retried once with a forced refresh', async () => {
    getUserAccess.mockResolvedValueOnce({ access: SECRET, profileId: 'p1' }).mockResolvedValueOnce({ access: 'tok-fresh-456', profileId: 'p1' });
    addToCart.mockRejectedValueOnce(new KrogerAuth('401'));
    const res = await post(body());
    expect(res.status).toBe(200);
    expect(getUserAccess).toHaveBeenLastCalledWith(w.sb, 'u1', { force: true });
    expect(addToCart).toHaveBeenCalledTimes(2);
    expect(addToCart.mock.calls[1][0]).toBe('tok-fresh-456');
    expect((w.sends[0] as { status: string }).status).toBe('sent');
    expect(JSON.stringify(logs)).not.toContain('tok-fresh-456');
  });

  it('when the refresh also fails: row failed, link deleted, 409 not_connected', async () => {
    addToCart.mockRejectedValue(new KrogerAuth('401'));
    const res = await post(body());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('not_connected');
    expect((w.sends[0] as { status: string }).status).toBe('failed');
    expect(deleteLink).toHaveBeenCalledWith(w.sb, 'u1');
  });

  it('when the forced refresh finds no link: row failed, link deleted, 409', async () => {
    getUserAccess.mockResolvedValueOnce({ access: SECRET, profileId: 'p1' }).mockResolvedValueOnce(null);
    addToCart.mockRejectedValueOnce(new KrogerAuth('401'));
    expect((await post(body())).status).toBe(409);
    expect((w.sends[0] as { status: string }).status).toBe('failed');
    expect(deleteLink).toHaveBeenCalled();
    expect(addToCart).toHaveBeenCalledTimes(1);
  });

  it('when the forced refresh throws: nothing was added, row failed, 503, link kept', async () => {
    getUserAccess.mockResolvedValueOnce({ access: SECRET, profileId: 'p1' }).mockRejectedValueOnce(new Error('network'));
    addToCart.mockRejectedValueOnce(new KrogerAuth('401'));
    expect((await post(body())).status).toBe(503);
    expect((w.sends[0] as { status: string }).status).toBe('failed');
    expect(deleteLink).not.toHaveBeenCalled();
  });

  it('everything rejected: row failed, 502', async () => {
    addToCart.mockResolvedValue({ ok: [], rejected: [MILK, EGGS] });
    const res = await post(body());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('rejected');
    expect((w.sends[0] as { status: string }).status).toBe('failed');
  });

  it('partly rejected: 200 with the names, and the row holds only what was accepted', async () => {
    addToCart.mockResolvedValue({ ok: [MILK], rejected: [EGGS] });
    const res = await post(body());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 1, rejected: [{ key: 'eggs#count', name: 'Eggs 12' }] });
    const row = w.sends[0] as { status: string; total_cents: number; items: { upc: string }[] };
    expect(row.status).toBe('sent');
    expect(row.items.map((i) => i.upc)).toEqual([MILK]);
    expect(row.total_cents).toBe(700);
  });

  it('a failed insert is a 500 and Kroger is not called', async () => {
    setup({ insertError: true });
    expect((await post(body())).status).toBe(500);
    expect(addToCart).not.toHaveBeenCalled();
  });

  it('answers 200 even when the final update cannot be written', async () => {
    const upd = w.sb.from;
    w.sb.from = (t: string) => {
      const b = upd(t) as Record<string, unknown>;
      const update = b.update as (p: Row) => unknown;
      b.update = (p: Row) => (p.status === 'sent' ? { eq: async () => ({ error: { message: 'x' } }) } : update(p));
      return b;
    };
    expect((await post(body())).status).toBe(200);
  });

  it('two requests at once make one Kroger call', async () => {
    const [a, b] = await Promise.all([post(body({ resend: true })), post(body({ resend: true }))]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect((await loser.json()).error).toBe('already_sending');
    expect(addToCart).toHaveBeenCalledTimes(1);
    expect(w.sends.map((s) => s.status).sort()).toEqual(['failed', 'sent']);
  });

  it('a send from another week still in flight blocks this one', async () => {
    const live = { id: 'live1', household_id: 'h1', week_id: 'other', user_id: 'u2', status: 'pending', items: [], created_at: new Date(Date.now() - 5_000).toISOString() };
    setup({ existing: [live] });
    const res = await post(body());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('already_sending');
    expect(addToCart).not.toHaveBeenCalled();
    expect(w.sends.find((s) => s.id !== 'live1')?.status).toBe('failed');
  });

  it('an old unanswered send does not block a new one', async () => {
    const stale = { id: 'stale1', household_id: 'h1', week_id: 'other', user_id: 'u1', status: 'pending', items: [], created_at: new Date(Date.now() - 600_000).toISOString() };
    setup({ existing: [stale] });
    expect((await post(body())).status).toBe(200);
  });

  it('charges the cap before calling Kroger, and 429s without a call when it is spent', async () => {
    expect((await post(body())).status).toBe(200);
    expect(w.spent()).toBe(1);
    addToCart.mockClear();
    setup({ spendUsed: 400 });
    const res = await post(body());
    expect(res.status).toBe(429);
    expect(addToCart).not.toHaveBeenCalled();
    expect(w.sends).toHaveLength(0);
  });

  it('hands addToCart a charge for the single calls, and marks the row failed when the cap refuses them', async () => {
    addToCart.mockImplementation(async (_a: string, _i: unknown, o: { charge: (n: number) => Promise<boolean> }) => {
      expect(await o.charge(2)).toBe(true);
      throw new KrogerLimited('cap');
    });
    const res = await post(body());
    expect(res.status).toBe(429);
    expect((w.sends[0] as { status: string }).status).toBe('failed');
    expect(w.spent()).toBe(3);
  });

  it('503 not_configured when the cart is switched off', async () => {
    vi.stubEnv('KROGER_FAKE', '');
    vi.stubEnv('KROGER_REDIRECT_URI', '');
    const res = await post(body());
    expect(res.status).toBe(503);
    expect(w.sends).toHaveLength(0);
  });
});
