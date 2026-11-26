import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkCap } from '@/lib/ai/usage';
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

/** The signed-in user's household with the monthly cap checked, or the response to send instead. */
export async function requireHouseholdWithinCap(): Promise<RouteContext | NextResponse> {
  const ctx = await requireHousehold();
  if (isResponse(ctx)) return ctx;
  const { sb, household } = ctx;
  const cap = await checkCap(sb, household.id);
  if (!cap.ok) return NextResponse.json({ error: 'cap_reached' }, { status: 402 });
  return { sb, household };
}

export const isResponse = (v: RouteContext | NextResponse): v is NextResponse => v instanceof NextResponse;

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
