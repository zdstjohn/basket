import { NextResponse } from 'next/server';
import { recordUsage } from '@/lib/ai/usage';
import { SearchBodySchema } from '@/lib/ai/schemas';
import { isResponse, readJson, requireHouseholdWithinCap } from '@/lib/api/household-context';
import { updateHousehold } from '@/lib/db/queries/household';
import { searchRecipes } from '@/lib/recipes/search';
import { SourceLimitError } from '@/lib/recipes/search/provider';

export async function POST(req: Request) {
  const body = SearchBodySchema.safeParse(await readJson(req));
  const ctx = await requireHouseholdWithinCap();
  if (isResponse(ctx)) return ctx;
  if (!body.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const { query, source } = body.data;
  const { sb, household } = ctx;

  let result;
  try {
    result = await searchRecipes(query, source);
  } catch (e) {
    if (e instanceof SourceLimitError) return NextResponse.json({ error: 'source_limit' }, { status: 429 });
    console.error('recipe search failed', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'search_failed' }, { status: 502 });
  }

  try {
    // Only Brave costs money; Spoonacular's free plan does not.
    if (source === 'sites') await recordUsage(sb, household.id, 'search', 'brave', { inputTokens: 0, outputTokens: 0 });
    if (household.recipe_source !== source) await updateHousehold(sb, household.id, { recipe_source: source });
  } catch (e) {
    console.error('recipe search bookkeeping failed', e instanceof Error ? e.message : 'unknown');
  }
  return NextResponse.json(result);
}
