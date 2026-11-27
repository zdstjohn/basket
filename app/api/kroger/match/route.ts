import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isResponse, readJson, requireHousehold } from '@/lib/api/household-context';
import { getMatches } from '@/lib/kroger/matches';
import { KrogerNotConfigured } from '@/lib/kroger/token';

const BodySchema = z.object({
  canonicals: z.array(z.string().trim().toLowerCase().min(1).max(80)).min(1).max(60),
});

/** Fred Meyer products for foods: from the household's 24-hour cache, else searched (and counted). */
export async function POST(req: Request) {
  const body = BodySchema.safeParse(await readJson(req));
  const ctx = await requireHousehold();
  if (isResponse(ctx)) return ctx;
  if (!body.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const { sb, household } = ctx;
  if (!household.kroger_location_id) return NextResponse.json({ error: 'no_store' }, { status: 409 });
  try {
    const canonicals = [...new Set(body.data.canonicals)];
    const result = await getMatches(canonicals, { sb, householdId: household.id, locationId: household.kroger_location_id });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof KrogerNotConfigured) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
    console.error('kroger match failed', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'match_failed' }, { status: 500 });
  }
}
