import 'server-only';
import { fakeOn } from '@/lib/fake';
import type { Modality } from '@/lib/domain/cart';
import { fakeCartResult } from './fake';

const URL_ADD = 'https://api.kroger.com/v1/cart/add';
const TIMEOUT_MS = 10_000;
const AT_ONCE = 4;
/** Stop starting single calls after this long, so the route finishes inside its 300 s limit. */
const FANOUT_BUDGET_MS = 240_000;

/** What a fan-out of single calls learned before it stopped: UPCs Kroger took, refused for sure, and never answered. */
export interface CartOutcome {
  ok: string[];
  rejected: string[];
  unknown: string[];
}

/**
 * Timeout, network error or 5xx: Kroger may have added the items. After a fan-out of single calls, `outcome` says
 * which items were settled before it stopped, so that what was learned is not thrown away.
 */
export class KrogerUnsure extends Error {
  constructor(message: string, readonly outcome?: CartOutcome) {
    super(message);
  }
}
/** Kroger answered the whole batch with a definite 4xx other than auth (even 429): nothing was added. */
export class KrogerNotAdded extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
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
  if (status !== 400) {
    if (status >= 400 && status < 500) throw new KrogerNotAdded(`kroger cart/add ${status}`, status);
    throw new KrogerUnsure(`kroger cart/add ${status}`);
  }
  if (items.length === 1) return { ok: [], rejected: [items[0].upc] };

  if (opts.charge && !(await opts.charge(items.length))) throw new KrogerLimited('kroger allowance spent');
  const outcome = new Map<string, boolean>();
  let failure: KrogerUnsure | null = null;
  let next = 0;
  const stopAt = Date.now() + FANOUT_BUDGET_MS;
  const worker = async () => {
    while (!failure && next < items.length) {
      if (Date.now() > stopAt) {
        failure = new KrogerUnsure('kroger cart/add out of time');
        return;
      }
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
  const settled = {
    ok: items.filter((i) => outcome.get(i.upc) === true).map((i) => i.upc),
    rejected: items.filter((i) => outcome.get(i.upc) === false).map((i) => i.upc),
    unknown: items.filter((i) => !outcome.has(i.upc)).map((i) => i.upc),
  };
  if (failure) throw new KrogerUnsure((failure as KrogerUnsure).message, settled);
  return { ok: settled.ok, rejected: settled.rejected };
}
