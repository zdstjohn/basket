import { NextResponse } from 'next/server';
import { isResponse, requireHousehold } from '@/lib/api/household-context';
import { findLocations } from '@/lib/kroger/locations';
import { isKrogerConfigured } from '@/lib/kroger/token';

/** Kroger-family stores near a ZIP code, for choosing the household's Fred Meyer. */
export async function GET(req: Request) {
  const ctx = await requireHousehold();
  if (isResponse(ctx)) return ctx;
  const { sb, household } = ctx;
  const zip = new URL(req.url).searchParams.get('zip') ?? '';
  if (!/^\d{5}$/.test(zip)) return NextResponse.json({ error: 'bad_zip' }, { status: 400 });
  if (!isKrogerConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  try {
    // One Kroger call, charged like a product lookup: the household's 400 a day, the untrusted pool and
    // the all-households total all apply. kroger_spend refuses by returning the unchanged total, so
    // the total before is read with n = 0 and a charge that did not raise it was refused.
    const limited = await sb.rpc('kroger_limited');
    if (limited.error) throw new Error(limited.error.message);
    if (limited.data === true) return NextResponse.json({ error: 'slow_down' }, { status: 429 });
    const before = await sb.rpc('kroger_spend', { h: household.id, n: 0 });
    if (before.error) throw new Error(before.error.message);
    const after = await sb.rpc('kroger_spend', { h: household.id, n: 1 });
    if (after.error) throw new Error(after.error.message);
    if (Number(after.data) < Number(before.data) + 1) {
      return NextResponse.json({ error: 'slow_down' }, { status: 429, headers: { 'retry-after': '3600' } });
    }
    return NextResponse.json(await findLocations(zip));
  } catch (e) {
    console.error('kroger locations failed', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'unavailable' }, { status: 502 });
  }
}
