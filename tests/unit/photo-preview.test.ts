import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportError } from '@/lib/recipes/import-url';

const getUser = vi.fn();
const getMyHousehold = vi.fn();
const fetchPublicBytes = vi.fn();
const download = vi.fn();
const single = vi.fn();
const selectCols = vi.fn();
const updateResult = vi.fn();
const updates: { patch: Record<string, unknown>; filters: [string, string, unknown][] }[] = [];

vi.mock('@/lib/db/server', () => ({
  createServerClient: async () => ({
    auth: { getUser },
    from: () => ({
      select: (cols: string) => {
        selectCols(cols);
        return { eq: () => ({ maybeSingle: single }) };
      },
      update: (patch: Record<string, unknown>) => {
        const rec = { patch, filters: [] as [string, string, unknown][] };
        updates.push(rec);
        const b = {
          eq: (c: string, v: unknown) => (rec.filters.push(['eq', c, v]), b),
          is: (c: string, v: unknown) => (rec.filters.push(['is', c, v]), b),
          select: () => updateResult(),
        };
        return b;
      },
    }),
    storage: { from: () => ({ download }) },
  }),
}));
vi.mock('@/lib/db/queries/household', () => ({ getMyHousehold: (...a: unknown[]) => getMyHousehold(...a) }));
vi.mock('@/lib/recipes/import-url', async (orig) => ({
  ...(await orig<typeof import('@/lib/recipes/import-url')>()),
  fetchPublicBytes: (...a: unknown[]) => fetchPublicBytes(...a),
}));

import * as route from '@/app/api/meals/preview/route';
import { ensurePreviews, resetEnsurePreviews } from '@/lib/photos/ensure-previews';
import { makePreview } from '@/lib/photos/preview';
import { resetPreviewLimit, takePreviewSlot } from '@/lib/photos/preview-limit';

const { POST } = route;

const jpeg = async (w = 800, h = 400) =>
  new Uint8Array(
    await sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer(),
  );
const req = (body: unknown) =>
  new Request('http://x.test/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const row = (over: Record<string, unknown> = {}) => ({
  data: { id: 'm1', photo_path: null, photo_url: 'https://a.test/a.jpg', photo_preview: null, photo_width: null, ...over },
  error: null,
});

