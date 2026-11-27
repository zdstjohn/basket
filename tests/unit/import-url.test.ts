import { beforeEach, describe, expect, it, vi } from 'vitest';

const { lookup, fetchMock, agentOpts } = vi.hoisted(() => ({
  lookup: vi.fn(),
  fetchMock: vi.fn(),
  agentOpts: { current: undefined as undefined | { connect?: { lookup?: unknown } } },
}));
vi.mock('node:dns/promises', () => ({ lookup: (...a: unknown[]) => lookup(...a) }));
vi.mock('undici', () => ({
  fetch: (...a: unknown[]) => fetchMock(...a),
  Agent: class {
    constructor(o: { connect?: { lookup?: unknown } }) {
      agentOpts.current = o;
    }
  },
}));

import { fetchPublicBytes, fetchRecipePage, guardedLookup, ImportError } from '@/lib/recipes/import-url';

const PUBLIC = [{ address: '93.184.216.34', family: 4 }];
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof ImportError ? e.code : `other:${String(e)}`;
  }
  return 'no_error';
};
const html = (body: string, headers: Record<string, string> = {}, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });

describe('fetchRecipePage', () => {
  beforeEach(() => {
    lookup.mockReset();
    fetchMock.mockReset();
    // Literal IPs resolve to themselves; names resolve to a public address.
    lookup.mockImplementation(async (host: string) =>
      /^[\d.]+$/.test(host) || host.includes(':') ? [{ address: host, family: host.includes(':') ? 6 : 4 }] : PUBLIC,
    );
  });

  it('rejects non-http(s) URLs and garbage', async () => {
    expect(await codeOf(fetchRecipePage('ftp://x'))).toBe('bad_url');
    expect(await codeOf(fetchRecipePage('not a url'))).toBe('bad_url');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['http://127.0.0.1', 'http://10.0.0.5', 'http://[::1]', 'http://169.254.169.254', 'http://192.168.1.1/x', 'http://[::ffff:10.0.0.1]'])(
    'blocks %s',
    async (url) => {
      expect(await codeOf(fetchRecipePage(url))).toBe('blocked_host');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('blocks a name when ANY resolved address is private', async () => {
    lookup.mockResolvedValue([PUBLIC[0], { address: '10.1.2.3', family: 4 }]);
    expect(await codeOf(fetchRecipePage('https://sneaky.example.test/'))).toBe('blocked_host');
  });

  it('blocks a public host that redirects to 127.0.0.1', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }));
    expect(await codeOf(fetchRecipePage('https://good.example.test/r'))).toBe('blocked_host');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('follows relative redirects up to 3, then fails', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/b' } }))
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/c' } }))
      .mockResolvedValueOnce(html('<p>ok</p>'));
    expect(await fetchRecipePage('https://good.example.test/a')).toBe('<p>ok</p>');
    expect(fetchMock.mock.calls[2][0]).toBe('https://good.example.test/c');

    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response(null, { status: 302, headers: { location: '/loop' } }));
    expect(await codeOf(fetchRecipePage('https://good.example.test/a'))).toBe('fetch_failed');
  });

  it('stops reading at 2 MB with too_large', async () => {
    let pulled = 0;
    const chunk = new Uint8Array(512 * 1024).fill(97);
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled += chunk.length;
        if (pulled > 3 * 1024 * 1024) c.close();
        else c.enqueue(chunk);
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(body, { headers: { 'content-type': 'text/html' } }));
    expect(await codeOf(fetchRecipePage('https://good.example.test/big'))).toBe('too_large');
    expect(pulled).toBeLessThanOrEqual(2.5 * 1024 * 1024 + 512 * 1024);
  });

  it('times out on a response that never ends', async () => {
    fetchMock.mockImplementation(async (_u: string, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode('<html>'));
          init.signal?.addEventListener('abort', () => c.error(init.signal?.reason));
        },
      });
      return new Response(body, { headers: { 'content-type': 'text/html' } });
    });
    const t0 = Date.now();
    expect(await codeOf(fetchRecipePage('https://good.example.test/slow'))).toBe('timeout');
    expect(Date.now() - t0).toBeLessThan(8500);
  }, 12000);

  it('rejects non-html content types', async () => {
    fetchMock.mockResolvedValueOnce(new Response('%PDF', { headers: { 'content-type': 'application/pdf' } }));
    expect(await codeOf(fetchRecipePage('https://good.example.test/x.pdf'))).toBe('not_html');
  });

  it('lets a page with no content-type through, since it is only parsed as text', async () => {
    const bare = new Response('<p>hi</p>', { status: 200 });
    bare.headers.delete('content-type');
    fetchMock.mockResolvedValueOnce(bare);
    expect(await fetchRecipePage('https://good.example.test/a')).toBe('<p>hi</p>');
  });

  it('carries the HTTP status on a failed fetch', async () => {
    fetchMock.mockResolvedValueOnce(html('nope', {}, 404));
    await expect(fetchRecipePage('https://good.example.test/a')).rejects.toMatchObject({ code: 'fetch_failed', status: 404 });
  });

  it('maps network errors and HTTP errors to fetch_failed', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await codeOf(fetchRecipePage('https://good.example.test/a'))).toBe('fetch_failed');
    fetchMock.mockResolvedValueOnce(html('nope', {}, 404));
    expect(await codeOf(fetchRecipePage('https://good.example.test/a'))).toBe('fetch_failed');
  });
});

