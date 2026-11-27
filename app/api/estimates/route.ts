import { NextResponse } from 'next/server';
import { estimatePrices } from '@/lib/ai/estimate';
import { UnreadableError, type UsageReport } from '@/lib/ai/provider';
import { EstimatesBodySchema } from '@/lib/ai/schemas';
import { aiGate, holdCents, recordUsage } from '@/lib/ai/usage';
import { gateResponse, isResponse, readJson, requireHousehold } from '@/lib/api/household-context';

export async function POST(req: Request) {
  const body = EstimatesBodySchema.safeParse(await readJson(req));
  const ctx = await requireHousehold();
  if (isResponse(ctx)) return ctx;
  if (!body.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const { sb, household } = ctx;

  const usage: UsageReport[] = [];
  try {
    // Cached and Kroger shelf prices are not AI spend: the spend guard is taken only when the model is
    // about to be asked, and a refusal skips just that part.
    const result = await estimatePrices(body.data.items, body.data.store, {
      sb, householdId: household.id, krogerLocationId: household.kroger_location_id,
      gate: () => aiGate(sb, household.id, holdCents('estimate')),
      onUsage: (u) => void usage.push(u),
    });
    if (result.aiSkipped && result.aiSkipReason && Object.keys(result.prices).length === 0) {
      return gateResponse(result.aiSkipReason)!;
    }
    return NextResponse.json({ prices: result.prices, kroger: result.kroger });
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
