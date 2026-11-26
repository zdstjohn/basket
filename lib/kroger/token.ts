import 'server-only';

export class KrogerNotConfigured extends Error {
  constructor() {
    super('kroger_not_configured');
    this.name = 'KrogerNotConfigured';
  }
}

export const isKrogerFake = (): boolean => process.env.KROGER_FAKE === '1';

/** Whether Kroger calls can be made at all: credentials are set, or the fixtures stand in (KROGER_FAKE=1). */
export const isKrogerConfigured = (): boolean =>
  isKrogerFake() || Boolean(process.env.KROGER_CLIENT_ID && process.env.KROGER_CLIENT_SECRET);

const TOKEN_URL = 'https://api.kroger.com/v1/connect/oauth2/token';
const EARLY_MS = 60_000;
const TIMEOUT_MS = 5000;

let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null;

async function fetchToken(): Promise<string> {
  const id = process.env.KROGER_CLIENT_ID;
  const secret = process.env.KROGER_CLIENT_SECRET;
  if (!id || !secret) throw new KrogerNotConfigured();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=product.compact',
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`kroger token ${res.status}`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token || typeof body.expires_in !== 'number') throw new Error('kroger token unreadable');
  cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

/** The app's Kroger access token (no shopper sign-in), kept in memory until a minute before it expires. */
export async function getKrogerToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - EARLY_MS) return cached.token;
  inflight ??= fetchToken().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Forget the token, so the next call asks for a new one (after Kroger refuses it). */
export function forgetKrogerToken(): void {
  cached = null;
}
