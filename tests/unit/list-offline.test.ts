import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueuePatch, flushQueue, isNetworkError, isRefusal, loadListCache, loadQueue, mergePatch, saveListCache, saveQueue, type QueuedPatch,
} from "@/lib/list/offline";

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

const e = (itemKey: string, patch: QueuedPatch['patch'], weekId = 'w1', id = `id-${itemKey}`): QueuedPatch => ({ id, weekId, itemKey, patch });
const offlineErr = () => new Error('TypeError: Failed to fetch');
const rlsErr = () => Object.assign(new Error('new row violates row-level security policy'), { code: '42501', status: 403 });

describe('mergePatch', () => {
  it('keeps the last write per item, merging different fields, under the newest id', () => {
    let q: QueuedPatch[] = [];
    q = mergePatch(q, e('milk#volume', { checked: true }, 'w1', 'a'));
    q = mergePatch(q, e('milk#volume', { have_it: true }, 'w1', 'b'));
    q = mergePatch(q, e('milk#volume', { checked: false }, 'w1', 'c'));
    expect(q).toEqual([e('milk#volume', { checked: false, have_it: true }, 'w1', 'c')]);
  });
  it('keeps different items and weeks apart', () => {
    let q: QueuedPatch[] = [];
    q = mergePatch(q, e('a', { checked: true }));
    q = mergePatch(q, e('b', { checked: true }));
    q = mergePatch(q, e('a', { checked: true }, 'w2'));
    expect(q).toHaveLength(3);
  });
});

describe('queue and cache storage', () => {
  beforeEach(() => void vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => void vi.unstubAllGlobals());

  it('round-trips the queue and merges repeats', () => {
    enqueuePatch('h1', { weekId: 'w1', itemKey: 'a', patch: { checked: true } });
    enqueuePatch('h1', { weekId: 'w1', itemKey: 'a', patch: { checked: false } });
    const q = loadQueue('h1');
    expect(q).toHaveLength(1);
    expect(q[0].patch).toEqual({ checked: false });
    expect(q[0].id).toBeTruthy();
    saveQueue('h1', []);
    expect(loadQueue('h1')).toEqual([]);
  });
  it('keeps each household its own queue', () => {
    enqueuePatch('h1', { weekId: 'w1', itemKey: 'a', patch: { checked: true } });
    expect(loadQueue('h2')).toEqual([]);
    expect((globalThis.localStorage as unknown as ReturnType<typeof fakeStorage>).data.has('list-queue:h1')).toBe(true);
  });
  it('round-trips the list cache per week', () => {
    saveListCache('w1', { hello: 1 });
    expect(loadListCache('w1')).toEqual({ hello: 1 });
    expect(loadListCache('w2')).toBeNull();
    expect((globalThis.localStorage as unknown as ReturnType<typeof fakeStorage>).data.has('list:w1')).toBe(true);
  });
  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('no'); },
      setItem: () => { throw new Error('full'); },
      removeItem: () => { throw new Error('no'); },
    });
    expect(() => enqueuePatch('h1', { weekId: 'w1', itemKey: 'a', patch: { checked: true } })).not.toThrow();
    expect(loadQueue('h1')).toEqual([]);
    expect(() => saveListCache('w1', {})).not.toThrow();
    expect(loadListCache('w1')).toBeNull();
  });
});

