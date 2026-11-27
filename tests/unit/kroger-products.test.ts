import { beforeEach, describe, expect, it, vi } from 'vitest';
import beans from '../fixtures/kroger/products-black-beans.json';
import chicken from '../fixtures/kroger/products-chicken-thighs.json';
import eggs from '../fixtures/kroger/products-eggs.json';
import milk from '../fixtures/kroger/products-milk.json';
import locations from '../fixtures/kroger/locations-98402.json';

vi.mock('@/lib/kroger/token', async (orig) => ({
  ...(await orig<typeof import('@/lib/kroger/token')>()),
  getKrogerToken: async () => 'tok',
}));

import { findLocations } from '@/lib/kroger/locations';
import { priceFor } from '@/lib/kroger/products';

const fetchMock = vi.fn();
const reply = (body: unknown) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('KROGER_FAKE', '');
  vi.stubEnv('KROGER_CLIENT_ID', 'id');
  vi.stubEnv('KROGER_CLIENT_SECRET', 'secret');
  fetchMock.mockReset();
});

describe('priceFor', () => {
  it('calls the products endpoint for the term and store', async () => {
    reply(chicken);
    await priceFor('boneless chicken thighs', 'mass', '70100390');
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
    await priceFor('boneless chicken thighs', 'mass', '70100390');
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal);
  });

  it('prices weight-sold meat per pound as mass, with the front small image', async () => {
    reply(chicken);
    const r = await priceFor('boneless chicken thighs', 'mass', '70100390');
    expect(r).toEqual({
      centsPerBase: 399 / 453.59237,
      productName: 'Heritage Farm Boneless Skinless Chicken Thighs',
      onSale: false,
      imageUrl: 'https://www.kroger.com/product/images/small/front/0020000000001',
    });
  });

  it('compares per unit across products and pack sizes', async () => {
    reply(milk);
    const r = await priceFor('milk', 'volume', '1');
    // Each product's first priced item counts: the half gallon at $3.49 beats the promo 32 oz at $2.49.
    expect(r?.centsPerBase).toBeCloseTo(349 / (64 * 29.5735296));
    expect(r?.onSale).toBe(false);
  });

  it('uses the promo price over regular, marks it on sale, and falls back to the thumbnail image', async () => {
    reply({ data: [milk.data[1]] });
    const r = await priceFor('milk', 'volume', '1');
    expect(r).toMatchObject({
      onSale: true,
      productName: 'Kroger Vitamin D Whole Milk',
      imageUrl: 'https://www.kroger.com/product/images/thumbnail/front/0001111041702',
    });
    expect(r?.centsPerBase).toBeCloseTo(249 / (32 * 29.5735296));
  });

  it('picks the cheaper larger pack per unit', async () => {
    reply(eggs);
    const r = await priceFor('eggs', 'count', '1');
    expect(r?.centsPerBase).toBeCloseTo(519 / 18); // 28.8 beats 33.25
    expect(r?.productName).toBe('Kroger Grade A Large White Eggs Bulk');
  });

  it('converts between kinds by density and typical item weight, and is null only without a size', async () => {
    reply(chicken);
    expect(await priceFor('boneless chicken thighs', 'count', '1')).not.toBeNull();
    reply(eggs);
    expect(await priceFor('eggs', 'mass', '1')).not.toBeNull();
    reply({ data: [{ productId: '0003333000001', upc: '0003333000001', description: 'Rice', items: [{ soldBy: 'UNIT', price: { regular: 3 } }] }] });
    expect(await priceFor('rice', 'mass', '1')).toBeNull();
  });

  it('prefers results whose description has every word of the name', async () => {
    reply(beans);
    const r = await priceFor('black beans', 'mass', '1');
    expect(r?.productName).toBe('Simple Truth Organic Black Beans');
  });

  it('tolerates singular and plural', async () => {
    reply(beans);
    const r = await priceFor('black bean', 'mass', '1');
    expect(r?.productName).toBe('Simple Truth Organic Black Beans');
    reply(chicken);
    const t = await priceFor('chicken thigh', 'mass', '1');
    expect(t?.productName).toBe('Heritage Farm Boneless Skinless Chicken Thighs');
  });

  it('falls back to the first three results when none match the words', async () => {
    reply(beans);
    const r = await priceFor('quinoa', 'mass', '1');
    expect(r?.productName).toBe('Kroger Pinto Beans');
  });

  it('ignores items with no price, and images off www.kroger.com', async () => {
    reply({
      data: [
        {
          productId: '1', upc: '0003333000001', description: 'Rice', brand: 'x',
          images: [{ perspective: 'front', featured: true, sizes: [{ size: 'small', url: 'http://www.kroger.com/a.jpg' }] }],
          items: [{ itemId: '1', size: '2 lb', soldBy: 'UNIT', price: { regular: 0, promo: 0 } }, { itemId: '2', size: '2 lb', soldBy: 'UNIT', price: { regular: 3, promo: 0 } }],
        },
        {
          productId: '2', upc: '0003333000002', description: 'Rice Bulk', brand: 'x',
          images: [{ perspective: 'front', featured: true, sizes: [{ size: 'small', url: 'https://evil.example/a.jpg' }] }],
          items: [{ itemId: '3', size: '5 lb', soldBy: 'UNIT' }],
        },
      ],
    });
    const r = await priceFor('rice', 'mass', '1');
    expect(r).toMatchObject({ productName: 'Rice', imageUrl: null });
    expect(r?.centsPerBase).toBeCloseTo(300 / (2 * 453.59237));
  });

  it('returns null for no results', async () => {
    reply({ data: [] });
    expect(await priceFor('unobtainium', 'mass', '1')).toBeNull();
  });

  it('throws when Kroger answers with an error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('no', { status: 500 }));
    await expect(priceFor('rice', 'mass', '1')).rejects.toThrow();
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
    const r = await priceFor('boneless chicken thighs', 'mass', '70100390');
    expect(r?.productName).toBe('Heritage Farm Boneless Skinless Chicken Thighs');
    expect(r?.imageUrl).toMatch(/^https:\/\/www\.kroger\.com\//);
    expect(await priceFor('unobtainium', 'mass', '70100390')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
