import { NextResponse } from 'next/server';
import { newMeter, recordSearchCalls } from '@/lib/ai/billing';
import { holdCents } from '@/lib/ai/usage';
import { SearchBodySchema } from '@/lib/ai/schemas';
import { isResponse, readJson, requireHousehold, takeGate } from '@/lib/api/household-context';
import { updateHousehold } from '@/lib/db/queries/household';
import { searchRecipes } from '@/lib/recipes/search';
import { SourceLimitError } from '@/lib/recipes/search/provider';

export async function POST(req: Request) {
  const body = SearchBodySchema.safeParse(await readJson(req));
  const ctx = await requireHousehold();
  if (isResponse(ctx)) return ctx;
  if (!body.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const refused = await takeGate(ctx, holdCents('search'));
  if (refused) return refused;
  const { query, source } = body.data;
  const { sb, household } = ctx;

  // Each paid request sent (Brave, and Spoonacular's shared quota) is billed, whether or not the search
  // then succeeded.
  const meter = newMeter();
  let result;
  try {
    result = await searchRecipes(query, source, meter);
  } catch (e) {
    if (e instanceof SourceLimitError) return NextResponse.json({ error: 'source_limit' }, { status: 429 });
    console.error('recipe search failed', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'search_failed' }, { status: 502 });
  } finally {
    try {
      await recordSearchCalls(sb, household.id, meter);
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
