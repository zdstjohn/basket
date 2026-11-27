import 'server-only';
import { fetchRecipePage } from '../import-url';
import { extractRecipeJsonLd } from '../jsonld';
import { siteForHost } from '../sites';
import { sortByLoved } from './loved';
import { clampOption } from './clamp';
import { fakeSiteOptions } from './fake';
import { getWebSearch, type RecipeOption, type RecipeSource, type SearchMeter } from './provider';
import { searchSpoonacular } from './spoonacular';

export type { RecipeOption, RecipeSource } from './provider';

const MAX_OPTIONS = 8;
const MAX_FETCHES = 12;
const TOP_UP_BELOW = 4;
const PAGE_TIMEOUT_MS = 5000;

async function toOption(hit: { url: string; title: string }, siteName: string): Promise<RecipeOption | null> {
  const html = await fetchRecipePage(hit.url, { timeoutMs: PAGE_TIMEOUT_MS });
  const recipe = extractRecipeJsonLd(html, hit.url);
  if (!recipe || !recipe.image) return null;
  return clampOption({
    source: 'sites',
    url: hit.url,
    site: siteName,
    title: recipe.name || hit.title,
    image: recipe.image,
    rating: recipe.rating,
    ratingCount: recipe.ratingCount,
    likes: null,
    totalMinutes: recipe.totalMinutes,
    servings: recipe.servings,
    ingredients: recipe.ingredients,
    structured: null,
  });
}

export async function searchSites(query: string, meter?: SearchMeter): Promise<RecipeOption[]> {
  if (process.env.RECIPE_SEARCH_FAKE === '1') return fakeSiteOptions(query).slice(0, MAX_OPTIONS);
  const hits = await (await getWebSearch()).search(`${query} recipe`, 20, meter);
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
    if (candidates.length === MAX_FETCHES) break;
  }
  const settled = await Promise.allSettled(candidates.map((c) => toOption(c.hit, c.site)));
  const options: RecipeOption[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value) options.push(s.value);
  }
  return options.slice(0, MAX_OPTIONS);
}

export interface SearchResult {
  options: RecipeOption[];
  source: RecipeSource;
  /** Sites found nothing, so these are all Spoonacular's. */
  fellBack: boolean;
  /** Sites found a few; Spoonacular's fill the rest. */
  toppedUp: boolean;
}

async function searchUnsorted(query: string, source: RecipeSource = 'sites', meter?: SearchMeter): Promise<SearchResult> {
  if (source === 'spoonacular') {
    return { options: await searchSpoonacular(query, meter), source, fellBack: false, toppedUp: false };
  }
  const options = await searchSites(query, meter);
  if (options.length >= TOP_UP_BELOW || !process.env.SPOONACULAR_API_KEY) {
    return { options, source, fellBack: false, toppedUp: false };
  }
  if (options.length === 0) {
    return { options: await searchSpoonacular(query, meter), source: 'spoonacular', fellBack: true, toppedUp: false };
  }
  try {
    const have = new Set(options.map((o) => o.url));
    const extra = (await searchSpoonacular(query, meter)).filter((o) => !have.has(o.url));
    return { options: [...options, ...extra].slice(0, MAX_OPTIONS), source, fellBack: false, toppedUp: extra.length > 0 };
  } catch {
    return { options, source, fellBack: false, toppedUp: false };
  }
}

/** Searches, then puts the most loved recipes first (both sources, both screens). */
export async function searchRecipes(
  query: string, source: RecipeSource = 'sites', meter?: SearchMeter,
): Promise<SearchResult> {
  const result = await searchUnsorted(query, source, meter);
  return { ...result, options: sortByLoved(result.options) };
}
