import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportError } from '@/lib/recipes/import-url';

const getUser = vi.fn();
const getMyHousehold = vi.fn();
const updateMeal = vi.fn();
const fetchPublicBytes = vi.fn();
const download = vi.fn();
const single = vi.fn();

vi.mock('@/lib/db/server', () => ({
  createServerClient: async () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: single }) }) }),
    storage: { from: () => ({ download }) },
  }),
}));
vi.mock('@/lib/db/queries/household', () => ({ getMyHousehold: (...a: unknown[]) => getMyHousehold(...a) }));
vi.mock('@/lib/db/queries/meals', async (orig) => ({
  ...(await orig<typeof import('@/lib/db/queries/meals')>()),
  updateMeal: (...a: unknown[]) => updateMeal(...a),
}));
vi.mock('@/lib/recipes/import-url', async (orig) => ({
  ...(await orig<typeof import('@/lib/recipes/import-url')>()),
  fetchPublicBytes: (...a: unknown[]) => fetchPublicBytes(...a),
}));

import { POST } from '@/app/api/meals/preview/route';
import { ensurePreviews, resetEnsurePreviews } from '@/lib/photos/ensure-previews';
import { makePreview } from '@/lib/photos/preview';

const jpeg = async (w = 800, h = 400) =>
  new Uint8Array(
    await sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer(),
  );
const req = (body: unknown) =>
  new Request('http://x.test/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('makePreview', () => {
  it('reads the source width and makes a tiny webp data URL', async () => {
    const out = await makePreview(await jpeg());
    expect(out.width).toBe(800);
    expect(out.preview).toMatch(/^data:image\/webp;base64,/);
    expect(out.preview.length).toBeLessThan(2000);
  });
  it('reports the rotated width', async () => {
    const rotated = new Uint8Array(await sharp(await jpeg(800, 400)).withMetadata({ orientation: 6 }).jpeg().toBuffer());
    expect((await makePreview(rotated)).width).toBe(400);
  });
  it('throws on bytes that are not an image', async () => {
    await expect(makePreview(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});

describe('POST /api/meals/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    getMyHousehold.mockResolvedValue({ id: 'h1' });
    updateMeal.mockResolvedValue({});
  });

  it('400 on a bad body', async () => {
    expect((await POST(req({}))).status).toBe(400);
  });

  it('404 when the meal has no photo', async () => {
    single.mockResolvedValue({ data: { id: 'm1', photo_path: null, photo_url: null }, error: null });
    expect((await POST(req({ mealId: 'm1' }))).status).toBe(404);
    single.mockResolvedValue({ data: null, error: null });
    expect((await POST(req({ mealId: 'm1' }))).status).toBe(404);
  });

  it('reads an uploaded photo from storage, never from the network', async () => {
    single.mockResolvedValue({ data: { id: 'm1', photo_path: 'h1/m1.jpg', photo_url: null }, error: null });
    download.mockResolvedValue({ data: new Blob([await jpeg()]), error: null });
    const res = await POST(req({ mealId: 'm1' }));
    expect(res.status).toBe(200);
    expect(download).toHaveBeenCalledWith('h1/m1.jpg');
    expect(fetchPublicBytes).not.toHaveBeenCalled();
  });

  it('422 and stores width 0 when the guarded fetch refuses', async () => {
    single.mockResolvedValue({ data: { id: 'm1', photo_path: null, photo_url: 'http://10.0.0.1/a.jpg' }, error: null });
    fetchPublicBytes.mockRejectedValue(new ImportError('blocked_host'));
    const res = await POST(req({ mealId: 'm1' }));
    expect(res.status).toBe(422);
    expect(updateMeal).toHaveBeenCalledTimes(1);
    expect(updateMeal.mock.calls[0][2]).toEqual({ photo_width: 0 });
  });

  it('422 and width 0 when the bytes cannot be decoded', async () => {
    single.mockResolvedValue({ data: { id: 'm1', photo_path: null, photo_url: 'https://a.test/a.jpg' }, error: null });
    fetchPublicBytes.mockResolvedValue(new Uint8Array([1, 2, 3]));
    expect((await POST(req({ mealId: 'm1' }))).status).toBe(422);
    expect(updateMeal.mock.calls[0][2]).toEqual({ photo_width: 0 });
  });

  it('200 and stores the preview and width', async () => {
    single.mockResolvedValue({ data: { id: 'm1', photo_path: null, photo_url: 'https://a.test/a.jpg' }, error: null });
    fetchPublicBytes.mockResolvedValue(await jpeg());
    const res = await POST(req({ mealId: 'm1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.width).toBe(800);
    expect(updateMeal).toHaveBeenCalledTimes(1);
    expect(updateMeal.mock.calls[0][2]).toEqual({ photo_preview: body.preview, photo_width: 800 });
  });
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
