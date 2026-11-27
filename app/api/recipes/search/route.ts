import { NextResponse } from 'next/server';
import { holdCents, recordUsage } from '@/lib/ai/usage';
import { SearchBodySchema } from '@/lib/ai/schemas';
import { isResponse, readJson, requireHouseholdWithinCap } from '@/lib/api/household-context';
import { updateHousehold } from '@/lib/db/queries/household';
import { searchRecipes } from '@/lib/recipes/search';
import { SourceLimitError, type SearchMeter } from '@/lib/recipes/search/provider';

export async function POST(req: Request) {
  const body = SearchBodySchema.safeParse(await readJson(req));
  const ctx = await requireHouseholdWithinCap(holdCents('search'));
  if (isResponse(ctx)) return ctx;
  if (!body.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const { query, source } = body.data;
  const { sb, household } = ctx;

  // Only Brave costs money (Spoonacular's free plan does not); each request it was sent is billed,
  // whether or not the search then succeeded.
  const meter: SearchMeter = { braveCalls: 0 };
  let result;
  try {
    result = await searchRecipes(query, source, meter);
  } catch (e) {
    if (e instanceof SourceLimitError) return NextResponse.json({ error: 'source_limit' }, { status: 429 });
    console.error('recipe search failed', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'search_failed' }, { status: 502 });
  } finally {
    try {
      for (let i = 0; i < meter.braveCalls; i++) {
        await recordUsage(sb, household.id, 'search', 'brave', { inputTokens: 0, outputTokens: 0 });
      }
    } catch (e) {
      console.error('recipe search bookkeeping failed', e instanceof Error ? e.message : 'unknown');
    }
  }

  try {
    if (household.recipe_source !== source) await updateHousehold(sb, household.id, { recipe_source: source });
  } catch (e) {
    console.error('recipe search bookkeeping failed', e instanceof Error ? e.message : 'unknown');
  }
  return NextResponse.json(result);
}
