import type { IngredientLine } from '@/lib/domain/types';

export type RecipeSource = 'sites' | 'spoonacular';

export interface SearchHit {
  url: string;
  title: string;
}

export interface WebSearchProvider {
  search(query: string, count: number): Promise<SearchHit[]>;
}

export interface RecipeOption {
  source: RecipeSource;
  url: string;
  site: string;
  title: string;
  image: string;
  rating: number | null;
  ratingCount: number | null;
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
