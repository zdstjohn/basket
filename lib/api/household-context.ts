import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { aiGate, type GateResult } from '@/lib/ai/usage';
import { createServerClient } from '@/lib/db/server';
import { getMyHousehold } from '@/lib/db/queries/household';
import type { Household } from '@/lib/db/rows';
import type { Database } from '@/lib/db/types';

export interface RouteContext {
  sb: SupabaseClient<Database>;
  household: Household;
}

/** The signed-in user's household, or the response to send instead. */
export async function requireHousehold(): Promise<RouteContext | NextResponse> {
  const sb = await createServerClient();
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const household = await getMyHousehold(sb);
  if (!household) return NextResponse.json({ error: 'no_household' }, { status: 404 });
  return { sb, household };
}

/** The response for a refused gate, or null for 'ok'. */
export function gateResponse(result: GateResult): NextResponse | null {
  switch (result) {
    case 'ok':
      return null;
    case 'cap':
      return NextResponse.json({ error: 'cap_reached' }, { status: 402 });
    case 'slow':
      return NextResponse.json({ error: 'slow_down' }, { status: 429, headers: { 'retry-after': '60' } });
    case 'busy':
      return NextResponse.json({ error: 'busy' }, { status: 429, headers: { 'retry-after': '3600' } });
    default:
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
}

/**
 * The spend guard for a paid call: null when it let the call through (and reserved `holdCents` for it),
 * otherwise the response to send. Routes validate their input first, so a bad request never uses up a
 * gate slot, and take this right before the first paid call.
 */
export async function takeGate(ctx: RouteContext, holdCents: number): Promise<NextResponse | null> {
  return gateResponse(await aiGate(ctx.sb, ctx.household.id, holdCents));
}

export const isResponse = (v: RouteContext | NextResponse): v is NextResponse => v instanceof NextResponse;

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
