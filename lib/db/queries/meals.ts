import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import type { MealRow } from '@/lib/db/rows';
import type { RecipeDraft } from '@/lib/ai/schemas';
import type { IngredientLine, Meal, VegSwap } from '@/lib/domain/types';

type Sb = SupabaseClient<Database>;

export type MealPhoto = { path: string } | { url: string; credit: string; creditUrl: string };
export type FavoriteFilter = 'vegetarian' | 'under15' | 'most';

/** "Under $15" keeps meals that cost this much or less for the household. */
export const UNDER_15_CENTS = 1500;

const SIGNED_URL_SECONDS = 3600;

/** A database row as the pure meal the scaling and note code works on. */
export function toMeal(row: MealRow): Meal {
  return {
    id: row.id,
    name: row.name,
    baseServings: Number(row.base_servings),
    ingredients: row.ingredients as unknown as IngredientLine[],
    vegSwap: (row.veg_swap as unknown as VegSwap | null) ?? null,
    everyoneVegetarian: row.everyone_vegetarian,
    isFavorite: row.is_favorite,
  };
}

export async function saveMeal(
  sb: Sb,
  householdId: string,
  draft: RecipeDraft & { isFavorite: boolean; everyoneVegetarian?: boolean },
): Promise<MealRow> {
  const { data, error } = await sb
    .from('meals')
    .insert({
      household_id: householdId,
      name: draft.name,
      base_servings: draft.baseServings,
      ingredients: draft.ingredients as unknown as Database['public']['Tables']['meals']['Insert']['ingredients'],
      veg_swap: draft.vegSwap as unknown as Database['public']['Tables']['meals']['Insert']['veg_swap'],
      everyone_vegetarian: draft.everyoneVegetarian ?? false,
      is_favorite: draft.isFavorite,
      source_url: draft.sourceUrl,
      photo_url: draft.photo?.url ?? null,
      photo_credit: draft.photo?.credit ?? null,
      photo_credit_url: draft.photo?.creditUrl ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateMeal(
  sb: Sb,
  id: string,
  patch: Database['public']['Tables']['meals']['Update'],
): Promise<MealRow> {
  const { data, error } = await sb.from('meals').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

/** Either an uploaded photo (a storage path) or a picture from a recipe page, which keeps its credit. */
export async function setMealPhoto(sb: Sb, mealId: string, photo: MealPhoto): Promise<MealRow> {
  const patch =
    'path' in photo
      ? { photo_path: photo.path }
      : {
          photo_url: photo.url,
          photo_credit: photo.credit,
          photo_credit_url: photo.creditUrl,
          photo_path: null,
        };
  return updateMeal(sb, mealId, patch);
}

/** The picture to show for a meal: a signed link for an upload, otherwise the recipe page's image. */
export async function mealPhotoSrc(
  sb: Sb,
  meal: Pick<MealRow, 'photo_path' | 'photo_url'>,
): Promise<string | null> {
  if (meal.photo_path) {
    const { data } = await sb.storage.from('meal-photos').createSignedUrl(meal.photo_path, SIGNED_URL_SECONDS);
    if (data?.signedUrl) return data.signedUrl;
  }
  return meal.photo_url;
}

/** `mealPhotoSrc` for many meals at once (one signing call), keyed by meal id. */
export async function mealPhotoSrcs(
  sb: Sb,
  meals: Pick<MealRow, 'id' | 'photo_path' | 'photo_url'>[],
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const uploaded = meals.filter((m) => m.photo_path);
  const signed = new Map<string, string>();
  if (uploaded.length > 0) {
    const { data } = await sb.storage
      .from('meal-photos')
      .createSignedUrls(uploaded.map((m) => m.photo_path as string), SIGNED_URL_SECONDS);
    for (const r of data ?? []) if (r.path && r.signedUrl) signed.set(r.path, r.signedUrl);
  }
  for (const m of meals) {
    out[m.id] = (m.photo_path && signed.get(m.photo_path)) || m.photo_url;
  }
  return out;
}

export async function getMeals(sb: Sb, ids: string[]): Promise<MealRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await sb.from('meals').select('*').in('id', ids);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Narrows favorites. `q` matches the meal name and ingredient names. `most` keeps meals
 * made at least once, most-made first. `under15` uses `costs` (cents per meal id, null when
 * a line has no price) and keeps only meals priced at $15 or less; without `costs` it keeps everything.
 */
export function filterFavorites(
  rows: MealRow[],
  opts: { q?: string; filter?: FavoriteFilter; costs?: ReadonlyMap<string, number | null> } = {},
): MealRow[] {
  let out = rows;
  const q = opts.q?.trim().toLowerCase();
  if (q) {
    out = out.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.ingredients as unknown as IngredientLine[]).some((i) => i.canonical.toLowerCase().includes(q)),
    );
  }
  if (opts.filter === 'vegetarian') {
    out = out.filter((r) => {
      const m = toMeal(r);
      return m.everyoneVegetarian || !m.ingredients.some((i) => i.role === 'meat' || i.role === 'fish');
    });
  } else if (opts.filter === 'under15' && opts.costs) {
    const costs = opts.costs;
    out = out.filter((r) => {
      const c = costs.get(r.id);
      return c !== undefined && c !== null && c <= UNDER_15_CENTS;
    });
  } else if (opts.filter === 'most') {
    out = out.filter((r) => r.times_planned > 0).sort((a, b) => b.times_planned - a.times_planned);
  }
  return out;
}

/** Favorites, newest first, narrowed by `opts` (see `filterFavorites`). */
export async function listFavorites(
  sb: Sb,
  householdId: string,
  opts: { q?: string; filter?: FavoriteFilter } = {},
): Promise<MealRow[]> {
  const { data, error } = await sb
    .from('meals')
    .select('*')
    .eq('household_id', householdId)
    .eq('is_favorite', true)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return filterFavorites(data ?? [], opts);
}
