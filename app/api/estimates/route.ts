import { NextResponse } from 'next/server';
import { estimatePrices } from '@/lib/ai/estimate';
import { UnreadableError } from '@/lib/ai/provider';
import { EstimatesBodySchema } from '@/lib/ai/schemas';
import { checkCap, recordUsage } from '@/lib/ai/usage';
import { isResponse, readJson, requireHousehold } from '@/lib/api/household-context';

export async function POST(req: Request) {
  const body = EstimatesBodySchema.safeParse(await readJson(req));
  const ctx = await requireHousehold();
  if (isResponse(ctx)) return ctx;
  if (!body.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const { sb, household } = ctx;

  const usage: { model: string; inputTokens: number; outputTokens: number }[] = [];
  try {
    // Kroger shelf prices don't count toward the AI cap: over the cap only the model's part is refused.
    const cap = await checkCap(sb, household.id);
    const result = await estimatePrices(body.data.items, body.data.store, {
      sb, householdId: household.id, krogerLocationId: household.kroger_location_id,
      aiAllowed: cap.ok, onUsage: (u) => void usage.push(u),
    });
    if (result.aiSkipped && Object.keys(result.prices).length === 0) {
      return NextResponse.json({ error: 'cap_reached' }, { status: 402 });
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
