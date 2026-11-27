import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refreshTokens = vi.fn();
vi.mock('@/lib/kroger/oauth', async (orig) => ({ ...(await orig<object>()), refreshTokens: (r: string) => refreshTokens(r) }));

import { seal } from '@/lib/kroger/vault';
import { deleteLink, getUserAccess, linkStatus, saveLink } from '@/lib/kroger/link';

interface Row { user_id: string; sealed: string; profile_id: string | null; updated_at: string }
let row: Row | null;
let stale = false; // simulates another request updating the row between our read and our write
let updates = 0;

/** Just enough of the Supabase query builder for kroger_links, with row-level scoping by user_id. */
function client() {
  return {
    from(table: string) {
      expect(table).toBe('kroger_links');
      const q = { op: 'select', filters: {} as Record<string, string>, patch: null as Partial<Row> | null };
      const run = () => {
        const match = row && Object.entries(q.filters).every(([k, v]) => (row as unknown as Record<string, string>)[k] === v);
        if (q.op === 'delete') { if (match) row = null; return { data: null, error: null }; }
        if (q.op === 'update') {
          updates++;
          if (stale) { row = { ...(row as Row), sealed: seal(JSON.stringify({ access: 'other-access', refresh: 'other-refresh', accessExp: Date.now() + 1_800_000 }), 'u1'), updated_at: 'T2' }; stale = false; }
          const hit = row && Object.entries(q.filters).every(([k, v]) => (row as unknown as Record<string, string>)[k] === v);
          if (hit) row = { ...(row as Row), ...q.patch };
          return { data: hit ? [{ user_id: 'u1' }] : [], error: null };
        }
        return { data: match ? row : null, error: null };
      };
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (k: string, v: string) => { q.filters[k] = v; return b; },
        maybeSingle: async () => run(),
        delete: () => { q.op = 'delete'; return b; },
        update: (p: Partial<Row>) => { q.op = 'update'; q.patch = p; return b; },
        upsert: async (v: Row) => { row = { ...v, updated_at: v.updated_at ?? 'T0' }; return { error: null }; },
        then: (res: (v: unknown) => void) => res(run()),
      };
      return b;
    },
  };
}
const sb = () => client() as never;

const NOW = new Date('2026-11-26T12:00:00Z').getTime();
const tokens = (accessExp: number) => ({ access: 'fake-access', refresh: 'fake-refresh', accessExp });
const put = (accessExp: number, aad = 'u1') => {
  row = { user_id: 'u1', sealed: seal(JSON.stringify(tokens(accessExp)), aad), profile_id: 'p1', updated_at: 'T1' };
};

let logs: unknown[][];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv('KROGER_TOKEN_KEY', Buffer.alloc(32, 7).toString('base64'));
  refreshTokens.mockReset();
  row = null; stale = false; updates = 0; logs = [];
  for (const m of ['error', 'log', 'warn'] as const) vi.spyOn(console, m).mockImplementation((...a) => { logs.push(a); });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  // No case may have logged a token, whatever it did.
  expect(JSON.stringify(logs)).not.toMatch(/fake-access|fake-refresh|other-access|other-refresh|the-code/);
});

