import 'server-only';
import { fetchRecipePage } from '../import-url';
import { extractRecipeJsonLd } from '../jsonld';
import { siteForHost } from '../sites';
import { fakeSiteOptions } from './fake';
import { getWebSearch, type RecipeOption, type RecipeSource } from './provider';
import { searchSpoonacular } from './spoonacular';

export type { RecipeOption, RecipeSource } from './provider';

const MAX_OPTIONS = 8;
const PAGE_TIMEOUT_MS = 5000;

async function toOption(hit: { url: string; title: string }, siteName: string): Promise<RecipeOption | null> {
  const html = await fetchRecipePage(hit.url, { timeoutMs: PAGE_TIMEOUT_MS });
  const recipe = extractRecipeJsonLd(html);
  if (!recipe || !recipe.image) return null;
  return {
    source: 'sites',
    url: hit.url,
    site: siteName,
    title: recipe.name || hit.title,
    image: recipe.image,
    rating: recipe.rating,
    ratingCount: recipe.ratingCount,
    totalMinutes: recipe.totalMinutes,
    servings: recipe.servings,
    ingredients: recipe.ingredients,
    structured: null,
  };
}

export async function searchSites(query: string): Promise<RecipeOption[]> {
  if (process.env.RECIPE_SEARCH_FAKE === '1') return fakeSiteOptions(query).slice(0, MAX_OPTIONS);
  const hits = await (await getWebSearch()).search(`${query} recipe`, 20);
  const candidates: { hit: { url: string; title: string }; site: string }[] = [];
  for (const hit of hits) {
    let host: string;
    try {
      const u = new URL(hit.url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') continue;
      host = u.hostname;
    } catch {
      continue;
    }
    const site = siteForHost(host);
    if (site) candidates.push({ hit, site: site.name });
    if (candidates.length === MAX_OPTIONS) break;
  }
  const settled = await Promise.allSettled(candidates.map((c) => toOption(c.hit, c.site)));
  const options: RecipeOption[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value) options.push(s.value);
  }
  return options;
}

export async function searchRecipes(
  query: string,
  source: RecipeSource = 'sites',
): Promise<{ options: RecipeOption[]; source: RecipeSource; fellBack: boolean }> {
  if (source === 'spoonacular') {
    return { options: await searchSpoonacular(query), source, fellBack: false };
  }
  const options = await searchSites(query);
  if (options.length === 0 && process.env.SPOONACULAR_API_KEY) {
    return { options: await searchSpoonacular(query), source: 'spoonacular', fellBack: true };
  }
  return { options, source, fellBack: false };
}
