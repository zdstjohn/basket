import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/server';
import { deleteLink } from '@/lib/kroger/link';

/**
 * Forgets this person's Fred Meyer link. Works even when cart filling is switched off.
 * Kroger documents no revoke endpoint for shopper tokens, so there is nothing to call: deleting the sealed row is the whole disconnect.
 */
export async function POST() {
  const sb = await createServerClient();
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    await deleteLink(sb, data.user.id);
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 502 });
  }
  return new NextResponse(null, { status: 204 });
}
