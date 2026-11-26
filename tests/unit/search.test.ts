import { beforeEach, describe, expect, it, vi } from 'vitest';

const search = vi.fn();
const fetchPage = vi.fn();
vi.mock('@/lib/recipes/search/provider', async (orig) => ({
  ...(await orig<typeof import('@/lib/recipes/search/provider')>()),
  getWebSearch: () => ({ search }),
}));
vi.mock('@/lib/recipes/import-url', async (orig) => ({
  ...(await orig<typeof import('@/lib/recipes/import-url')>()),
  fetchRecipePage: (...a: unknown[]) => fetchPage(...a),
}));

import { searchSites } from '@/lib/recipes/search';
import { RECIPE_SITES } from '@/lib/recipes/sites';

const page = (name: string, image: string | null = `https://img.example.test/${name}.jpg`) =>
  `<script type="application/ld+json">${JSON.stringify({
    '@type': 'Recipe',
    name,
    ...(image ? { image } : {}),
    recipeIngredient: ['1 thing'],
  })}</script>`;

describe('RECIPE_SITES', () => {
  it('lists the 16 sites', () => {
    expect(RECIPE_SITES).toHaveLength(16);
    expect(RECIPE_SITES[0]).toEqual({ domain: 'allrecipes.com', name: 'Allrecipes' });
    expect(RECIPE_SITES.find((s) => s.domain === 'bonappetit.com')?.name).toBe('Bon Appétit');
  });
});

describe('searchSites', () => {
  beforeEach(() => {
    search.mockReset();
    fetchPage.mockReset();
    delete process.env.RECIPE_SEARCH_FAKE;
  });

  it('fetches only allowed hosts, maps site names, keeps provider order, caps at 8', async () => {
    const hosts = [
      'www.allrecipes.com', 'blog.random.test', 'm.foodnetwork.com', 'notallrecipes.com',
      'www.seriouseats.com', 'budgetbytes.com', 'www.delish.com', 'www.tasteofhome.com',
      'www.eatingwell.com', 'www.epicurious.com', 'www.thekitchn.com', 'www.food.com',
    ];
    search.mockResolvedValue(hosts.map((h, i) => ({ url: `https://${h}/r${i}`, title: `T${i}` })));
    fetchPage.mockImplementation(async (url: string) => page(`R-${new URL(url).host}`));

    const options = await searchSites('chicken tacos');
    expect(search).toHaveBeenCalledWith('chicken tacos recipe', 20);
    const fetched = fetchPage.mock.calls.map((c) => new URL(c[0] as string).host);
    expect(fetched).not.toContain('blog.random.test');
    expect(fetched).not.toContain('notallrecipes.com');
    expect(fetched.length).toBeLessThanOrEqual(8);
    expect(fetchPage.mock.calls[0][1]).toMatchObject({ timeoutMs: 5000 });
    expect(options).toHaveLength(8);
    expect(options.map((o) => o.site)).toEqual([
      'Allrecipes', 'Food Network', 'Serious Eats', 'Budget Bytes',
      'Delish', 'Taste of Home', 'EatingWell', 'Epicurious',
    ]);
    expect(options[0]).toMatchObject({
      source: 'sites', url: 'https://www.allrecipes.com/r0', title: 'R-www.allrecipes.com',
      image: 'https://img.example.test/R-www.allrecipes.com.jpg', structured: null,
      ingredients: ['1 thing'],
    });
  });

  it('drops pages without a Recipe or image, and skips ones that fail or time out', async () => {
    search.mockResolvedValue([
      { url: 'https://allrecipes.com/a', title: 'a' },
      { url: 'https://foodnetwork.com/b', title: 'b' },
      { url: 'https://delish.com/c', title: 'c' },
      { url: 'https://eatingwell.com/d', title: 'd' },
      { url: 'https://thekitchn.com/e', title: 'e' },
    ]);
    fetchPage.mockImplementation(async (url: string) => {
      const h = new URL(url).host;
      if (h === 'allrecipes.com') return '<html>no recipe</html>';
      if (h === 'foodnetwork.com') return page('NoImg', null);
      if (h === 'delish.com') throw new Error('timeout');
      return page(`ok-${h}`);
    });
    const options = await searchSites('x');
    expect(options.map((o) => o.title)).toEqual(['ok-eatingwell.com', 'ok-thekitchn.com']);
  });

  it('returns [] when no hit is on an allowed site', async () => {
    search.mockResolvedValue([{ url: 'https://random.test/a', title: 'a' }]);
    expect(await searchSites('x')).toEqual([]);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('uses the fixture options when RECIPE_SEARCH_FAKE=1', async () => {
    process.env.RECIPE_SEARCH_FAKE = '1';
    const options = await searchSites('tacos');
    expect(options.some((o) => o.title === 'Chicken tacos' && o.site === 'Allrecipes' &&
      o.image === 'https://images.example.test/tacos.jpg')).toBe(true);
    expect(search).not.toHaveBeenCalled();
  });
});
