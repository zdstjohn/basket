import { NextResponse } from 'next/server';
import { draftFromOption, draftFromText, UnreadableError, type UsageEvent } from '@/lib/ai/recipes';
import { DraftBodySchema } from '@/lib/ai/schemas';
import { newMeter, recordSearchCalls } from '@/lib/ai/billing';
import { holdCents, recordUsage } from '@/lib/ai/usage';
import { isResponse, readJson, requireHousehold, takeGate } from '@/lib/api/household-context';
import { listPeople } from '@/lib/db/queries/household';
import { ImportError } from '@/lib/recipes/import-url';

export async function POST(req: Request) {
  const body = DraftBodySchema.safeParse(await readJson(req));
  const ctx = await requireHousehold();
  if (isResponse(ctx)) return ctx;
  if (!body.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const refused = await takeGate(ctx, holdCents('draft'));
  if (refused) return refused;
  const { sb, household } = ctx;

  const events: UsageEvent[] = [];
  const onUsage = (e: UsageEvent) => void events.push(e);
  const meter = newMeter();
  try {
    const people = await listPeople(sb, household.id);
    const draft =
      body.data.mode === 'option'
        ? await draftFromOption(body.data.option, people, { onUsage, meter })
        : await draftFromText(body.data.value, people, {
            onUsage,
            meter,
            source: household.recipe_source === 'spoonacular' ? 'spoonacular' : 'sites',
          });
    return NextResponse.json(draft);
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.code }, { status: 422 });
    if (e instanceof UnreadableError) return NextResponse.json({ error: 'unreadable' }, { status: 422 });
    console.error('meal draft failed', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'draft_failed' }, { status: 500 });
  } finally {
    // Every model call and every paid search request costs money, even when the draft then failed.
    for (const e of events) {
      try {
        await recordUsage(sb, household.id, 'parse', e.model, {
          inputTokens: e.inputTokens, outputTokens: e.outputTokens, assumed: e.assumed,
        });
      } catch {
        // Usage bookkeeping must not turn a good draft into an error.
      }
    }
    try {
      await recordSearchCalls(sb, household.id, meter);
    } catch {
      // see above
    }
  }
}
