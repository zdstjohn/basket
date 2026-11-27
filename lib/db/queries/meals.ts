import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import type { MealRow } from '@/lib/db/rows';
import { PersonChangeSchema, type RecipeDraft } from '@/lib/ai/schemas';
import { isAllergyChange } from '@/lib/domain/flags';
import type { IngredientLine, Meal, Person, PersonChange, VegSwap } from '@/lib/domain/types';

type Sb = SupabaseClient<Database>;

export type MealPhoto = { path: string } | { url: string; credit: string; creditUrl: string };
export type FavoriteFilter = 'vegetarian' | 'under15' | 'most';

/** "Under $15" keeps meals that cost this much or less for the household. */
export const UNDER_15_CENTS = 1500;

const SIGNED_URL_SECONDS = 3600;
/** A signed link is reused for 50 minutes, so a realtime reload keeps the same src and the browser keeps its cached image. */
const REUSE_MS = 50 * 60 * 1000;
const signedLinks = new Map<string, { url: string; at: number }>();

/** Browser only: on a server the map would be shared between every signed-in user's requests. */
const canReuseLinks = (): boolean => typeof window !== 'undefined';

function freshLink(path: string): string | null {
  if (!canReuseLinks()) return null;
  const hit = signedLinks.get(path);
  return hit && Date.now() - hit.at <= REUSE_MS ? hit.url : null;
}
function rememberLink(path: string, url: string): void {
  if (!canReuseLinks()) return;
  signedLinks.set(path, { url, at: Date.now() });
}

/** Reads the saved changes one by one: an entry that fails the schema is dropped, never the whole list. */
function parseChanges(raw: unknown): PersonChange[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const r = PersonChangeSchema.safeParse(entry);
    return r.success ? [r.data] : [];
  });
}

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
    personChanges: parseChanges(row.person_changes),
  };
}

type AllergyRow = { id: string; allergies: string[] | null };

/** The people named by these changes, with their allergies. */
async function allergiesOf(sb: Sb, changes: PersonChange[]): Promise<AllergyRow[]> {
  if (changes.length === 0) return [];
  const ids = [...new Set(changes.map((c) => c.personId))];
  const { data, error } = await sb.from('people').select('id, allergies').in('id', ids);
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as AllergyRow[]) : [];
}

const asPerson = (r: AllergyRow): Person => ({ id: r.id, name: '', age: 0, diet: 'none', appetite: 1, dislikes: [], allergies: r.allergies ?? [] });

export async function saveMeal(
  sb: Sb,
  householdId: string,
  draft: Omit<RecipeDraft, 'personChanges'> & Partial<Pick<RecipeDraft, 'personChanges'>> & { isFavorite: boolean; everyoneVegetarian?: boolean },
): Promise<MealRow> {
  // A change that names someone's allergy is dropped here, as setPersonChanges refuses it: an allergy is only warned about.
  const wanted = draft.personChanges ?? [];
  const rows = await allergiesOf(sb, wanted);
  const kept = wanted.filter((c) => {
    const row = rows.find((r) => r.id === c.personId);
    return !row || !isAllergyChange(c, asPerson(row));
  });
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
      person_changes: kept as unknown as Database['public']['Tables']['meals']['Insert']['person_changes'],
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

/** The change for this person and food becomes `next`; any other change stays. */
export function withChange(changes: PersonChange[], next: PersonChange): PersonChange[] {
  const same = (c: PersonChange): boolean => c.personId === next.personId && c.food === next.food;
  return changes.some(same) ? changes.map((c) => (same(c) ? next : c)) : [...changes, next];
}

export function withoutChange(changes: PersonChange[], personId: string, food: string): PersonChange[] {
  return changes.filter((c) => !(c.personId === personId && c.food === food));
}

/**
 * Saves who leaves out or swaps what. A change for a food the person is allergic to is refused:
 * an allergy is never left out or swapped, only warned about.
 */
export async function setPersonChanges(sb: Sb, mealId: string, changes: PersonChange[]): Promise<MealRow> {
  const clean = changes.map((c) => PersonChangeSchema.parse(c));
  const rows = await allergiesOf(sb, clean);
  for (const c of clean) {
    const row = rows.find((r) => r.id === c.personId);
    if (row && isAllergyChange(c, asPerson(row))) throw new Error(`${c.food} is an allergy, so it can’t be left out or swapped`);
  }
  return updateMeal(sb, mealId, { person_changes: clean as unknown as Database['public']['Tables']['meals']['Update']['person_changes'] });
}

/** Either an uploaded photo (a storage path) or a picture from a recipe page, which keeps its credit. */
export async function setMealPhoto(sb: Sb, mealId: string, photo: MealPhoto): Promise<MealRow> {
  const patch =
    'path' in photo
      ? { photo_path: photo.path, photo_preview: null, photo_width: null }
      : {
          photo_url: photo.url,
          photo_credit: photo.credit,
          photo_credit_url: photo.creditUrl,
          photo_path: null,
          photo_preview: null,
          photo_width: null,
        };
  return updateMeal(sb, mealId, patch);
}

/** The picture to show for a meal: a signed link for an upload, otherwise the recipe page's image. */
export async function mealPhotoSrc(
  sb: Sb,
  meal: Pick<MealRow, 'photo_path' | 'photo_url'>,
): Promise<string | null> {
  if (meal.photo_path) {
    const reused = freshLink(meal.photo_path);
    if (reused) return reused;
    const { data } = await sb.storage.from('meal-photos').createSignedUrl(meal.photo_path, SIGNED_URL_SECONDS);
    if (data?.signedUrl) {
      rememberLink(meal.photo_path, data.signedUrl);
      return data.signedUrl;
    }
  }
  return meal.photo_url;
}

/** `mealPhotoSrc` for many meals at once (one signing call), keyed by meal id. */
export async function mealPhotoSrcs(
  sb: Sb,
  meals: Pick<MealRow, 'id' | 'photo_path' | 'photo_url'>[],
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const signed = new Map<string, string>();
  const missing = new Set<string>();
  for (const m of meals) {
    if (!m.photo_path) continue;
    const reused = freshLink(m.photo_path);
    if (reused) signed.set(m.photo_path, reused);
    else missing.add(m.photo_path);
  }
  if (missing.size > 0) {
    const { data } = await sb.storage.from('meal-photos').createSignedUrls([...missing], SIGNED_URL_SECONDS);
    for (const r of data ?? []) {
      if (!r.path || !r.signedUrl) continue;
      signed.set(r.path, r.signedUrl);
      rememberLink(r.path, r.signedUrl);
    }
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
