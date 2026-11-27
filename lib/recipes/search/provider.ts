import type { IngredientLine } from '@/lib/domain/types';

export type RecipeSource = 'sites' | 'spoonacular';

export interface SearchHit {
  url: string;
  title: string;
}

/** Counts the paid Brave requests a search sent. Routes bill it in `finally`, so a failure after Brave answered still costs. */
export interface SearchMeter {
  braveCalls: number;
}

export interface WebSearchProvider {
  /** `meter`, when given, counts each request sent (also one that then failed: it was still billed). */
  search(query: string, count: number, meter?: SearchMeter): Promise<SearchHit[]>;
}

export interface RecipeOption {
  source: RecipeSource;
  url: string;
  site: string;
  title: string;
  image: string;
  rating: number | null;
  ratingCount: number | null;
  /** Spoonacular's aggregateLikes; null for the big sites. */
  likes: number | null;
  totalMinutes: number | null;
  servings: number | null;
  ingredients: string[];
  structured: IngredientLine[] | null;
}

/** Spoonacular's daily points are used up (HTTP 402). */
export class SourceLimitError extends Error {
  constructor() {
    super('source_limit');
    this.name = 'SourceLimitError';
  }
}

/** The web search provider: the fixture one under RECIPE_SEARCH_FAKE=1, otherwise Brave. */
export async function getWebSearch(): Promise<WebSearchProvider> {
  if (process.env.RECIPE_SEARCH_FAKE === '1') {
    const { fakeWebSearch } = await import('./fake');
    return fakeWebSearch;
  }
  const { braveSearch } = await import('./brave');
  return braveSearch;
}
