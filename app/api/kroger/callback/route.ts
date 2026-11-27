import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { safeNext } from '@/lib/auth/safe-next';
import { createServerClient } from '@/lib/db/server';
import { saveLink } from '@/lib/kroger/link';
import { exchangeCode, fetchProfileId } from '@/lib/kroger/oauth';
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, backTo } from '@/lib/kroger/redirect';
import { unseal } from '@/lib/kroger/vault';

interface Pending {
  state: string;
  verifier: string;
  next: string;
  uid: string;
}

function readPending(req: Request): Pending | null {
  const header = req.headers.get('cookie') ?? '';
  const part = header.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${OAUTH_COOKIE}=`));
  const plain = part ? unseal(part.slice(OAUTH_COOKIE.length + 1), 'oauth') : null;
  if (!plain) return null;
  try {
    const p = JSON.parse(plain) as Partial<Pending>;
    return [p.state, p.verifier, p.next, p.uid].every((v) => typeof v === 'string' && v) ? { ...(p as Pending), next: safeNext(p.next) } : null;
  } catch {
    return null;
  }
}

/** Same length first: timingSafeEqual throws on unequal lengths. */
function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Where Kroger sends the shopper back to. Saves the link only for the person who started it. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const done = (to: URL) => {
    const res = NextResponse.redirect(to, 302);
    res.cookies.set(OAUTH_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
      path: OAUTH_COOKIE_PATH,
      maxAge: 0,
    });
    return res;
  };
  const failedHome = () => done(backTo(url.origin, '/list/review', 'failed'));

  const pending = readPending(req);
  const state = url.searchParams.get('state');
  if (!pending || !state || !sameState(state, pending.state)) return failedHome();
  const sb = await createServerClient();
  const { data } = await sb.auth.getUser();
  if (!data.user || data.user.id !== pending.uid) return failedHome();

  if (url.searchParams.get('error')) return done(backTo(url.origin, pending.next, 'denied'));
  const code = url.searchParams.get('code');
  if (!code) return done(backTo(url.origin, pending.next, 'failed'));
  try {
    const tokens = await exchangeCode(code, pending.verifier);
    const profileId = await fetchProfileId(tokens.access);
    await saveLink(sb, data.user.id, tokens, profileId);
    return done(backTo(url.origin, pending.next, 'connected'));
  } catch {
    console.error('kroger connect failed');
    return done(backTo(url.origin, pending.next, 'failed'));
  }
}
