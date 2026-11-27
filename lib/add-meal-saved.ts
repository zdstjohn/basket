import { RecipeDraftSchema, type RecipeDraft } from '@/lib/ai/schemas';
import { findFlags } from '@/lib/domain/flags';
import type { Person } from '@/lib/domain/types';

export type AddMealTab = 'search' | 'paste' | 'favorites';

/** What Add a meal keeps in localStorage between visits. */
export interface SavedAddMeal {
  tab: AddMealTab;
  query: string;
  paste: string;
  draft: RecipeDraft | null;
  saveFavorite: boolean;
  /** Only the food words of the picked recipe that matched someone's list ("almonds"), never its lines. */
  matched: string[];
}

const MOST_WORDS = 30;
const LONGEST_WORD = 80;

/** The words of a recipe's own lines that matched what someone won't eat or is allergic to. Nothing else is kept. */
export function matchedWords(lines: string[], people: Person[]): string[] {
  if (lines.length === 0 || people.length === 0) return [];
  return [...new Set(findFlags(lines, people).flatMap((f) => f.found))].slice(0, MOST_WORDS);
}

function readWords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((w): w is string => typeof w === 'string' && w.length > 0 && w.length <= LONGEST_WORD).slice(0, MOST_WORDS);
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
  return { tab: r.tab as AddMealTab, query: r.query, paste: r.paste, draft, saveFavorite: r.saveFavorite, matched: readWords(r.matched) };
}
