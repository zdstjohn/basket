import { beforeEach, describe, expect, it, vi } from 'vitest';
import { familyOfFive } from '@/lib/fixtures/household';
import { tacos } from '@/lib/fixtures/tacos';
import type { RecipeOption } from '@/lib/recipes/search/provider';

const getUser = vi.fn();
const getMyHousehold = vi.fn();
const updateHousehold = vi.fn();
const checkCap = vi.fn();
const recordUsage = vi.fn();
const searchRecipes = vi.fn();
const fetchRecipePage = vi.fn();

vi.mock('@/lib/db/server', () => ({ createServerClient: async () => ({ auth: { getUser } }) }));
vi.mock('@/lib/db/queries/household', () => ({
  getMyHousehold: (...a: unknown[]) => getMyHousehold(...a),
  listPeople: async () => familyOfFive,
  updateHousehold: (...a: unknown[]) => updateHousehold(...a),
}));
vi.mock('@/lib/ai/usage', () => ({
  checkCap: (...a: unknown[]) => checkCap(...a),
  recordUsage: (...a: unknown[]) => recordUsage(...a),
}));
vi.mock('@/lib/recipes/search', () => ({ searchRecipes: (...a: unknown[]) => searchRecipes(...a) }));
vi.mock('@/lib/recipes/import-url', async (orig) => ({
  ...(await orig<typeof import('@/lib/recipes/import-url')>()),
  fetchRecipePage: (...a: unknown[]) => fetchRecipePage(...a),
}));
vi.mock('@/lib/ai/provider', async (orig) => {
  const m = await orig<typeof import('@/lib/ai/provider')>();
  return { ...m, generateStructured: vi.fn(m.generateStructured) };
});

import { POST as draftPost } from '@/app/api/meals/draft/route';
import { POST as searchPost } from '@/app/api/recipes/search/route';
import { generateStructured } from '@/lib/ai/provider';
import { draftFromOption, draftFromText } from '@/lib/ai/recipes';
import { ImportError } from '@/lib/recipes/import-url';
import { SourceLimitError } from '@/lib/recipes/search/provider';

const option: RecipeOption = {
  source: 'sites', url: 'https://www.allrecipes.com/tacos', site: 'Allrecipes', title: 'Chicken tacos',
  image: 'https://images.example.test/tacos.jpg', rating: 4.5, ratingCount: 10, totalMinutes: 30,
  servings: 4, ingredients: ['1 lb chicken thighs', '12 corn tortillas', '1 yellow onion'], structured: null,
};

const req = (body: unknown) =>
  new Request('http://x.test/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AI_FAKE = '1';
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  getMyHousehold.mockResolvedValue({ id: 'h1', recipe_source: 'sites' });
  checkCap.mockResolvedValue({ ok: true, spentCents: 0, capCents: 300 });
  searchRecipes.mockResolvedValue({ options: [], source: 'sites', fellBack: false });
});

describe('POST /api/meals/draft', () => {
  it('401 when signed out', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await draftPost(req({ mode: 'text', value: 'x' }))).status).toBe(401);
  });

  it('402 at the cap without calling the model or the provider', async () => {
    checkCap.mockResolvedValue({ ok: false, spentCents: 300, capCents: 300 });
    const res = await draftPost(req({ mode: 'option', option }));
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: 'cap_reached' });
    expect(generateStructured).not.toHaveBeenCalled();
    expect(searchRecipes).not.toHaveBeenCalled();
    expect(fetchRecipePage).not.toHaveBeenCalled();
  });

  it('200 with a draft for a chosen option, and records parse usage', async () => {
    const res = await draftPost(req({ mode: 'option', option }));
    expect(res.status).toBe(200);
    const draft = await res.json();
    expect(draft.name).toBe('Chicken tacos');
    expect(draft.photo).toEqual({ url: option.image, credit: 'Allrecipes', creditUrl: option.url });
    expect(draft.vegSwap).not.toBeNull();
    expect(recordUsage).toHaveBeenCalledWith(expect.anything(), 'h1', 'parse', expect.any(String), expect.objectContaining({ inputTokens: expect.any(Number) }));
  });

  it('422 unreadable when the model returns schema-invalid output', async () => {
    const res = await draftPost(req({ mode: 'text', value: 'a broken recipe' }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'unreadable' });
    // The model call cost money even though its answer was unusable.
    expect(recordUsage).toHaveBeenCalledWith(expect.anything(), 'h1', 'parse', expect.any(String), { inputTokens: 100, outputTokens: 50 });
  });

  it('400 when a posted option carries a non-http link or image', async () => {
    expect((await draftPost(req({ mode: 'option', option: { ...option, url: 'javascript:alert(1)' } }))).status).toBe(400);
    expect((await draftPost(req({ mode: 'option', option: { ...option, image: 'data:image/png;base64,AA' } }))).status).toBe(400);
  });

  it('422 with the import error code', async () => {
    fetchRecipePage.mockRejectedValue(new ImportError('blocked_host', 'no'));
    const res = await draftPost(req({ mode: 'text', value: 'http://127.0.0.1/x' }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'blocked_host' });
  });

  it('400 on a malformed body', async () => {
    expect((await draftPost(req({ mode: 'nope' }))).status).toBe(400);
  });
});

