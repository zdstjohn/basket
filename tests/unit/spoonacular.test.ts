import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sitesSearch = vi.fn();
const fetchPageMock = vi.fn();
vi.mock('@/lib/recipes/import-url', async (orig) => ({
  ...(await orig<typeof import('@/lib/recipes/import-url')>()),
  fetchRecipePage: (...a: unknown[]) => fetchPageMock(...a),
}));
vi.mock('@/lib/recipes/search/provider', async (orig) => ({
  ...(await orig<typeof import('@/lib/recipes/search/provider')>()),
  getWebSearch: () => ({ search: sitesSearch }),
}));

import { RecipeOptionSchema } from '@/lib/ai/schemas';
import { searchSpoonacular } from '@/lib/recipes/search/spoonacular';
import { searchRecipes } from '@/lib/recipes/search';
import { SourceLimitError } from '@/lib/recipes/search/provider';
import { draftFromOption } from '@/lib/ai/recipes';
import { familyOfFive } from '@/lib/fixtures/household';
import type { Person } from '@/lib/domain/types';

const fixture = readFileSync(new URL('../fixtures/spoonacular/complex-search.json', import.meta.url), 'utf8');
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  sitesSearch.mockReset();
  fetchPageMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  delete process.env.RECIPE_SEARCH_FAKE;
  process.env.SPOONACULAR_API_KEY = 'test-key';
  process.env.AI_FAKE = '1';
});

describe('searchSpoonacular clamping', () => {
  it('skips zero-amount lines, drops non-http images and keeps results schema-valid', async () => {
    const body = { results: [
      { title: 'T'.repeat(300), image: 'https://i.example.test/a.jpg', sourceUrl: 'https://x.example.test/r', readyInMinutes: 5, servings: 2,
        extendedIngredients: [
          { name: 'salt', amount: 0, unit: '', aisle: 'Spices', original: 'salt to taste' },
          { name: 'rice', amount: 1, unit: 'cup', aisle: 'Pasta and Rice', original: '1 cup rice' }] },
      { title: 'Bad', image: 'javascript:alert(1)', sourceUrl: 'https://x.example.test/b', extendedIngredients: [] },
      { title: 'Bad link', image: 'https://i.example.test/b.jpg', sourceUrl: 'javascript:alert(1)', extendedIngredients: [] },
    ] };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
    const options = await searchSpoonacular('x');
    expect(options).toHaveLength(1);
    expect(options[0].title).toHaveLength(120);
    expect(options[0].structured?.map((l) => l.canonical)).toEqual(['rice']);
    expect(RecipeOptionSchema.safeParse(options[0]).success).toBe(true);
  });
});

describe('searchSpoonacular', () => {
  it('maps results, roles from aisles, and drops results without an image', async () => {
    fetchMock.mockResolvedValueOnce(new Response(fixture, { status: 200 }));
    const options = await searchSpoonacular('chicken tacos');

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe('https://api.spoonacular.com/recipes/complexSearch');
    expect(url.searchParams.get('query')).toBe('chicken tacos');
    expect(url.searchParams.get('number')).toBe('8');
    expect(url.searchParams.get('addRecipeInformation')).toBe('true');
    expect(url.searchParams.get('fillIngredients')).toBe('true');

    expect(options.map((o) => o.title)).toEqual(['Sheet Pan Chicken Tacos', 'Spoon-only Tacos']);
    expect(options[0]).toMatchObject({
      source: 'spoonacular', site: 'Example Kitchen', url: 'https://www.example-kitchen.test/sheet-pan-tacos',
      image: 'https://img.example.test/sp1.jpg', totalMinutes: 35, servings: 4,
      rating: null, ratingCount: null, likes: 2340,
      ingredients: ['1.5 pounds chicken thighs', '2 bell peppers', '2 tablespoons chili powder'],
    });
    expect(options[0].structured?.map((l) => l.role)).toEqual(['meat', 'produce', 'pantry']);
    expect(options[0].structured?.[0]).toMatchObject({ canonical: 'chicken thighs', amount: 1.5, unit: 'pounds' });
    expect(options[1].likes).toBeNull();
    expect(options[1]).toMatchObject({ site: 'Spoonacular', url: 'https://spoonacular.com/spoon-only-3' });
    expect(options[1].structured?.[0].role).toBe('dairy');
  });

  it('sends the key in a header or query but never throws it into errors', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    await expect(searchSpoonacular('x')).rejects.toThrow(/spoonacular/i);
  });

  it('turns HTTP 402 into SourceLimitError', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 402 }));
    await expect(searchSpoonacular('x')).rejects.toBeInstanceOf(SourceLimitError);
  });
});

