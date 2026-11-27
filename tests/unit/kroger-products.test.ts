import { beforeEach, describe, expect, it, vi } from 'vitest';
import chicken from '../fixtures/kroger/products-chicken-thighs.json';
import locations from '../fixtures/kroger/locations-98402.json';

vi.mock('@/lib/kroger/token', async (orig) => ({
  ...(await orig<typeof import('@/lib/kroger/token')>()),
  getKrogerToken: async () => 'tok',
}));

import { findLocations } from '@/lib/kroger/locations';
import { searchProducts, toCandidates } from '@/lib/kroger/products';

const fetchMock = vi.fn();
const reply = (body: unknown) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('KROGER_FAKE', '');
  vi.stubEnv('KROGER_CLIENT_ID', 'id');
  vi.stubEnv('KROGER_CLIENT_SECRET', 'secret');
  fetchMock.mockReset();
});

describe('searchProducts', () => {
  it('calls the products endpoint for the term and store', async () => {
    reply(chicken);
    await searchProducts('boneless chicken thighs', '70100390');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://api.kroger.com/v1/products');
    expect(u.searchParams.get('filter.term')).toBe('boneless chicken thighs');
    expect(u.searchParams.get('filter.locationId')).toBe('70100390');
    expect(u.searchParams.get('filter.limit')).toBe('20');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('gives the products request a timeout', async () => {
    reply(chicken);
    await searchProducts('boneless chicken thighs', '70100390');
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal);
  });

  it('returns no products for no results', async () => {
    reply({ data: [] });
    expect(await searchProducts('unobtainium', '1')).toEqual([]);
  });

  it('throws when Kroger answers with an error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('no', { status: 500 }));
    await expect(searchProducts('rice', '1')).rejects.toThrow();
  });
});

describe('findLocations', () => {
  it('lists Fred Meyer first, then the other chains', async () => {
    reply(locations);
    const list = await findLocations('98402');
    const [url] = fetchMock.mock.calls[0] as [string];
    const u = new URL(url);
    expect(u.pathname).toBe('/v1/locations');
    expect(u.searchParams.get('filter.zipCode.near')).toBe('98402');
    expect(u.searchParams.get('filter.limit')).toBe('10');
    expect(list.map((l) => l.id)).toEqual(['70100390', '70100112', '01400376']);
    expect(list[0]).toEqual({
      id: '70100390', name: 'Fred Meyer - Tacoma-Stevens', chain: 'FRED', address: '1901 S 72nd St, Tacoma, WA 98408',
    });
  });
});

describe('KROGER_FAKE=1', () => {
  it('serves fixtures and never touches the network or the token', async () => {
    vi.stubEnv('KROGER_FAKE', '1');
    vi.stubEnv('KROGER_CLIENT_ID', '');
    const locs = await findLocations('98402');
    expect(locs[0]).toMatchObject({ id: '70100390', name: 'Fred Meyer - Tacoma-Stevens' });
    const found = toCandidates(await searchProducts('boneless chicken thighs', '70100390'), 'boneless chicken thighs');
    expect(found[0]?.name).toBe('Heritage Farm Boneless Skinless Chicken Thighs');
    expect(found[0]?.imageUrl).toMatch(/^https:\/\/www\.kroger\.com\//);
    expect(await searchProducts('unobtainium', '70100390')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