describe('draftFromOption / draftFromText', () => {
  it('copies the option image, site and url into photo and sourceUrl', async () => {
    const d = await draftFromOption(option, familyOfFive);
    expect(d.photo).toEqual({ url: option.image, credit: option.site, creditUrl: option.url });
    expect(d.sourceUrl).toBe(option.url);
    expect(d.ingredients).toEqual(tacos.ingredients);
    expect(d.baseServings).toBe(4);
  });

  it('omits vegSwap when nobody avoids meat', async () => {
    const d = await draftFromOption(option, familyOfFive.map((p) => ({ ...p, diet: 'none' as const })));
    expect(d.vegSwap).toBeNull();
  });

  it('fills a missing photo from the first search option', async () => {
    searchRecipes.mockResolvedValue({
      options: [{ ...option, image: 'https://images.example.test/found.jpg', site: 'Delish', url: 'https://delish.com/t' }],
      source: 'sites', fellBack: false,
    });
    const d = await draftFromText('Chicken tacos\n1 lb chicken thighs\n12 corn tortillas', familyOfFive);
    expect(searchRecipes).toHaveBeenCalledWith('Chicken tacos', expect.anything());
    expect(d.photo).toEqual({ url: 'https://images.example.test/found.jpg', credit: 'Delish', creditUrl: 'https://delish.com/t' });
  });

  it('photo is null when the search finds nothing, or fails', async () => {
    expect((await draftFromText('Chicken tacos\n1 lb chicken', familyOfFive)).photo).toBeNull();
    searchRecipes.mockRejectedValue(new SourceLimitError());
    expect((await draftFromText('Chicken tacos\n1 lb chicken', familyOfFive)).photo).toBeNull();
  });
});

describe('POST /api/recipes/search', () => {
  it('401 when signed out; 402 at the cap without searching', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await searchPost(req({ query: 'tacos', source: 'sites' }))).status).toBe(401);
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    checkCap.mockResolvedValue({ ok: false, spentCents: 300, capCents: 300 });
    const res = await searchPost(req({ query: 'tacos', source: 'sites' }));
    expect(res.status).toBe(402);
    expect(searchRecipes).not.toHaveBeenCalled();
  });

  it('200 with options; records a search for sites; saves a changed source only', async () => {
    searchRecipes.mockResolvedValue({ options: [option], source: 'sites', fellBack: false });
    const res = await searchPost(req({ query: 'tacos', source: 'sites' }));
    expect(res.status).toBe(200);
    expect((await res.json()).options).toHaveLength(1);
    expect(recordUsage).toHaveBeenCalledWith(expect.anything(), 'h1', 'search', expect.any(String), { inputTokens: 0, outputTokens: 0 });
    expect(updateHousehold).not.toHaveBeenCalled();

    searchRecipes.mockResolvedValue({ options: [option], source: 'spoonacular', fellBack: false });
    recordUsage.mockClear();
    await searchPost(req({ query: 'tacos', source: 'spoonacular' }));
    expect(recordUsage).not.toHaveBeenCalled();
    expect(updateHousehold).toHaveBeenCalledWith(expect.anything(), 'h1', { recipe_source: 'spoonacular' });
  });

  it('429 source_limit when Spoonacular is out of points', async () => {
    searchRecipes.mockRejectedValue(new SourceLimitError());
    const res = await searchPost(req({ query: 'tacos', source: 'spoonacular' }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'source_limit' });
  });

  it('400 on a bad body', async () => {
    expect((await searchPost(req({ query: '', source: 'sites' }))).status).toBe(400);
    expect((await searchPost(req({ query: 'x', source: 'bing' }))).status).toBe(400);
  });
});

describe('vegetarian swap failure', () => {
  const structuredOption: RecipeOption = {
    ...option,
    structured: [
      { canonical: 'chicken thighs', amount: 1, unit: 'lb', role: 'meat' },
      { canonical: 'corn tortillas', amount: 12, unit: 'each', role: 'bakery' },
    ],
  };

  it('still returns the draft, with no swap, when the swap call fails', async () => {
    vi.mocked(generateStructured).mockRejectedValueOnce(new Error('gateway out of credits'));
    const draft = await draftFromOption(structuredOption, familyOfFive);
    expect(draft.name).toBe('Chicken tacos');
    expect(draft.ingredients).toHaveLength(2);
    expect(draft.vegSwap).toBeNull();
  });
});
