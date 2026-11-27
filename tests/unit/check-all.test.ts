import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkedOffMessage, keysToCheck, keysToUntick } from '@/lib/list/check-all';
import { enqueuePatches, loadQueue, enqueuePatch } from '@/lib/list/offline';
import type { ListItem, Store } from '@/lib/domain/list';

const item = (key: string, store: Store, o: Partial<ListItem> = {}): ListItem => ({
  key, canonical: key, qty: { kind: 'count', amount: 1, base: 'each' }, role: 'pantry', store,
  estimateCents: null, haveIt: false, alwaysHave: false, outsideBudget: false, sources: [], ...o,
});

const items = [
  item('a', 'fred_meyer'),
  item('b', 'fred_meyer'),
  item('c', 'fred_meyer'), // already checked
  item('d', 'fred_meyer', { haveIt: true }),
  item('e', 'fred_meyer', { haveIt: true, alwaysHave: true }),
  item('f', 'amazon'),
];

describe('keysToCheck', () => {
  it('takes only this store, minus checked and have-it items', () => {
    expect(keysToCheck(items, 'fred_meyer', new Set(['c']))).toEqual(['a', 'b']);
    expect(keysToCheck(items, 'amazon', new Set(['c']))).toEqual(['f']);
    expect(keysToCheck(items, 'costco', new Set())).toEqual([]);
  });
  it('is empty once everything on the tab is checked', () => {
    expect(keysToCheck(items, 'fred_meyer', new Set(['a', 'b', 'c']))).toEqual([]);
  });
});

describe('Undo', () => {
  it('unticks exactly what the button ticked, never what was ticked before', () => {
    const before = new Set(['c']);
    const ticked = keysToCheck(items, 'fred_meyer', before);
    const after = new Set([...before, ...ticked]);
    expect(keysToUntick(ticked, after)).toEqual(['a', 'b']);
    expect([...after].filter((k) => !keysToUntick(ticked, after).includes(k))).toEqual(['c']);
  });
  it('leaves alone one that was unticked by hand in the meantime', () => {
    expect(keysToUntick(['a', 'b'], new Set(['b']))).toEqual(['b']);
  });
});

it('words the message', () => {
  expect(checkedOffMessage(1)).toBe('Checked off 1 item');
  expect(checkedOffMessage(12)).toBe('Checked off 12 items');
});

describe('enqueuePatches', () => {
  const data = new Map<string, string>();
  beforeEach(() => vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k),
  }));
  afterEach(() => { data.clear(); vi.unstubAllGlobals(); });

  it('keeps one entry per item, in order, after what was already queued', () => {
    enqueuePatch('h', { weekId: 'w', itemKey: 'z', patch: { have_it: true } });
    enqueuePatches('h', ['a', 'b', 'c'].map((itemKey) => ({ weekId: 'w', itemKey, patch: { checked: true } })));
    const q = loadQueue('h');
    expect(q.map((e) => e.itemKey)).toEqual(['z', 'a', 'b', 'c']);
    expect(new Set(q.map((e) => e.id)).size).toBe(4);
  });
  it('lets Undo overwrite the queued tick for the same item', () => {
    enqueuePatches('h', ['a', 'b'].map((itemKey) => ({ weekId: 'w', itemKey, patch: { checked: true } })));
    enqueuePatches('h', ['a', 'b'].map((itemKey) => ({ weekId: 'w', itemKey, patch: { checked: false } })));
    expect(loadQueue('h').map((e) => e.patch)).toEqual([{ checked: false }, { checked: false }]);
  });
  it('does nothing for an empty batch', () => {
    enqueuePatches('h', []);
    expect(loadQueue('h')).toEqual([]);
  });
});
