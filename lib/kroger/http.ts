import 'server-only';
import { forgetKrogerToken, getKrogerToken } from './token';

const API = 'https://api.kroger.com/v1';

/** GET a Kroger API path with the app token. Throws on any non-200 answer. */
export async function krogerGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = `${API}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${await getKrogerToken()}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (res.status === 401) forgetKrogerToken();
  if (!res.ok) throw new Error(`kroger ${path} ${res.status}`);
  return (await res.json()) as T;
}
