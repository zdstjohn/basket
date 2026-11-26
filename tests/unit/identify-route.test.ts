import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const getMyHousehold = vi.fn();
const updateHousehold = vi.fn();
const checkCap = vi.fn();
const recordUsage = vi.fn();
const searchRecipes = vi.fn();

vi.mock('@/lib/db/server', () => ({ createServerClient: async () => ({ auth: { getUser } }) }));
vi.mock('@/lib/db/queries/household', () => ({
  getMyHousehold: (...a: unknown[]) => getMyHousehold(...a),
  updateHousehold: (...a: unknown[]) => updateHousehold(...a),
}));
vi.mock('@/lib/ai/usage', () => ({
  checkCap: (...a: unknown[]) => checkCap(...a),
  recordUsage: (...a: unknown[]) => recordUsage(...a),
}));
vi.mock('@/lib/recipes/search', () => ({ searchRecipes: (...a: unknown[]) => searchRecipes(...a) }));
vi.mock('@/lib/ai/identify', async (orig) => {
  const m = await orig<typeof import('@/lib/ai/identify')>();
  return { ...m, identifyDish: vi.fn(m.identifyDish) };
});

import { POST } from '@/app/api/recipes/identify/route';
import { identifyDish } from '@/lib/ai/identify';
import { SourceLimitError } from '@/lib/recipes/search/provider';

const food = readFileSync('e2e/fixtures/food.jpg').toString('base64');
const bytes = (head: number[], extra = '') => Buffer.concat([Buffer.from(head), Buffer.from(extra)]).toString('base64');
const JPEG = [0xff, 0xd8, 0xff];

const req = (body: unknown) =>
  new Request('http://x.test/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

const option = {
  source: 'sites', url: 'https://www.allrecipes.com/tacos', site: 'Allrecipes', title: 'Chicken tacos',
  image: 'https://images.example.test/tacos.jpg', rating: null, ratingCount: null, totalMinutes: 30,
  servings: 4, ingredients: [], structured: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AI_FAKE = '1';
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  getMyHousehold.mockResolvedValue({ id: 'h1', recipe_source: 'sites' });
  checkCap.mockResolvedValue({ ok: true, spentCents: 0, capCents: 300 });
  searchRecipes.mockResolvedValue({ options: [option], source: 'sites', fellBack: false, toppedUp: false });
});