describe('getUserAccess', () => {
  it('returns a fresh access token with no network', async () => {
    put(NOW + 10 * 60_000);
    expect(await getUserAccess(sb(), 'u1')).toEqual({ access: 'fake-access', profileId: 'p1' });
    expect(refreshTokens).not.toHaveBeenCalled();
  });
  it('refreshes a token expiring in 30 s and stores the new refresh token', async () => {
    put(NOW + 30_000);
    refreshTokens.mockResolvedValue({ access: 'new-a', refresh: 'new-r', accessExp: NOW + 1_800_000 });
    expect(await getUserAccess(sb(), 'u1')).toEqual({ access: 'new-a', profileId: 'p1' });
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(refreshTokens).toHaveBeenCalledWith('fake-refresh');
    expect(row?.updated_at).not.toBe('T1');
    const again = await getUserAccess(sb(), 'u1'); // now fresh: no second refresh
    expect(again?.access).toBe('new-a');
    expect(refreshTokens).toHaveBeenCalledTimes(1);
  });
  it('force refreshes even when fresh', async () => {
    put(NOW + 10 * 60_000);
    refreshTokens.mockResolvedValue({ access: 'new-a', refresh: 'new-r', accessExp: NOW + 1_800_000 });
    expect((await getUserAccess(sb(), 'u1', { force: true }))?.access).toBe('new-a');
  });
  it("deletes the row and returns null when Kroger refuses", async () => {
    put(NOW + 1000);
    refreshTokens.mockResolvedValue('refused');
    expect(await getUserAccess(sb(), 'u1')).toBeNull();
    expect(row).toBeNull();
  });
  it('keeps the row and returns null when Kroger rejects for another reason (wrong secret)', async () => {
    put(NOW + 1000);
    refreshTokens.mockResolvedValue('rejected');
    expect(await getUserAccess(sb(), 'u1')).toBeNull();
    expect(row).not.toBeNull();
  });
  it("on 'refused', uses a newer row another request saved instead of deleting it", async () => {
    put(NOW + 1000);
    refreshTokens.mockImplementation(async () => {
      row = { ...(row as Row), sealed: seal(JSON.stringify({ access: 'other-access', refresh: 'other-refresh', accessExp: NOW + 1_800_000 }), 'u1'), updated_at: 'T2' };
      return 'refused';
    });
    expect(await getUserAccess(sb(), 'u1')).toEqual({ access: 'other-access', profileId: 'p1' });
    expect(row?.updated_at).toBe('T2');
  });
  it("on 'refused', deletes only the row it read", async () => {
    put(NOW + 1000);
    let deletedWith: Record<string, string> | null = null;
    refreshTokens.mockResolvedValue('refused');
    const base = client();
    const spy = { from: (t: string) => { const b = base.from(t) as Record<string, (...a: unknown[]) => unknown>; const del = b.delete; b.delete = () => { const r = del() as Record<string, (...a: unknown[]) => unknown>; const eq = r.eq; r.eq = (k: unknown, v: unknown) => { (deletedWith ??= {})[k as string] = v as string; return eq(k, v); }; return r; }; return b; } };
    expect(await getUserAccess(spy as never, 'u1')).toBeNull();
    expect(deletedWith).toEqual({ user_id: 'u1', updated_at: 'T1' });
    expect(row).toBeNull();
  });
  it('throws kroger link read failed on a database error', async () => {
    const failing = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'x' } }) }) }) }) };
    await expect(getUserAccess(failing as never, 'u1')).rejects.toThrow('kroger link read failed');
  });
  it('lets a network failure through and keeps the row', async () => {
    put(NOW + 1000);
    refreshTokens.mockRejectedValue(new Error('kroger token 503'));
    await expect(getUserAccess(sb(), 'u1')).rejects.toThrow('kroger token 503');
    expect(row).not.toBeNull();
  });
  it('when the update hits 0 rows, returns the other request\'s token without a second refresh', async () => {
    put(NOW + 1000);
    stale = true;
    refreshTokens.mockResolvedValue({ access: 'new-a', refresh: 'new-r', accessExp: NOW + 1_800_000 });
    expect(await getUserAccess(sb(), 'u1')).toEqual({ access: 'other-access', profileId: 'p1' });
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(updates).toBe(1);
  });
  it('keeps the row and returns null when it cannot be unsealed (key changed); a reconnect overwrites it', async () => {
    put(NOW + 10 * 60_000);
    vi.stubEnv('KROGER_TOKEN_KEY', Buffer.alloc(32, 9).toString('base64'));
    expect(await getUserAccess(sb(), 'u1')).toBeNull();
    expect(row).not.toBeNull();
    await saveLink(sb(), 'u1', tokens(NOW + 1_800_000), 'p2');
    expect((await getUserAccess(sb(), 'u1'))?.access).toBe('fake-access');
  });
  it('keeps the row and returns null when the key is missing (I5)', async () => {
    put(NOW + 10 * 60_000);
    vi.stubEnv('KROGER_TOKEN_KEY', '');
    expect(await getUserAccess(sb(), 'u1')).toBeNull();
    expect(row).not.toBeNull();
  });
  it('returns null for no row, and for a row sealed for someone else (kept)', async () => {
    expect(await getUserAccess(sb(), 'u1')).toBeNull();
    put(NOW + 10 * 60_000, 'u2');
    expect(await getUserAccess(sb(), 'u1')).toBeNull();
    expect(row).not.toBeNull();
  });
});

describe('saveLink / linkStatus / deleteLink', () => {
  it('saves sealed (not plain) and reports connected, then deletes', async () => {
    expect(await linkStatus(sb(), 'u1')).toEqual({ connected: false, profileId: null });
    await saveLink(sb(), 'u1', tokens(NOW + 1_800_000), 'p9');
    expect(row?.sealed).not.toContain('fake-access');
    expect(row?.sealed.startsWith('v1.')).toBe(true);
    expect(await linkStatus(sb(), 'u1')).toEqual({ connected: true, profileId: 'p9' });
    expect((await getUserAccess(sb(), 'u1'))?.access).toBe('fake-access');
    await deleteLink(sb(), 'u1');
    expect(row).toBeNull();
  });
});
