import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { fakeOn } from '@/lib/fake';
import { isVaultConfigured } from './vault';

const AUTHORIZE_URL = 'https://api.kroger.com/v1/connect/oauth2/authorize';
const TOKEN_URL = 'https://api.kroger.com/v1/connect/oauth2/token';
const PROFILE_URL = 'https://api.kroger.com/v1/identity/profile';
const SCOPE = 'cart.basic:write profile.compact';
const TIMEOUT_MS = 10_000;
const FAKE_LIFE_MS = 30 * 60_000;

export interface UserTokens {
  access: string;
  /** Milliseconds since the epoch. */
  accessExp: number;
  refresh: string;
}

/** Whether a shopper can connect and the cart can be filled: the fakes, or keys, vault and redirect all set. */
export const isCartConfigured = (): boolean =>
  fakeOn('KROGER_FAKE') ||
  Boolean(
    process.env.KROGER_CLIENT_ID &&
      process.env.KROGER_CLIENT_SECRET &&
      isVaultConfigured() &&
      process.env.KROGER_REDIRECT_URI,
  );

/** PKCE: 32 random bytes, and the S256 challenge made from them. */
export function newPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/** Kroger's sign-in page for this shopper. The redirect address comes from the environment, never from the request. */
export function authorizeUrl(state: string, challenge: string): string {
  const params: [string, string][] = [
    ['scope', SCOPE],
    ['response_type', 'code'],
    ['client_id', process.env.KROGER_CLIENT_ID ?? ''],
    ['redirect_uri', process.env.KROGER_REDIRECT_URI ?? ''],
    ['state', state],
    ['code_challenge', challenge],
    ['code_challenge_method', 'S256'],
  ];
  if (process.env.KROGER_BANNER) params.push(['banner', process.env.KROGER_BANNER]);
  return `${AUTHORIZE_URL}?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

const fakeTokens = (): UserTokens => ({ access: 'fake-access', refresh: 'fake-refresh', accessExp: Date.now() + FAKE_LIFE_MS });

/** One call to the token endpoint. Failures say only the status: never the answer, the code or a token. */
async function tokenCall(form: Record<string, string>): Promise<Response> {
  const id = process.env.KROGER_CLIENT_ID;
  const secret = process.env.KROGER_CLIENT_SECRET;
  if (!id || !secret) throw new Error('kroger not configured');
  return fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(form).toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function readTokens(res: Response, oldRefresh?: string): Promise<UserTokens> {
  let body: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new Error('kroger token unreadable');
  }
  const refresh = typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : oldRefresh;
  if (typeof body.access_token !== 'string' || !body.access_token || typeof body.expires_in !== 'number' || !refresh) {
    throw new Error('kroger token unreadable');
  }
  return { access: body.access_token, refresh, accessExp: Date.now() + body.expires_in * 1000 };
}

/** Trades the one-time code (and the PKCE verifier) for the shopper's tokens. */
export async function exchangeCode(code: string, verifier: string): Promise<UserTokens> {
  if (fakeOn('KROGER_FAKE')) return fakeTokens();
  const res = await tokenCall({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.KROGER_REDIRECT_URI ?? '',
    code_verifier: verifier,
  });
  if (!res.ok) throw new Error(`kroger token ${res.status}`);
  return readTokens(res);
}

/**
 * New tokens from a refresh token. 'refused' only when Kroger says the refresh token itself is dead (error invalid_grant).
 * 'rejected' for any other 4xx (a wrong client secret, say): our setup is at fault, not the link. Throws on network or 5xx.
 */
export async function refreshTokens(refresh: string): Promise<UserTokens | 'refused' | 'rejected'> {
  if (fakeOn('KROGER_FAKE')) return fakeTokens();
  const res = await tokenCall({ grant_type: 'refresh_token', refresh_token: refresh });
  if (res.status >= 400 && res.status < 500) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    return body?.error === 'invalid_grant' ? 'refused' : 'rejected';
  }
  if (!res.ok) throw new Error(`kroger token ${res.status}`);
  return readTokens(res, refresh);
}

/** The shopper's Kroger profile id, or null for any problem. */
export async function fetchProfileId(access: string): Promise<string | null> {
  if (fakeOn('KROGER_FAKE')) return 'fake-profile';
  try {
    const res = await fetch(PROFILE_URL, {
      headers: { Authorization: `Bearer ${access}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const id = ((await res.json()) as { data?: { id?: unknown } }).data?.id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}