describe('POST /api/recipes/identify', () => {
  it('401 signed out', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(req({ image: food, source: 'sites' }))).status).toBe(401);
  });

  it('402 at the cap without a model call or a search', async () => {
    checkCap.mockResolvedValue({ ok: false, spentCents: 300, capCents: 300 });
    const res = await POST(req({ image: food, source: 'sites' }));
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: 'cap_reached' });
    expect(identifyDish).not.toHaveBeenCalled();
    expect(searchRecipes).not.toHaveBeenCalled();
  });

  it('413 for an image over 1.5 MB decoded, before any model call', async () => {
    const big = bytes(JPEG, 'a'.repeat(1_572_864));
    const res = await POST(req({ image: big, source: 'sites' }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'too_large' });
    expect(identifyDish).not.toHaveBeenCalled();
  });

  it('accepts an image of exactly 1.5 MB', async () => {
    const edge = bytes(JPEG, 'a'.repeat(1_572_864 - 3));
    expect((await POST(req({ image: edge, source: 'sites' }))).status).not.toBe(413);
  });

  it('415 for a GIF or for bytes that are not an image', async () => {
    for (const image of [bytes([0x47, 0x49, 0x46, 0x38], '9a'), Buffer.from('hello there').toString('base64')]) {
      const res = await POST(req({ image, source: 'sites' }));
      expect(res.status).toBe(415);
      expect(await res.json()).toEqual({ error: 'bad_type' });
    }
    expect(identifyDish).not.toHaveBeenCalled();
  });

  it('400 for a bad body', async () => {
    expect((await POST(req({ image: food, source: 'bing' }))).status).toBe(400);
    expect((await POST(req({ source: 'sites' }))).status).toBe(400);
  });

  it('reads PNG and WebP too', async () => {
    const png = bytes([0x89, 0x50, 0x4e, 0x47], 'xxxx');
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]).toString('base64');
    for (const image of [png, webp]) expect((await POST(req({ image, source: 'sites' }))).status).toBe(200);
    expect(identifyDish).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'image/png' }), expect.anything());
    expect(identifyDish).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'image/webp' }), expect.anything());
  });

  it('food: searches with the guess query and the given source, and records usage', async () => {
    const res = await POST(req({ image: food, source: 'sites' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.guess).toMatchObject({ isFood: true, dish: 'Chicken tacos' });
    expect(json.options).toHaveLength(1);
    expect(json).toMatchObject({ source: 'sites', fellBack: false, toppedUp: false });
    expect(searchRecipes).toHaveBeenCalledWith('chicken tacos', 'sites');
    expect(recordUsage).toHaveBeenCalledWith(expect.anything(), 'h1', 'identify', 'fake', expect.objectContaining({ inputTokens: expect.any(Number) }));
    expect(recordUsage).toHaveBeenCalledWith(expect.anything(), 'h1', 'search', 'brave', { inputTokens: 0, outputTokens: 0 });
  });

  it('does not record a Brave search for Spoonacular, and passes the source on', async () => {
    searchRecipes.mockResolvedValue({ options: [], source: 'spoonacular', fellBack: false, toppedUp: false });
    await POST(req({ image: food, source: 'spoonacular' }));
    expect(searchRecipes).toHaveBeenCalledWith('chicken tacos', 'spoonacular');
    expect(recordUsage).not.toHaveBeenCalledWith(expect.anything(), 'h1', 'search', expect.anything(), expect.anything());
  });

  it('not food: 200 with a guess, no options and no search', async () => {
    const res = await POST(req({ image: bytes(JPEG), source: 'sites' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.guess.isFood).toBe(false);
    expect(json.options).toEqual([]);
    expect(searchRecipes).not.toHaveBeenCalled();
    expect(recordUsage).toHaveBeenCalledWith(expect.anything(), 'h1', 'identify', 'fake', expect.anything());
  });

  it('422 unreadable when the model answer does not fit, still recording the call', async () => {
    const res = await POST(req({ image: bytes(JPEG, 'broken'), source: 'sites' }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'unreadable' });
    expect(recordUsage).toHaveBeenCalledWith(expect.anything(), 'h1', 'identify', 'fake', { inputTokens: 100, outputTokens: 50 });
  });

  it('429 source_limit when Spoonacular is out of points; the vision call is still recorded', async () => {
    searchRecipes.mockRejectedValue(new SourceLimitError());
    const res = await POST(req({ image: food, source: 'spoonacular' }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'source_limit' });
    expect(recordUsage).toHaveBeenCalledWith(expect.anything(), 'h1', 'identify', 'fake', expect.anything());
  });

  it('retries a search that finds nothing with the first three words, and records both Brave calls', async () => {
    const { identifyDish: id } = await import('@/lib/ai/identify');
    vi.mocked(id).mockResolvedValueOnce({
      isFood: true, dish: 'Teriyaki salmon bowl', searchQuery: 'teriyaki salmon brown rice spinach bowl',
      keyIngredients: [], confidence: 'high',
    });
    searchRecipes
      .mockResolvedValueOnce({ options: [], source: 'sites', fellBack: false, toppedUp: false })
      .mockResolvedValueOnce({ options: [option], source: 'sites', fellBack: false, toppedUp: false });
    const res = await POST(req({ image: food, source: 'sites' }));
    expect((await res.json()).options).toHaveLength(1);
    expect(searchRecipes).toHaveBeenNthCalledWith(1, 'teriyaki salmon brown rice spinach bowl', 'sites');
    expect(searchRecipes).toHaveBeenNthCalledWith(2, 'teriyaki salmon brown', 'sites');
    expect(recordUsage.mock.calls.filter((c) => c[2] === 'search')).toHaveLength(2);
  });

  it('does not retry when the query is already three words or fewer, or when results exist', async () => {
    searchRecipes.mockResolvedValue({ options: [], source: 'sites', fellBack: false, toppedUp: false });
    await POST(req({ image: food, source: 'sites' })); // "chicken tacos"
    expect(searchRecipes).toHaveBeenCalledTimes(1);
  });

  it('never logs the image', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    searchRecipes.mockRejectedValue(new Error('boom'));
    const res = await POST(req({ image: food, source: 'sites' }));
    expect(res.status).toBe(502);
    expect(JSON.stringify(spy.mock.calls)).not.toContain(food.slice(0, 40));
    spy.mockRestore();
  });
});
