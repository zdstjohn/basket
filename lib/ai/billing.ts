import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import type { SearchMeter } from '@/lib/recipes/search/provider';
import { recordUsage } from './usage';

/** A fresh counter for the paid search requests one route call sends. */
export const newMeter = (): SearchMeter => ({ braveCalls: 0, spoonacularCalls: 0 });

/** One `search` usage row per counted request, Brave and Spoonacular. Throws on the first database error. */
export async function recordSearchCalls(
  sb: SupabaseClient<Database>,
  householdId: string,
  meter: SearchMeter,
): Promise<void> {
  const none = { inputTokens: 0, outputTokens: 0 };
  for (let i = 0; i < meter.braveCalls; i++) await recordUsage(sb, householdId, 'search', 'brave', none);
  for (let i = 0; i < meter.spoonacularCalls; i++) await recordUsage(sb, householdId, 'search', 'spoonacular', none);
}
