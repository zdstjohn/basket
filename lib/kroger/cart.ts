import 'server-only';
import { fakeOn } from '@/lib/fake';
import type { Modality } from '@/lib/domain/cart';
import { fakeCartResult } from './fake';

const URL_ADD = 'https://api.kroger.com/v1/cart/add';
const TIMEOUT_MS = 10_000;
const AT_ONCE = 4;

/** Timeout, network error or 5xx: Kroger may have added the items. */
export class KrogerUnsure extends Error {}
/** 401 or 403: the shopper's token does not work. Nothing was added. */
export class KrogerAuth extends Error {}
/** The household's daily Kroger allowance refused the single calls. Nothing further was added. */
export class KrogerLimited extends Error {}

export interface CartItem {
  upc: string;
  quantity: number;
  modality: Modality;
}

/** One PUT. Returns the status; a timeout or network error means we cannot know what happened. */
async function put(access: string, items: CartItem[]): Promise<number> {
  try {
    const res = await fetch(URL_ADD, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.status;
  } catch {
    throw new KrogerUnsure('kroger cart/add no answer');
  }
}

const isOk = (status: number): boolean => status >= 200 && status < 300;

/**
 * Adds the items to the shopper's Fred Meyer cart (the cart cannot be read back). One call; when Kroger answers
 * 400 for several items, each is sent on its own (4 at once) to find which one it refused. `opts.charge` is asked
 * for permission (and to count the calls) before that fan-out, and answers false when the daily allowance is spent.
 * Returns UPCs. Throws KrogerAuth, KrogerUnsure or KrogerLimited; never returns a partial answer after a throw.
 */
export async function addToCart(
  access: string,
  items: CartItem[],
  opts: { charge?: (calls: number) => Promise<boolean> } = {},
): Promise<{ ok: string[]; rejected: string[] }> {
  if (fakeOn('KROGER_FAKE')) return fakeCartResult(items.map((i) => i.upc));

  const status = await put(access, items);
  if (isOk(status)) return { ok: items.map((i) => i.upc), rejected: [] };
  if (status === 401 || status === 403) throw new KrogerAuth(`kroger cart/add ${status}`);
  if (status !== 400) throw new KrogerUnsure(`kroger cart/add ${status}`);
  if (items.length === 1) return { ok: [], rejected: [items[0].upc] };

  if (opts.charge && !(await opts.charge(items.length))) throw new KrogerLimited('kroger allowance spent');
  const outcome = new Map<string, boolean>();
  let failure: KrogerUnsure | null = null;
  let next = 0;
  const worker = async () => {
    while (!failure && next < items.length) {
      const item = items[next++];
      try {
        const s = await put(access, [item]);
        if (isOk(s)) outcome.set(item.upc, true);
        else if (s === 400) outcome.set(item.upc, false);
        else failure = new KrogerUnsure(`kroger cart/add ${s}`);
      } catch (e) {
        failure = e instanceof KrogerUnsure ? e : new KrogerUnsure('kroger cart/add failed');
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, items.length) }, worker));
  if (failure) throw failure;
  return {
    ok: items.filter((i) => outcome.get(i.upc) === true).map((i) => i.upc),
    rejected: items.filter((i) => outcome.get(i.upc) === false).map((i) => i.upc),
  };
}
