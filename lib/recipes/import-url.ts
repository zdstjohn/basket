import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type ImportErrorCode =
  | 'bad_url' | 'blocked_host' | 'too_large' | 'timeout' | 'not_html' | 'fetch_failed';

export class ImportError extends Error {
  constructor(public readonly code: ImportErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ImportError';
  }
}

const MAX_REDIRECTS = 3;

function blockedV4(a: number, b: number): boolean {
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast and reserved
  );
}

/** Expands an IPv6 address to eight 16-bit groups, or null when it is malformed. */
function groupsV6(addr: string): number[] | null {
  let s = addr.split('%')[0].toLowerCase();
  const tail = s.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (tail) {
    const [x, y, z, w] = tail.slice(1).map(Number);
    s = s.slice(0, tail.index) + ((x << 8) | y).toString(16) + ':' + ((z << 8) | w).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array<string>(fill).fill('0'), ...rest].map((g) => parseInt(g, 16));
  return all.length === 8 && all.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? all : null;
}

/** True for any address a recipe fetch must never reach. Unparseable input counts as blocked. */
export function isBlockedAddress(addr: string): boolean {
  const version = isIP(addr);
  if (version === 4) {
    const [a, b] = addr.split('.').map(Number);
    return blockedV4(a, b);
  }
  if (version === 6) {
    const g = groupsV6(addr);
    if (!g) return true;
    if (g.every((x) => x === 0)) return true; // ::
    if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
    if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
    if ((g[0] & 0xff00) === 0xff00) return true; // multicast
    const v4 = (hi: number) => blockedV4(hi >> 8, hi & 0xff);
    if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return v4(g[6]); // ::ffff:a.b.c.d and ::a.b.c.d
    if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return v4(g[6]); // NAT64
    if (g[0] === 0x2002) return v4(g[1]); // 6to4
    return false;
  }
  return true;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (!host) throw new ImportError('bad_url');
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new ImportError('blocked_host');
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new ImportError('fetch_failed', 'dns lookup failed');
  }
  if (addrs.length === 0 || addrs.some((a) => isBlockedAddress(a.address))) {
    throw new ImportError('blocked_host');
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw new ImportError('too_large');
  }
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ImportError('too_large');
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    buf.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder('utf-8').decode(buf);
}

/**
 * Fetches a public web page for recipe import. Server only: it refuses non-http(s) URLs, any host
 * that resolves to a private/loopback/link-local address, follows at most 3 redirects (re-checking
 * each), and stops at `maxBytes`.
 */
export async function fetchRecipePage(
  url: string,
  opts: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<string> {
  const { timeoutMs = 8000, maxBytes = 2 * 1024 * 1024 } = opts;
  const signal = AbortSignal.timeout(timeoutMs);
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    throw new ImportError('bad_url');
  }

  try {
    for (let hop = 0; ; hop++) {
      if (current.protocol !== 'http:' && current.protocol !== 'https:') throw new ImportError('bad_url');
      await assertPublicHost(current.hostname);
      const res = await fetch(current.toString(), {
        redirect: 'manual',
        signal,
        headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'BasketRecipeImport/1.0' },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        await res.body?.cancel().catch(() => {});
        if (!location || hop >= MAX_REDIRECTS) throw new ImportError('fetch_failed', 'too many redirects');
        try {
          current = new URL(location, current);
        } catch {
          throw new ImportError('bad_url');
        }
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        throw new ImportError('fetch_failed', `http ${res.status}`);
      }
      const type = res.headers.get('content-type');
      if (type && !/text\/html|application\/xhtml\+xml/i.test(type)) {
        await res.body?.cancel().catch(() => {});
        throw new ImportError('not_html');
      }
      return await readCapped(res, maxBytes);
    }
  } catch (e) {
    if (e instanceof ImportError) throw e;
    if (signal.aborted || (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError'))) {
      throw new ImportError('timeout');
    }
    throw new ImportError('fetch_failed');
  }
}