describe('makePreview', () => {
  it('reads the source width and makes a tiny webp data URL', async () => {
    const out = await makePreview(await jpeg());
    expect(out.width).toBe(800);
    expect(out.preview).toMatch(/^data:image\/webp;base64,/);
    expect(out.preview.length).toBeLessThan(2000);
  });
  it.each([5, 6, 7, 8])('swaps width and height for EXIF orientation %i', async (o) => {
    const rotated = new Uint8Array(await sharp(await jpeg(800, 400)).withMetadata({ orientation: o }).jpeg().toBuffer());
    expect((await makePreview(rotated)).width).toBe(400);
  });
  it.each([1, 2, 3, 4])('keeps the width for EXIF orientation %i', async (o) => {
    const img = new Uint8Array(await sharp(await jpeg(800, 400)).withMetadata({ orientation: o }).jpeg().toBuffer());
    expect((await makePreview(img)).width).toBe(800);
  });
  it('throws a PreviewError on bytes that are not an image', async () => {
    await expect(makePreview(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({ name: 'PreviewError' });
  });
  it('refuses an SVG', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    await expect(makePreview(svg)).rejects.toMatchObject({ name: 'PreviewError' });
  });
  it('refuses an image over about 50 megapixels without decoding it', async () => {
    const huge = new Uint8Array(await sharp({ create: { width: 8000, height: 7000, channels: 3, background: '#fff' } }).png({ compressionLevel: 9 }).toBuffer());
    await expect(makePreview(huge)).rejects.toMatchObject({ name: 'PreviewError' });
  }, 30_000);
});

describe('takePreviewSlot', () => {
  beforeEach(() => resetPreviewLimit());
  it('allows 60 builds an hour per household, then frees slots as the hour passes', () => {
    const t = 1_000_000;
    for (let i = 0; i < 60; i++) expect(takePreviewSlot('h1', t + i)).toBe(true);
    expect(takePreviewSlot('h1', t + 100)).toBe(false);
    expect(takePreviewSlot('h2', t + 100)).toBe(true);
    expect(takePreviewSlot('h1', t + 3_600_000 + 1)).toBe(true);
  });
});

describe('POST /api/meals/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    resetPreviewLimit();
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    getMyHousehold.mockResolvedValue({ id: 'h1' });
    updateResult.mockResolvedValue({ data: [{ id: 'm1' }], error: null });
  });

  it('is allowed 30 seconds', () => {
    expect(route.maxDuration).toBe(30);
  });

  it('400 on a bad body', async () => {
    expect((await POST(req({}))).status).toBe(400);
  });

  it('404 when the meal has no photo', async () => {
    single.mockResolvedValue({ data: { id: 'm1', photo_path: null, photo_url: null, photo_preview: null, photo_width: null }, error: null });
    expect((await POST(req({ mealId: 'm1' }))).status).toBe(404);
    single.mockResolvedValue({ data: null, error: null });
    expect((await POST(req({ mealId: 'm1' }))).status).toBe(404);
  });

  it('reads the stored preview and width, and 503 when the read itself fails', async () => {
    single.mockResolvedValue(row({ photo_preview: 'data:image/webp;base64,AAAA', photo_width: 800 }));
    await POST(req({ mealId: 'm1' }));
    expect(selectCols.mock.calls[0][0]).toContain('photo_preview');
    expect(selectCols.mock.calls[0][0]).toContain('photo_width');
    single.mockResolvedValue({ data: null, error: { message: 'down' } });
    expect((await POST(req({ mealId: 'm1' }))).status).toBe(503);
  });

  it('returns a stored preview without fetching, building or writing', async () => {
    single.mockResolvedValue(row({ photo_preview: 'data:image/webp;base64,AAAA', photo_width: 800 }));
    const res = await POST(req({ mealId: 'm1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ preview: 'data:image/webp;base64,AAAA', width: 800 });
    expect(fetchPublicBytes).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('422 without fetching when the photo is already marked permanent (width 0)', async () => {
    single.mockResolvedValue(row({ photo_width: 0 }));
    expect((await POST(req({ mealId: 'm1' }))).status).toBe(422);
    expect(fetchPublicBytes).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('reads an uploaded photo from storage, never from the network', async () => {
    single.mockResolvedValue(row({ photo_path: 'h1/m1.jpg', photo_url: null }));
    download.mockResolvedValue({ data: new Blob([await jpeg()]), error: null });
    const res = await POST(req({ mealId: 'm1' }));
    expect(res.status).toBe(200);
    expect(download).toHaveBeenCalledWith('h1/m1.jpg');
    expect(fetchPublicBytes).not.toHaveBeenCalled();
  });

  it.each(['blocked_host', 'bad_url', 'not_image', 'too_large'] as const)('422 and width 0 for %s', async (code) => {
    single.mockResolvedValue(row({ photo_url: 'http://10.0.0.1/a.jpg' }));
    fetchPublicBytes.mockRejectedValue(new ImportError(code));
    const res = await POST(req({ mealId: 'm1' }));
    expect(res.status).toBe(422);
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toEqual({ photo_width: 0 });
  });

  it('422 and width 0 when the bytes cannot be decoded', async () => {
    single.mockResolvedValue(row());
    fetchPublicBytes.mockResolvedValue(new Uint8Array([1, 2, 3]));
    expect((await POST(req({ mealId: 'm1' }))).status).toBe(422);
    expect(updates[0].patch).toEqual({ photo_width: 0 });
  });

  it.each(['timeout', 'fetch_failed'] as const)('503 and nothing stored for a transient %s', async (code) => {
    single.mockResolvedValue(row());
    fetchPublicBytes.mockRejectedValue(new ImportError(code, 'http 503'));
    expect((await POST(req({ mealId: 'm1' }))).status).toBe(503);
    expect(updates).toHaveLength(0);
  });

  it('503 and nothing stored for a storage blip', async () => {
    single.mockResolvedValue(row({ photo_path: 'h1/m1.jpg', photo_url: null }));
    download.mockResolvedValue({ data: null, error: { message: 'storage down' } });
    expect((await POST(req({ mealId: 'm1' }))).status).toBe(503);
    expect(updates).toHaveLength(0);
  });

  it('503 when the write fails, and does not then store width 0', async () => {
    single.mockResolvedValue(row());
    fetchPublicBytes.mockResolvedValue(await jpeg());
    updateResult.mockResolvedValue({ data: null, error: { message: 'db down' } });
    expect((await POST(req({ mealId: 'm1' }))).status).toBe(503);
    expect(updates).toHaveLength(1);
  });

  it('200 and stores the preview and width, only if the photo is still the one it read', async () => {
    single.mockResolvedValue(row());
    fetchPublicBytes.mockResolvedValue(await jpeg());
    const res = await POST(req({ mealId: 'm1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.width).toBe(800);
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toEqual({ photo_preview: body.preview, photo_width: 800 });
    expect(updates[0].filters).toEqual(
      expect.arrayContaining([['eq', 'id', 'm1'], ['is', 'photo_path', null], ['eq', 'photo_url', 'https://a.test/a.jpg']]),
    );
  });

  it('filters an upload on its path, and says so when the photo changed meanwhile (nothing updated)', async () => {
    single.mockResolvedValue(row({ photo_path: 'h1/m1.jpg', photo_url: null }));
    download.mockResolvedValue({ data: new Blob([await jpeg()]), error: null });
    updateResult.mockResolvedValue({ data: [], error: null });
    const res = await POST(req({ mealId: 'm1' }));
    expect(res.status).toBe(409);
    expect(updates[0].filters).toEqual(
      expect.arrayContaining([['eq', 'photo_path', 'h1/m1.jpg'], ['is', 'photo_url', null]]),
    );
  });

  it('429 after 60 builds an hour for a household, without fetching', async () => {
    single.mockResolvedValue(row());
    fetchPublicBytes.mockResolvedValue(await jpeg());
    for (let i = 0; i < 60; i++) expect((await POST(req({ mealId: 'm1' }))).status).toBe(200);
    fetchPublicBytes.mockClear();
    const res = await POST(req({ mealId: 'm1' }));
    expect(res.status).toBe(429);
    expect(fetchPublicBytes).not.toHaveBeenCalled();
  }, 30_000);
});

describe('ensurePreviews', () => {
  const meal = (i: number, over: Record<string, unknown> = {}) => ({
    id: `m${i}`, photo_path: null, photo_url: `https://a.test/${i}.jpg`, photo_preview: null, photo_width: null, ...over,
  });
  beforeEach(() => {
    resetEnsurePreviews();
    vi.unstubAllGlobals();
  });

  it('asks once per meal, at most 3 at a time, and skips width 0 and meals with a preview', async () => {
    let live = 0;
    let peak = 0;
    const fetchMock = vi.fn(async () => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return new Response('{}');
    });
    vi.stubGlobal('fetch', fetchMock);
    const meals = [
      ...Array.from({ length: 7 }, (_, i) => meal(i)),
      meal(8, { photo_width: 0 }),
      meal(9, { photo_preview: 'data:image/webp;base64,AAAA' }),
      meal(10, { photo_url: null }),
    ];
    ensurePreviews(meals);
    await vi.waitFor(() => expect(live === 0 && fetchMock.mock.calls.length === 7).toBe(true));
    expect(peak).toBeLessThanOrEqual(3);
    ensurePreviews(meals);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it('swallows every failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(() => ensurePreviews([meal(1)])).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
  });
});
