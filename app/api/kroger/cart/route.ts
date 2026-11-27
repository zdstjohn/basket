import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CartBodySchema } from '@/lib/ai/schemas';
import { isResponse, readJson, requireHousehold } from '@/lib/api/household-context';
import type { Database } from '@/lib/db/types';
import { countCartSendsSince, insertPendingSend, listCartSends, listMatches, listPendingSendsSince, settleSend } from '@/lib/db/queries/kroger';
import { cartDiff, type CartLine } from '@/lib/domain/cart';
import { addToCart, KrogerAuth, KrogerLimited, KrogerNotAdded, KrogerUnsure } from '@/lib/kroger/cart';
import { getUserAccess } from '@/lib/kroger/link';
import { isCartConfigured } from '@/lib/kroger/oauth';

type Sb = SupabaseClient<Database>;

const DAY_MS = 24 * 60 * 60 * 1000;
const SENDS_PER_DAY = 20;
/** A send still `pending` this long after it started is taken to be an unanswered one, not one in flight. */
const IN_FLIGHT_MS = 5 * 60 * 1000;
/** The slowest send (150 single calls, 4 at once, 10 s each) is cut off by cart.ts at 240 s; Vercel's limit is 300 s. */
export const maxDuration = 300;
const SPEND_CHUNK = 60; // kroger_spend takes at most 60 per call

const fail = (error: string, status: number, headers?: Record<string, string>) => NextResponse.json({ error }, { status, headers });

/**
 * Charges `n` Kroger calls to the household's daily allowance (the same one product lookups use). False when the
 * allowance, the untrusted pool or the all-households ceiling is spent. kroger_spend refuses by returning the
 * unchanged total, so a charge that did not raise it was refused.
 */
async function charge(sb: Sb, householdId: string, n: number): Promise<boolean> {
  const limited = await sb.rpc('kroger_limited');
  if (limited.error) throw new Error('kroger cap unavailable');
  if (limited.data === true) return false;
  const read = await sb.rpc('kroger_spend', { h: householdId, n: 0 });
  if (read.error) throw new Error('kroger cap unavailable');
  let total = Number(read.data);
  for (let left = n; left > 0; left -= SPEND_CHUNK) {
    const part = Math.min(left, SPEND_CHUNK);
    const after = await sb.rpc('kroger_spend', { h: householdId, n: part });
    if (after.error) throw new Error('kroger cap unavailable');
    if (Number(after.data) < total + part) return false;
    total = Number(after.data);
  }
  return true;
}

/** Marks a send failed. If even that cannot be written the row stays `pending`, which errs on the side of "already sent". */
async function markFailed(sb: Sb, id: string): Promise<void> {
  try {
    await settleSend(sb, id, { status: 'failed' });
  } catch {
    console.error('kroger cart row not marked failed');
  }
}

const sameLines = (a: CartLine[], b: CartLine[]) =>
  a.length === b.length && a.every((l, i) => l.upc === b[i].upc && l.quantity === b[i].quantity);

/**
 * Adds the household's chosen Fred Meyer products to the signed-in person's own Kroger cart. Nothing is ordered:
 * the family checks out on Kroger. The send is recorded as `pending` before Kroger is asked, because the cart
 * cannot be read back and the record is the only memory of what is in it.
 */
