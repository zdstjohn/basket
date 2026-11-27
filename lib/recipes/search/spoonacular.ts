import 'server-only';
import type { IngredientLine, Role } from '@/lib/domain/types';
import { bestPhotoUrl } from '@/lib/photos/best-url';
import { httpUrl } from '../url';
import { clampOption } from './clamp';
import { fakeSpoonacular } from './fake';
import { SourceLimitError, type RecipeOption } from './provider';

interface SpoonIngredient {
  name?: unknown; amount?: unknown; unit?: unknown; aisle?: unknown; original?: unknown;
}
interface SpoonResult {
  title?: unknown; image?: unknown; sourceUrl?: unknown; spoonacularSourceUrl?: unknown;
  sourceName?: unknown; aggregateLikes?: unknown; readyInMinutes?: unknown; servings?: unknown;
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
  const amount = typeof i.amount === 'number' && Number.isFinite(i.amount) ? i.amount : 1;
  if (amount <= 0) return null; // "to taste" and the like
  return {
    canonical: canonical.toLowerCase().slice(0, 80),
    amount,
    unit: (str(i.unit) ?? 'each').slice(0, 30),
    role: roleFromAisle(i.aisle),
  };
}

function toOption(r: SpoonResult): RecipeOption | null {
  const title = str(r.title);
  const rawImage = httpUrl(r.image);
  if (!title || !rawImage) return null;
  const image = bestPhotoUrl(rawImage);
  const url = httpUrl(r.sourceUrl) ?? httpUrl(r.spoonacularSourceUrl);
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
    likes: posNum(r.aggregateLikes),
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
  return (body.results ?? [])
    .map(toOption)
    .map((o) => (o ? clampOption(o) : null))
    .filter((o): o is RecipeOption => o !== null)
    .slice(0, 8);
}