describe('searchRecipes', () => {
  it('falls back to Spoonacular when sites find nothing and the key is set', async () => {
    sitesSearch.mockResolvedValue([]);
    fetchMock.mockResolvedValueOnce(new Response(fixture, { status: 200 }));
    const r = await searchRecipes('x', 'sites');
    expect(r.source).toBe('spoonacular');
    expect(r.fellBack).toBe(true);
    expect(r.options).toHaveLength(2);
  });

  it('returns nothing, without falling back, when the key is unset', async () => {
    delete process.env.SPOONACULAR_API_KEY;
    sitesSearch.mockResolvedValue([]);
    const r = await searchRecipes('x', 'sites');
    expect(r).toEqual({ options: [], source: 'sites', fellBack: false, toppedUp: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tops up a thin sites result (fewer than 4) from Spoonacular, without duplicates', async () => {
    sitesSearch.mockResolvedValue([{ url: 'https://www.allrecipes.com/a', title: 'a' }]);
    fetchPageMock.mockResolvedValue(
      '<script type="application/ld+json">{"@type":"Recipe","name":"Site Tacos","image":"https://i.example.test/a.jpg","recipeIngredient":["1 x"]}</script>',
    );
    fetchMock.mockResolvedValueOnce(new Response(fixture, { status: 200 }));
    const r = await searchRecipes('x', 'sites');
    expect(r).toMatchObject({ source: 'sites', fellBack: false, toppedUp: true });
    // The liked Spoonacular result now ranks first; the unrated ones keep their merge order.
    expect(r.options.map((o) => o.source)).toEqual(['spoonacular', 'sites', 'spoonacular']);
  });

  it('keeps the sites options when the top-up fails', async () => {
    sitesSearch.mockResolvedValue([{ url: 'https://www.allrecipes.com/a', title: 'a' }]);
    fetchPageMock.mockResolvedValue(
      '<script type="application/ld+json">{"@type":"Recipe","name":"Site Tacos","image":"https://i.example.test/a.jpg","recipeIngredient":["1 x"]}</script>',
    );
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 402 }));
    const r = await searchRecipes('x', 'sites');
    expect(r.options).toHaveLength(1);
    expect(r.toppedUp).toBe(false);
  });

  it('runs Spoonacular directly when chosen', async () => {
    fetchMock.mockResolvedValueOnce(new Response(fixture, { status: 200 }));
    const r = await searchRecipes('x', 'spoonacular');
    expect(r).toMatchObject({ source: 'spoonacular', fellBack: false });
    expect(sitesSearch).not.toHaveBeenCalled();
  });
});

describe('draftFromOption on a Spoonacular option', () => {
  it('uses structured lines with no model call when nobody is vegetarian', async () => {
    fetchMock.mockResolvedValueOnce(new Response(fixture, { status: 200 }));
    const [option] = await searchSpoonacular('x');
    const everyoneEats: Person[] = familyOfFive.map((p) => ({ ...p, diet: 'none' }));
    const onUsage = vi.fn();
    const draft = await draftFromOption(option, everyoneEats, { onUsage });
    expect(onUsage).not.toHaveBeenCalled();
    expect(draft.ingredients).toEqual(option.structured);
    expect(draft.vegSwap).toBeNull();
    expect(draft.photo).toEqual({ url: option.image, credit: 'Example Kitchen', creditUrl: option.url });
    expect(draft.sourceUrl).toBe(option.url);
  });
});
