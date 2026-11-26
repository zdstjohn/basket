import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueuePatch, flushQueue, loadListCache, loadQueue, mergePatch, saveListCache, saveQueue, type QueuedPatch,
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

const e = (itemKey: string, patch: QueuedPatch['patch'], weekId = 'w1'): QueuedPatch => ({ weekId, itemKey, patch });

describe('mergePatch', () => {
  it('keeps the last write per item, merging different fields', () => {
    let q: QueuedPatch[] = [];
    q = mergePatch(q, e('milk#volume', { checked: true }));
    q = mergePatch(q, e('milk#volume', { have_it: true }));
    q = mergePatch(q, e('milk#volume', { checked: false }));
    expect(q).toEqual([e('milk#volume', { checked: false, have_it: true })]);
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

  it('round-trips the queue', () => {
    enqueuePatch(e('a', { checked: true }));
    enqueuePatch(e('a', { checked: false }));
    expect(loadQueue()).toEqual([e('a', { checked: false })]);
    saveQueue([]);
    expect(loadQueue()).toEqual([]);
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
    expect(() => enqueuePatch(e('a', { checked: true }))).not.toThrow();
    expect(loadQueue()).toEqual([]);
    expect(() => saveListCache('w1', {})).not.toThrow();
    expect(loadListCache('w1')).toBeNull();
  });
});

describe('flushQueue', () => {
  it('replays in order and returns what is left after a failure', async () => {
    const q = [e('a', { checked: true }), e('b', { checked: true }), e('c', { checked: true })];
    const seen: string[] = [];
    const left = await flushQueue(q, async (x) => {
      if (x.itemKey === 'b') throw new Error('offline');
      seen.push(x.itemKey);
    });
    expect(seen).toEqual(['a']);
    expect(left.map((x) => x.itemKey)).toEqual(['b', 'c']);
  });
  it('returns an empty queue when everything is sent', async () => {
    expect(await flushQueue([e('a', { checked: true })], async () => {})).toEqual([]);
  });
});