describe('isRefusal / isNetworkError', () => {
  afterEach(() => void vi.unstubAllGlobals());

  const kept: [string, unknown][] = [
    ['Failed to fetch', new Error('TypeError: Failed to fetch')],
    ['Load failed', new Error('Load failed')],
    ['PostgrestError-shaped fetch failure', { message: 'TypeError: Failed to fetch', code: '', details: '' }],
    ['JWT expired (401)', Object.assign(new Error('JWT expired'), { code: 'PGRST301', status: 401 })],
    ['JWT expired, status only', Object.assign(new Error('JWT expired'), { status: 401 })],
    ['PGRST302', { message: 'x', code: 'PGRST302' }],
    ['PGRST303', { message: 'x', code: 'PGRST303' }],
    ['500 with no code', Object.assign(new Error('Internal Server Error'), { status: 500 })],
    ['500 with a PostgREST code (PGRST000)', Object.assign(new Error('x'), { code: 'PGRST000', status: 500 })],
    ['500 with a code of the wrong shape', Object.assign(new Error('x'), { code: 'oops', status: 500 })],
    ['a Postgres-style code without a 5xx status (P0001)', { message: 'x', code: 'P0001' }],
    ['Bad Gateway (502)', Object.assign(new Error('Bad Gateway'), { status: 502 })],
    ['upstream request timeout (504)', Object.assign(new Error('upstream request timeout'), { status: 504 })],
    ['The operation was aborted', new Error('The operation was aborted')],
    ['a bare TypeError', new TypeError("Cannot read properties of undefined (reading 'x')")],
    ['a string', 'boom'],
    ['null', null],
  ];
  const dropped: [string, unknown][] = [
    ['code 42501', { message: 'permission denied for table week_item_state', code: '42501' }],
    ['code 23514', { message: 'violates check constraint', code: '23514' }],
    ['code 22P02', { message: 'invalid input syntax', code: '22P02' }],
    ['status 400', Object.assign(new Error('Bad Request'), { status: 400 })],
    ['status 403', Object.assign(new Error('Forbidden'), { status: 403 })],
    ['status 404', Object.assign(new Error('Not Found'), { status: 404 })],
    ['status 409', Object.assign(new Error('Conflict'), { status: 409 })],
    ['status 422', Object.assign(new Error('Unprocessable'), { status: 422 })],
    ['status 500 with a Postgres code (P0001)', Object.assign(new Error('raised by a trigger'), { code: 'P0001', status: 500 })],
    ['status 503 with a Postgres code (XX000)', Object.assign(new Error('internal'), { code: 'XX000', status: 503 })],
    ['status 406', Object.assign(new Error('Not Acceptable'), { status: 406 })],
    ['status 413', Object.assign(new Error('Payload Too Large'), { status: 413 })],
  ];

  it.each(kept)('keeps in the queue: %s', (_n, err) => {
    expect(isRefusal(err)).toBe(false);
    expect(isNetworkError(err)).toBe(true);
  });
  it.each(dropped)('drops from the queue: %s', (_n, err) => {
    expect(isRefusal(err)).toBe(true);
    expect(isNetworkError(err)).toBe(false);
  });
  it('is never a refusal whenever the phone says it is offline', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(isRefusal(rlsErr())).toBe(false);
    expect(isNetworkError(rlsErr())).toBe(true);
  });
  it('waits when a permanent error carries no code (accepted)', () => {
    expect(isNetworkError(new Error('new row violates row-level security policy'))).toBe(true);
  });
});

