import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { safeNext } from '@/lib/auth/safe-next';
import { createServerClient } from '@/lib/db/server';
import { fakeOn } from '@/lib/fake';
import { authorizeUrl, isCartConfigured, newPkce } from '@/lib/kroger/oauth';
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, backTo } from '@/lib/kroger/redirect';
import { seal } from '@/lib/kroger/vault';

/** Starts the Fred Meyer sign-in: keeps state and the PKCE verifier in a sealed cookie, then sends the shopper to Kroger. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get('next'));
  const sb = await createServerClient();
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL('/login', url.origin), 302);
  if (!isCartConfigured()) return NextResponse.redirect(backTo(url.origin, next, 'failed'), 302);

  try {
    const state = randomBytes(32).toString('base64url');
    const { verifier, challenge } = newPkce();
    const sealed = seal(JSON.stringify({ state, verifier, next, uid: data.user.id }), 'oauth');
    const target = fakeOn('KROGER_FAKE')
      ? new URL(`${OAUTH_COOKIE_PATH}?code=fake-code&state=${state}`, url.origin)
      : authorizeUrl(state, challenge);
    const res = NextResponse.redirect(target, 302);
    res.cookies.set(OAUTH_COOKIE, sealed, {
      httpOnly: true,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
      path: OAUTH_COOKIE_PATH,
      maxAge: 600,
    });
    return res;
  } catch {
    return NextResponse.redirect(backTo(url.origin, next, 'failed'), 302);
  }
}
