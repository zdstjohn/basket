import { NextResponse } from 'next/server';
import { draftFromOption, draftFromText, UnreadableError, type UsageEvent } from '@/lib/ai/recipes';
import { DraftBodySchema } from '@/lib/ai/schemas';
import { recordUsage } from '@/lib/ai/usage';
import { isResponse, readJson, requireHouseholdWithinCap } from '@/lib/api/household-context';
import { listPeople } from '@/lib/db/queries/household';
import { ImportError } from '@/lib/recipes/import-url';

export async function POST(req: Request) {
  const body = DraftBodySchema.safeParse(await readJson(req));
  const ctx = await requireHouseholdWithinCap();
  if (isResponse(ctx)) return ctx;
  if (!body.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const { sb, household } = ctx;

  const events: UsageEvent[] = [];
  const onUsage = (e: UsageEvent) => void events.push(e);
  try {
    const people = await listPeople(sb, household.id);
    const draft =
      body.data.mode === 'option'
        ? await draftFromOption(body.data.option, people, { onUsage })
        : await draftFromText(body.data.value, people, {
            onUsage,
            source: household.recipe_source === 'spoonacular' ? 'spoonacular' : 'sites',
          });
    return NextResponse.json(draft);
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.code }, { status: 422 });
    if (e instanceof UnreadableError) return NextResponse.json({ error: 'unreadable' }, { status: 422 });
    console.error('meal draft failed', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'draft_failed' }, { status: 500 });
  } finally {
    for (const e of events) {
      try {
        if (e.kind === 'parse') {
          await recordUsage(sb, household.id, 'parse', e.model, { inputTokens: e.inputTokens, outputTokens: e.outputTokens });
        } else {
          await recordUsage(sb, household.id, 'search', 'brave', { inputTokens: 0, outputTokens: 0 });
        }
      } catch {
        // Usage bookkeeping must not turn a good draft into an error.
      }
    }
  }
}
