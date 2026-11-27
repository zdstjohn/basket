import { describe, expect, it } from 'vitest';
import beans from '../fixtures/kroger/products-black-beans.json';
import chicken from '../fixtures/kroger/products-chicken-thighs.json';
import outOfStock from '../fixtures/kroger/products-out-of-stock.json';
import { toCandidates, type KrogerProduct } from '@/lib/kroger/products';

const item = (over: Record<string, unknown> = {}) => ({
  itemId: 'i', size: '16 oz', soldBy: 'UNIT', price: { regular: 2, promo: 0 }, ...over,
});
const product = (over: Partial<KrogerProduct> = {}): KrogerProduct => ({
  productId: '0003333000001', upc: '0003333000001', description: 'Rice', images: [], items: [item()], ...over,
});

describe('toCandidates', () => {
  it('turns the chicken fixture into two candidates', () => {
    const c = toCandidates(chicken.data as KrogerProduct[], 'boneless chicken thighs');
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({
      upc: '0020000000001', soldBy: 'WEIGHT', regularCents: 399, promoCents: null, sizeText: '1 lb',
      relevant: true, inStock: true,
    });
  });

  it('uses the productId when there is no upc, and skips anything that is not 13 digits', () => {
    const c = toCandidates(
      [
        product({ upc: undefined, productId: '0003333000002' }),
        product({ upc: undefined, productId: 'abc' }),
        product({ upc: '123', productId: '0003333000003' }),
      ],
      'rice',
    );
    expect(c.map((x) => x.upc)).toEqual(['0003333000002']);
  });

  it('skips products with no description or no price above 0', () => {
    const c = toCandidates(
      [
        product({ description: undefined }),
        product({ items: [item({ price: { regular: 0, promo: 0 } })] }),
        product({ items: [] }),
      ],
      'rice',
    );
    expect(c).toEqual([]);
  });

  it('keeps promo only when it is above 0 and under regular', () => {
    const at = (promo: number) => toCandidates([product({ items: [item({ price: { regular: 4, promo } })] })], 'rice')[0];
    expect(at(3)).toMatchObject({ regularCents: 400, promoCents: 300 });
    expect(at(0).promoCents).toBeNull();
    expect(at(4).promoCents).toBeNull();
    expect(at(5).promoCents).toBeNull();
  });

  it('uses the first priced item', () => {
    const c = toCandidates(
      [product({ items: [item({ price: { regular: 0 } }), item({ size: '1 gal', price: { regular: 5.49 } }), item({ size: '2 gal', price: { regular: 9 } })] })],
      'milk',
    );
    expect(c[0]).toMatchObject({ regularCents: 549, sizeText: '1 gal' });
    expect(c[0].size).toEqual({ amount: 3785.411784, kind: 'volume', base: 'ml' });
  });

  it('reads a fractional size, and an absent size is empty text and no size', () => {
    const half = toCandidates([product({ items: [item({ size: '1/2 gal' })] })], 'milk')[0];
    expect(half.size?.amount).toBeCloseTo(1892.705892);
    const none = toCandidates([product({ items: [{ itemId: 'i', soldBy: 'UNIT', price: { regular: 2 } }] })], 'milk')[0];
    expect(none).toMatchObject({ sizeText: '', size: null });
  });

  it('marks only a temporarily-out-of-stock item as not in stock', () => {
    const c = toCandidates(outOfStock.data as KrogerProduct[], 'whole milk yogurt');
    expect(c.map((x) => x.inStock)).toEqual([false, true]);
    expect(toCandidates([product({ items: [item({ inventory: { stockLevel: 'LOW' } })] })], 'rice')[0].inStock).toBe(true);
  });

  it('keeps at most ten, in the order Kroger gave', () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      product({ upc: `00044440000${10 + i}`, description: `Rice ${i}` }),
    );
    const c = toCandidates(many, 'rice');
    expect(c).toHaveLength(10);
    expect(c[0].name).toBe('Rice 0');
    expect(c[9].name).toBe('Rice 9');
  });

  it('marks relevant only the names with every word of the term', () => {
    const c = toCandidates(beans.data as KrogerProduct[], 'organic black beans');
    expect(c.map((x) => [x.name, x.relevant])).toEqual([
      ['Kroger Pinto Beans', false],
      ['Simple Truth Organic Black Beans', true],
      ['Private Selection Black Bean Dip', false],
    ]);
  });
});
