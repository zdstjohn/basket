import 'server-only';
import type { SearchHit, WebSearchProvider } from './provider';

interface BraveResponse {
  web?: { results?: { url?: unknown; title?: unknown }[] };
}

export const braveSearch: WebSearchProvider = {
  async search(query, count) {
    const key = process.env.BRAVE_SEARCH_API_KEY;
    if (!key) throw new Error('BRAVE_SEARCH_API_KEY is not set');
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(Math.min(count, 20)));
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'x-subscription-token': key },
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Brave search failed: HTTP ${res.status}`);
    const body = (await res.json()) as BraveResponse;
    const hits: SearchHit[] = [];
    for (const r of body.web?.results ?? []) {
      if (typeof r.url === 'string' && typeof r.title === 'string') hits.push({ url: r.url, title: r.title });
    }
    return hits;
  },
};
