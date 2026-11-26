import { beforeEach, describe, expect, it, vi } from 'vitest';
import { braveSearch } from '@/lib/recipes/search/brave';

const fetchMock = vi.fn();
const reply = (urls: string[]) =>
  new Response(JSON.stringify({ web: { results: urls.map((url) => ({ url, title: 't' })) } }), { status: 200 });
const queryOf = (i: number) => new URL(String(fetchMock.mock.calls[i][0])).searchParams.get('q');

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  process.env.BRAVE_SEARCH_API_KEY = 'test-key';
});

describe('braveSearch', () => {
  it('sends one site-limited query and returns its hits when some are on the list', async () => {
    fetchMock.mockResolvedValueOnce(reply(['https://www.allrecipes.com/a', 'https://random.test/b']));
    const hits = await braveSearch.search('chicken tacos recipe', 20);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(queryOf(0)).toMatch(/^chicken tacos recipe \(site:allrecipes\.com OR site:foodnetwork\.com .* site:tasteofhome\.com\)$/);
    expect(queryOf(0)!.length).toBeLessThan(400);
    expect(hits).toHaveLength(2);
    expect(fetchMock.mock.calls[0][1].headers['x-subscription-token']).toBe('test-key');
  });

  it('retries once with the plain query when nothing on the list came back', async () => {
    fetchMock.mockResolvedValueOnce(reply(['https://random.test/a'])).mockResolvedValueOnce(reply(['https://delish.com/x']));
    const hits = await braveSearch.search('beef stew recipe', 20);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(queryOf(1)).toBe('beef stew recipe');
    expect(hits.map((h) => h.url)).toEqual(['https://delish.com/x']);
  });

  it('throws on an HTTP error without echoing the key', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 429 }));
    await expect(braveSearch.search('x', 5)).rejects.toThrow('HTTP 429');
  });
});
