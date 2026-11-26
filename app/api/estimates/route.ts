import { NextResponse } from 'next/server';
import { estimateCents } from '@/lib/ai/estimate';
import { UnreadableError } from '@/lib/ai/provider';
import { EstimatesBodySchema } from '@/lib/ai/schemas';
import { recordUsage } from '@/lib/ai/usage';
import { isResponse, readJson, requireHouseholdWithinCap } from '@/lib/api/household-context';

export async function POST(req: Request) {
  const body = EstimatesBodySchema.safeParse(await readJson(req));
  const ctx = await requireHouseholdWithinCap();
  if (isResponse(ctx)) return ctx;
  if (!body.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const { sb, household } = ctx;

  const usage: { model: string; inputTokens: number; outputTokens: number }[] = [];
  try {
    const prices = await estimateCents(body.data.items, body.data.store, {
      sb, householdId: household.id, onUsage: (u) => void usage.push(u),
    });
    return NextResponse.json(prices);
  } catch (e) {
    if (e instanceof UnreadableError) return NextResponse.json({ error: 'unreadable' }, { status: 422 });
    console.error('estimate failed', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'estimate_failed' }, { status: 500 });
  } finally {
    for (const u of usage) {
      try {
        await recordUsage(sb, household.id, 'estimate', u.model, u);
      } catch {
        // see draft route
      }
    }
  }
}