describe('flushQueue', () => {
  beforeEach(() => void vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => void vi.unstubAllGlobals());

  it('sends in order and empties the queue', async () => {
    saveQueue('h1', [e('a', { checked: true }), e('b', { checked: true })]);
    const seen: string[] = [];
    expect(await flushQueue('h1', async (x) => void seen.push(x.itemKey))).toBe(0);
    expect(seen).toEqual(['a', 'b']);
    expect(loadQueue('h1')).toEqual([]);
  });

  it('stops at a network failure and keeps that entry and the rest', async () => {
    saveQueue('h1', [e('a', { checked: true }), e('b', { checked: true }), e('c', { checked: true })]);
    const left = await flushQueue('h1', async (x) => {
      if (x.itemKey === 'b') throw offlineErr();
    });
    expect(left).toBe(2);
    expect(loadQueue('h1').map((x) => x.itemKey)).toEqual(['b', 'c']);
  });

  it('drops an entry the server refuses and carries on with the rest', async () => {
    saveQueue('h1', [e('a', { checked: true }), e('b', { checked: true }), e('c', { checked: true })]);
    const seen: string[] = [];
    const left = await flushQueue('h1', async (x) => {
      if (x.itemKey === 'a') throw rlsErr();
      seen.push(x.itemKey);
    });
    expect(left).toBe(0);
    expect(seen).toEqual(['b', 'c']);
  });

  it('keeps a change made while a send is in flight, and sends it next', async () => {
    saveQueue('h1', [e('a', { checked: true }, 'w1', 'old')]);
    const sent: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const p = flushQueue('h1', async (x) => {
      sent.push(`${x.itemKey}:${x.id}`);
      if (x.id === 'old') {
        // The user taps again while the first send is on the wire.
        saveQueue('h1', mergePatch(loadQueue('h1'), e('a', { checked: false }, 'w1', 'new')));
        saveQueue('h1', mergePatch(loadQueue('h1'), e('z', { checked: true }, 'w1', 'zz')));
        await gate;
      }
    });
    release();
    expect(await p).toBe(0);
    expect(sent).toEqual(['a:old', 'a:new', 'z:zz']);
  });

  it('runs one flush at a time: a second call joins the first and nothing is sent twice', async () => {
    saveQueue('h1', [e('a', { checked: true })]);
    const apply = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const [x, y] = await Promise.all([flushQueue('h1', apply), flushQueue('h1', apply)]);
    expect([x, y]).toEqual([0, 0]);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('keeps the entry on a send timeout and starts a new send on the next flush', async () => {
    saveQueue('h1', [e('a', { checked: true })]);
    const timeout = vi.fn(async () => { throw new TypeError('Failed to fetch (timeout)'); });
    expect(await flushQueue('h1', timeout)).toBe(1);
    expect(loadQueue('h1').map((x) => x.itemKey)).toEqual(['a']);
    const ok = vi.fn(async () => {});
    expect(await flushQueue('h1', ok)).toBe(0);
    expect(timeout).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('is empty-safe', async () => {
    expect(await flushQueue('h9', async () => {})).toBe(0);
  });

  describe('giving up on a stuck entry', () => {
    const MIN = 60_000;
    const HOUR = 60 * MIN;
    const T0 = new Date('2026-06-01T12:00:00Z').getTime();
    const s500 = () => Object.assign(new Error('Internal Server Error'), { status: 500 });
    const fetchFail = () => new TypeError('Failed to fetch');
    const timeout = () => new TypeError('Failed to fetch (timeout)');
    const stored = (): QueuedPatch[] => loadQueue('h1');
    const at = (ms: number) => vi.setSystemTime(T0 + ms);
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      at(0);
    });
    afterEach(() => void vi.useRealTimers());

    it('drops a 500 with code P0001 at once, carries on, and reports the drop', async () => {
      saveQueue('h1', [e('a', { checked: true }), e('b', { checked: true })]);
      const seen: string[] = [];
      const dropped: string[] = [];
      const left = await flushQueue(
        'h1',
        async (x) => {
          if (x.itemKey === 'a') throw Object.assign(new Error('trigger'), { code: 'P0001', status: 500 });
          seen.push(x.itemKey);
        },
        undefined,
        (x) => void dropped.push(x.itemKey),
      );
      expect(left).toBe(0);
      expect(seen).toEqual(['b']);
      expect(dropped).toEqual(['a']);
    });

    it.each([406, 413])('drops status %i at once', async (status) => {
      saveQueue('h1', [e('a', { checked: true })]);
      expect(await flushQueue('h1', async () => { throw Object.assign(new Error('x'), { status }); })).toBe(0);
      expect(stored()).toEqual([]);
    });

    it('keeps the entry through 30 thrown "Failed to fetch" within a minute', async () => {
      saveQueue('h1', [e('a', { checked: true })]);
      const dropped = vi.fn();
      for (let i = 0; i < 30; i++) {
        at(i * 1000);
        expect(await flushQueue('h1', async () => { throw fetchFail(); }, undefined, dropped)).toBe(1);
      }
      expect(dropped).not.toHaveBeenCalled();
      expect(stored()[0].attempts ?? 0).toBe(0);
    });

    it('keeps the entry through 30 timeouts over an hour', async () => {
      saveQueue('h1', [e('a', { checked: true })]);
      const dropped = vi.fn();
      for (let i = 0; i < 30; i++) {
        at(i * 2 * MIN);
        expect(await flushQueue('h1', async () => { throw timeout(); }, undefined, dropped)).toBe(1);
      }
      expect(dropped).not.toHaveBeenCalled();
      expect(stored()[0].attempts ?? 0).toBe(0);
    });

    it.each([
      ['401', { status: 401 }],
      ['status 0', { status: 0 }],
      ['PGRST301 with 401', { status: 401, code: 'PGRST301' }],
      ['PGRST303', { code: 'PGRST303' }],
      ['408', { status: 408 }],
      ['429', { status: 429 }],
      ['502', { status: 502 }],
      ['503', { status: 503 }],
      ['504', { status: 504 }],
      ['520 (edge)', { status: 520 }],
      ['524 (edge timeout)', { status: 524 }],
      ['530 (edge)', { status: 530 }],
    ])('never counts %s, even 50 times over 11 minutes', async (_n, extra) => {
      saveQueue('h1', [e('a', { checked: true })]);
      const dropped = vi.fn();
      for (let i = 0; i < 50; i++) {
        at(i * 15_000);
        await flushQueue('h1', async () => { throw Object.assign(new Error('x'), extra); }, undefined, dropped);
      }
      expect(dropped).not.toHaveBeenCalled();
      expect(stored()[0].attempts ?? 0).toBe(0);
    });

    it('counts a code-less 500 at most once a minute and drops it only after 10 counts and 10 minutes', async () => {
      saveQueue('h1', [e('a', { checked: true })]);
      const dropped: number[] = [];
      for (let t = 0; t <= 15 * MIN && dropped.length === 0; t += 2000) {
        at(t);
        await flushQueue('h1', async () => { throw s500(); }, undefined, () => void dropped.push(t));
        if (dropped.length === 0) expect(stored()[0].attempts).toBeLessThanOrEqual(Math.floor(t / MIN) + 1);
      }
      expect(dropped).toHaveLength(1);
      expect(dropped[0]).toBeGreaterThanOrEqual(10 * MIN);
      expect(dropped[0]).toBeLessThan(10 * MIN + 2000 + 1);
      expect(stored()).toEqual([]);
    });

    it('does not drop a code-less 500 after 10 counts if 10 minutes have not passed', async () => {
      const t = T0 - 1000;
      saveQueue('h1', [{ ...e('a', { checked: true }), attempts: 9, firstTriedAt: t, lastCountedAt: t - 2 * MIN }]);
      expect(await flushQueue('h1', async () => { throw s500(); })).toBe(1);
      expect(stored()[0].attempts).toBe(10);
    });

    it('drops an entry 24h and a minute past its first try on its next failure of any kind', async () => {
      for (const err of [fetchFail(), timeout(), Object.assign(new Error('x'), { status: 401 }), s500()]) {
        saveQueue('h1', [{ ...e('old', { checked: true }), firstTriedAt: T0 - (24 * HOUR + MIN) }]);
        const dropped: string[] = [];
        expect(await flushQueue('h1', async () => { throw err; }, undefined, (x) => void dropped.push(x.itemKey))).toBe(0);
        expect(dropped).toEqual(['old']);
      }
      saveQueue('h1', [{ ...e('young', { checked: true }), firstTriedAt: T0 - (24 * HOUR - MIN) }]);
      expect(await flushQueue('h1', async () => { throw fetchFail(); })).toBe(1);
    });

    it('does not drop an old entry while the phone says it is offline', async () => {
      saveQueue('h1', [{ ...e('old', { checked: true }), firstTriedAt: T0 - 48 * HOUR }]);
      vi.stubGlobal('navigator', { onLine: false });
      expect(await flushQueue('h1', async () => { throw fetchFail(); })).toBe(1);
    });

    it('still works for a stored entry without the new fields', async () => {
      saveQueue('h1', [e('a', { checked: true })]);
      expect(await flushQueue('h1', async () => { throw fetchFail(); })).toBe(1);
      expect(stored()[0].firstTriedAt).toBe(T0);
      expect(await flushQueue('h1', async () => {})).toBe(0);
    });

    it('a success leaves the other entries alone', async () => {
      const q = [
        { ...e('a', { checked: true }), attempts: 4, firstTriedAt: T0 - HOUR, lastCountedAt: T0 - HOUR },
        e('b', { checked: true }),
        { ...e('c', { checked: true }), attempts: 7, firstTriedAt: T0 - HOUR, lastCountedAt: T0 - HOUR },
      ];
      saveQueue('h1', q);
      await flushQueue('h1', async (x) => {
        if (x.itemKey === 'c') throw s500();
      });
      expect(stored().map((x) => x.itemKey)).toEqual(['c']);
      expect(stored()[0]).toMatchObject({ attempts: 8, firstTriedAt: T0 - HOUR });
    });
  });
});
