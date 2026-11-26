import { RecipeDraftSchema, type RecipeDraft } from '@/lib/ai/schemas';

export type AddMealTab = 'search' | 'paste' | 'favorites';

/** What Add a meal keeps in localStorage between visits. */
export interface SavedAddMeal {
  tab: AddMealTab;
  query: string;
  paste: string;
  draft: RecipeDraft | null;
  saveFavorite: boolean;
}

const TABS: AddMealTab[] = ['search', 'paste', 'favorites'];

/** Checks a stored draft: anything malformed is dropped (null), never trusted. */
export function parseSavedAddMeal(raw: unknown): SavedAddMeal | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!TABS.includes(r.tab as AddMealTab)) return null;
  if (typeof r.query !== 'string' || typeof r.paste !== 'string' || typeof r.saveFavorite !== 'boolean') return null;
  let draft: RecipeDraft | null = null;
  if (r.draft !== null && r.draft !== undefined) {
    const parsed = RecipeDraftSchema.safeParse(r.draft);
    if (!parsed.success) return null;
    draft = parsed.data;
  }
  return { tab: r.tab as AddMealTab, query: r.query, paste: r.paste, draft, saveFavorite: r.saveFavorite };
}