describe('connect-time address check (DNS rebinding)', () => {
  const callLookup = (all: boolean) =>
    new Promise<{ err: unknown; result: unknown }>((resolve) => {
      (guardedLookup as unknown as (h: string, o: object, cb: (e: unknown, r: unknown) => void) => void)(
        'rebind.example.test', { all }, (err, result) => resolve({ err, result }),
      );
    });

  it('is the lookup the fetch agent connects with', () => {
    expect(agentOpts.current?.connect?.lookup).toBe(guardedLookup);
  });

  it('rejects a name that now resolves to a private address, even if one answer is public', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }, { address: '169.254.169.254', family: 4 }]);
    const { err } = await callLookup(true);
    expect(err).toBeInstanceOf(ImportError);
    expect((err as ImportError).code).toBe('blocked_host');
  });

  it('passes public addresses through in both lookup shapes', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    expect((await callLookup(true)).result).toEqual([{ address: '93.184.216.34', family: 4 }]);
    expect((await callLookup(false)).result).toBe('93.184.216.34');
  });

  it('surfaces a connect-time block from fetch as blocked_host', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed', { cause: new ImportError('blocked_host') }));
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    expect(await codeOf(fetchRecipePage('https://rebind.example.test/'))).toBe('blocked_host');
  });
});

describe('fetchPublicBytes', () => {
  const img = (body: Uint8Array | string, headers: Record<string, string> = {}) =>
    new Response(typeof body === 'string' ? body : new Blob([body as BlobPart]), { status: 200, headers: { 'content-type': 'image/jpeg', ...headers } });

  beforeEach(() => {
    lookup.mockReset();
    fetchMock.mockReset();
    lookup.mockImplementation(async (host: string) =>
      /^[\d.]+$/.test(host) || host.includes(':') ? [{ address: host, family: host.includes(':') ? 6 : 4 }] : PUBLIC,
    );
  });

  it('returns the bytes of a public image', async () => {
    fetchMock.mockResolvedValueOnce(img(new Uint8Array([1, 2, 3])));
    expect(Array.from(await fetchPublicBytes('https://img.example.test/a.jpg'))).toEqual([1, 2, 3]);
  });

  it('rejects a private address with blocked_host and never fetches', async () => {
    expect(await codeOf(fetchPublicBytes('http://10.0.0.5/a.jpg'))).toBe('blocked_host');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a redirect to a private address with blocked_host', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/x.jpg' } }));
    expect(await codeOf(fetchPublicBytes('https://good.example.test/a.jpg'))).toBe('blocked_host');
  });

  it('rejects a text/html reply with not_image', async () => {
    fetchMock.mockResolvedValueOnce(html('<p>hi</p>'));
    expect(await codeOf(fetchPublicBytes('https://good.example.test/a.jpg'))).toBe('not_image');
  });

  it('rejects a reply with no content-type as not_image', async () => {
    const bare = new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 });
    bare.headers.delete('content-type');
    fetchMock.mockResolvedValueOnce(bare);
    expect(await codeOf(fetchPublicBytes('https://good.example.test/a.jpg'))).toBe('not_image');
  });

  it('rejects image/svg+xml as not_image', async () => {
    fetchMock.mockResolvedValueOnce(img('<svg/>', { 'content-type': 'image/svg+xml' }));
    expect(await codeOf(fetchPublicBytes('https://good.example.test/a.svg'))).toBe('not_image');
  });

  it('rejects a body over maxBytes with too_large', async () => {
    fetchMock.mockResolvedValueOnce(img(new Uint8Array(100)));
    expect(await codeOf(fetchPublicBytes('https://good.example.test/a.jpg', { maxBytes: 10 }))).toBe('too_large');
  });
});
