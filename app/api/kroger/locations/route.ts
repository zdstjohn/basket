import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/server';
import { findLocations } from '@/lib/kroger/locations';
import { isKrogerConfigured } from '@/lib/kroger/token';

/** Kroger-family stores near a ZIP code, for choosing the household's Fred Meyer. */
export async function GET(req: Request) {
  const sb = await createServerClient();
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const zip = new URL(req.url).searchParams.get('zip') ?? '';
  if (!/^\d{5}$/.test(zip)) return NextResponse.json({ error: 'bad_zip' }, { status: 400 });
  if (!isKrogerConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  try {
    return NextResponse.json(await findLocations(zip));
  } catch (e) {
    console.error('kroger locations failed', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'unavailable' }, { status: 502 });
  }
}