export async function POST(req: Request) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return fail('forbidden', 403);
  const parsed = CartBodySchema.safeParse(await readJson(req));
  const ctx = await requireHousehold();
  if (isResponse(ctx)) return ctx;
  const { sb, household } = ctx;
  if (!household.kroger_location_id) return fail('no_store', 409);
  if (!parsed.success) return fail('bad_request', 400);
  const body = parsed.data;
  if (!isCartConfigured()) return fail('not_configured', 503);

  const { data: auth } = await sb.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return fail('unauthorized', 401);

  let access: { access: string; profileId: string | null } | null;
  let toSend: CartLine[];
  let sendId: string;
  try {
    const since = new Date(Date.now() - DAY_MS).toISOString();
    if ((await countCartSendsSince(sb, household.id, since)) >= SENDS_PER_DAY) return fail('too_many', 429);

    try {
      access = await getUserAccess(sb, userId);
    } catch {
      return fail('unavailable', 503);
    }
    if (!access) return fail('not_connected', 409);

    const week = await sb.from('weeks').select('id').eq('id', body.weekId).eq('household_id', household.id).maybeSingle();
    if (week.error) throw new Error('week read failed');
    if (!week.data) return fail('not_found', 404);

    // Names and prices come from the household's cached searches, never from the request.
    const byUpc = new Map<string, { canonical: string; name: string; unitCents: number }>();
    for (const m of await listMatches(sb, household.id, household.kroger_location_id)) {
      for (const c of m.candidates) {
        if (!byUpc.has(c.upc)) byUpc.set(c.upc, { canonical: m.canonical, name: c.name, unitCents: c.promoCents ?? c.regularCents });
      }
    }
    const lines: CartLine[] = [];
    for (const l of body.lines) {
      const hit = byUpc.get(l.upc);
      if (!hit) return fail('unknown_product', 400);
      lines.push({ key: l.key, canonical: hit.canonical, upc: l.upc, name: hit.name, quantity: l.quantity, cents: l.quantity * hit.unitCents });
    }

    // `quantity` is the wanted total: unless the person asked to send again, only the difference goes.
    const me = { userId, profileId: access.profileId };
    toSend = lines;
    if (!body.resend) {
      toSend = cartDiff(lines, await listCartSends(sb, body.weekId), me).toSend;
      if (toSend.length === 0) return fail('already_sent', 409);
    }

    try {
      sendId = (
        await insertPendingSend(sb, {
          householdId: household.id,
          weekId: body.weekId,
          profileId: access.profileId,
          modality: body.modality,
          items: toSend,
          totalCents: toSend.reduce((n, l) => n + l.cents, 0),
        })
      ).id;
    } catch {
      return fail('save_failed', 500);
    }

    // The row is in. Look again for anything that overlaps it: a send of this household started earlier and
    // still in flight (the earlier one goes on, this one stands down), or one that finished since we looked.
    try {
      const pending = await listPendingSendsSince(sb, household.id, new Date(Date.now() - IN_FLIGHT_MS).toISOString());
      const mine = pending.find((p) => p.id === sendId);
      // A send of the same list yields to an earlier one. A resend, which skips the "already sent" check, yields
      // to any other send in flight, whichever started first: the later one may already have passed its own check.
      const earlier = pending.some(
        (p) =>
          p.id !== sendId &&
          (body.resend || !mine || p.createdAt < mine.createdAt || (p.createdAt === mine.createdAt && p.id < sendId)),
      );
      const startedBefore = (at: string, id: string) =>
        !mine || at < mine.createdAt || (at === mine.createdAt && id < sendId);
      let changed = false;
      if (!body.resend) {
        const fresh = cartDiff(lines, (await listCartSends(sb, body.weekId)).filter((s) => s.id !== sendId && (s.status !== 'pending' || startedBefore(s.sentAt, s.id))), me).toSend;
        changed = !sameLines(fresh, toSend);
      }
      if (earlier || changed) {
        await markFailed(sb, sendId);
        return fail('already_sending', 409);
      }
    } catch {
      await markFailed(sb, sendId);
      return fail('unavailable', 503);
    }
  } catch (e) {
    console.error('kroger cart failed before sending', e instanceof Error ? e.message : 'unknown');
    return fail('unavailable', 503);
  }

  const items = toSend.map((l) => ({ upc: l.upc, quantity: l.quantity, modality: body.modality }));
  const opts = { charge: (n: number) => charge(sb, household.id, n).catch(() => false) };
  let answer: { ok: string[]; rejected: string[] };
  try {
    try {
      answer = await addToCart(access.access, items, opts);
    } catch (e) {
      if (!(e instanceof KrogerAuth)) throw e;
      // A 401 means nothing was added. Try once more with a fresh token.
      let fresh: { access: string } | null;
      try {
        fresh = await getUserAccess(sb, userId, { force: true });
      } catch {
        await markFailed(sb, sendId);
        return fail('unavailable', 503);
      }
      if (!fresh) {
        await markFailed(sb, sendId);
        return fail('not_connected', 409);
      }
      answer = await addToCart(fresh.access, items, opts);
    }
  } catch (e) {
    if (e instanceof KrogerAuth) {
      // Dropping a link is getUserAccess's job (only when Kroger says the refresh token is dead).
      await markFailed(sb, sendId);
      return fail('not_connected', 409);
    }
    if (e instanceof KrogerNotAdded) {
      console.error('kroger cart refused');
      await markFailed(sb, sendId);
      return e.status === 429 ? fail('slow_down', 429, { 'retry-after': '3600' }) : fail('rejected', 502);
    }
    if (e instanceof KrogerLimited) {
      await markFailed(sb, sendId);
      return fail('slow_down', 429, { 'retry-after': '3600' });
    }
    // Timeout, network error, 5xx or anything unexpected: Kroger may have added the items. The row stays pending.
    console.error(e instanceof KrogerUnsure ? 'kroger cart unsure' : 'kroger cart unexpected failure');
    const known = e instanceof KrogerUnsure ? e.outcome : undefined;
    if (!known) return fail('unsure', 504);
    // Some single calls were answered before it stopped: keep ok and unknown lines on the pending row (they may be
    // in the cart), and leave the refused ones off it so a repeat send tries them again.
    const refused = new Set(known.rejected);
    const kept = toSend.filter((l) => !refused.has(l.upc));
    try {
      await settleSend(sb, sendId, { status: 'pending', items: kept, totalCents: kept.reduce((n, l) => n + l.cents, 0) });
    } catch {
      console.error('kroger cart row not trimmed');
    }
    const names = toSend.filter((l) => refused.has(l.upc)).map((l) => ({ key: l.key, name: l.name }));
    return NextResponse.json(names.length > 0 ? { error: 'unsure', rejected: names } : { error: 'unsure' }, { status: 504 });
  }

  const added = new Set(answer.ok);
  const accepted = toSend.filter((l) => added.has(l.upc));
  if (accepted.length === 0) {
    await markFailed(sb, sendId);
    return fail('rejected', 502);
  }
  const rejected = toSend.filter((l) => !added.has(l.upc)).map((l) => ({ key: l.key, name: l.name }));
  try {
    await settleSend(sb, sendId, { status: 'sent', items: accepted, totalCents: accepted.reduce((n, l) => n + l.cents, 0) });
  } catch {
    // The items are in the cart. The row stays pending, which counts as sent.
    console.error('kroger cart row not marked sent');
  }
  return NextResponse.json({ sent: accepted.length, rejected });
}
