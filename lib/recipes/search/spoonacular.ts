import 'server-only';
import type { IngredientLine, Role } from '@/lib/domain/types';
import { fakeSpoonacular } from './fake';
import { SourceLimitError, type RecipeOption } from './provider';

interface SpoonIngredient {
  name?: unknown; amount?: unknown; unit?: unknown; aisle?: unknown; original?: unknown;
}
interface SpoonResult {
  title?: unknown; image?: unknown; sourceUrl?: unknown; spoonacularSourceUrl?: unknown;
  sourceName?: unknown; readyInMinutes?: unknown; servings?: unknown;
  extendedIngredients?: SpoonIngredient[];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const posNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

export function roleFromAisle(aisle: unknown): Role {
  const a = typeof aisle === 'string' ? aisle.toLowerCase() : '';
  if (a.includes('meat')) return 'meat';
  if (a.includes('seafood')) return 'fish';
  if (a.includes('produce')) return 'produce';
  if (a.includes('milk') || a.includes('eggs') || a.includes('dairy') || a.includes('cheese')) return 'dairy';
  if (a.includes('bakery') || a.includes('bread')) return 'bakery';
  if (a.includes('frozen')) return 'frozen';
  return 'pantry';
}

function toLine(i: SpoonIngredient): IngredientLine | null {
  const canonical = str(i.name);
  if (!canonical) return null;
  return {
    canonical: canonical.toLowerCase(),
    amount: typeof i.amount === 'number' && Number.isFinite(i.amount) ? i.amount : 1,
    unit: str(i.unit) ?? 'each',
    role: roleFromAisle(i.aisle),
  };
}

function toOption(r: SpoonResult): RecipeOption | null {
  const title = str(r.title);
  const image = str(r.image);
  if (!title || !image) return null;
  const url = str(r.sourceUrl) ?? str(r.spoonacularSourceUrl);
  if (!url) return null;
  const ings = Array.isArray(r.extendedIngredients) ? r.extendedIngredients : [];
  const lines = ings.map(toLine).filter((l): l is IngredientLine => l !== null);
  return {
    source: 'spoonacular',
    url,
    site: str(r.sourceName) ?? 'Spoonacular',
    title,
    image,
    rating: null,
    ratingCount: null,
    totalMinutes: posNum(r.readyInMinutes),
    servings: posNum(r.servings),
    ingredients: ings.map((i) => str(i.original)).filter((s): s is string => s !== null),
    structured: lines.length > 0 ? lines : null,
  };
}

export async function searchSpoonacular(query: string): Promise<RecipeOption[]> {
  if (process.env.RECIPE_SEARCH_FAKE === '1') return fakeSpoonacular(query);
  const key = process.env.SPOONACULAR_API_KEY;
  if (!key) throw new Error('SPOONACULAR_API_KEY is not set');
  const url = new URL('https://api.spoonacular.com/recipes/complexSearch');
  url.searchParams.set('query', query);
  url.searchParams.set('number', '8');
  url.searchParams.set('addRecipeInformation', 'true');
  url.searchParams.set('fillIngredients', 'true');
  const res = await fetch(url, {
    headers: { 'x-api-key': key, accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
    cache: 'no-store',
  });
  if (res.status === 402) throw new SourceLimitError();
  if (!res.ok) throw new Error(`Spoonacular search failed: HTTP ${res.status}`);
  const body = (await res.json()) as { results?: SpoonResult[] };
  return (body.results ?? []).map(toOption).filter((o): o is RecipeOption => o !== null).slice(0, 8);
}
