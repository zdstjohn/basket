import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueuePatch, flushQueue, isNetworkError, loadListCache, loadQueue, mergePatch, saveListCache, saveQueue, type QueuedPatch,
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
const rlsErr = () => new Error('new row violates row-level security policy');

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

describe('isNetworkError', () => {
  afterEach(() => void vi.unstubAllGlobals());

  it('recognises fetch failures however they are shaped', () => {
    expect(isNetworkError(new Error('TypeError: Failed to fetch'))).toBe(true); // what setItemState throws
    expect(isNetworkError(new Error('Load failed'))).toBe(true);
    expect(isNetworkError(new Error('NetworkError when attempting to fetch resource.'))).toBe(true);
    expect(isNetworkError(new Error('Network request failed'))).toBe(true);
    expect(isNetworkError({ message: 'TypeError: Failed to fetch', code: '', details: '' })).toBe(true); // PostgrestError shape
  });
  it('treats a refusal, and a plain TypeError from a bug, as not the network', () => {
    expect(isNetworkError(rlsErr())).toBe(false);
    expect(isNetworkError({ message: 'permission denied for table week_item_state', code: '42501' })).toBe(false);
    expect(isNetworkError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(isNetworkError('boom')).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
  it('is the network whenever the phone says it is offline', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(isNetworkError(rlsErr())).toBe(true);
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

  it('is empty-safe', async () => {
    expect(await flushQueue('h9', async () => {})).toBe(0);
  });
});
