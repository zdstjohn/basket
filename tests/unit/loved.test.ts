import { describe, expect, it } from 'vitest';
import { isMostLoved, lovedScore, ratingLine, sortByLoved } from '@/lib/recipes/search/loved';
import type { RecipeOption } from '@/lib/recipes/search/provider';

const opt = (o: Partial<RecipeOption> = {}): RecipeOption => ({
  source: 'sites', url: 'https://a.test/r', site: 'A', title: 'T', image: 'https://a.test/i.jpg',
  rating: null, ratingCount: null, likes: null, totalMinutes: null, servings: null, ingredients: [], structured: null, ...o,
});

describe('lovedScore', () => {
  it('lets 4.7 from 2000 people beat 5.0 from 3', () => {
    const many = lovedScore(opt({ rating: 4.7, ratingCount: 2000 }));
    const few = lovedScore(opt({ rating: 5, ratingCount: 3 }));
    expect(many).toBeGreaterThan(few);
    expect(many).toBeCloseTo((25 * 3.8 + 4.7 * 2000) / 2025, 6);
  });
  it('treats a rating with no count as one rating', () => {
    expect(lovedScore(opt({ rating: 4.7 }))).toBeCloseTo((25 * 3.8 + 4.7) / 26, 6);
  });
  it('maps likes onto the same scale, about 5.0 at 10,000', () => {
    expect(lovedScore(opt({ source: 'spoonacular', likes: 10000 }))).toBeCloseTo(5, 2);
    expect(lovedScore(opt({ likes: 100000 }))).toBe(5);
    expect(lovedScore(opt({ likes: 2340 }))).toBeCloseTo(3.8 + 1.2 * (Math.log10(2341) / 4), 6);
  });
  it('is 0 with no rating and no likes', () => {
    expect(lovedScore(opt())).toBe(0);
    expect(lovedScore(opt({ ratingCount: 500 }))).toBe(0);
    expect(lovedScore(opt({ likes: 0 }))).toBe(0);
  });
});

describe('sortByLoved', () => {
  it('orders by score and keeps the original order for ties and unrated', () => {
    const a = opt({ url: 'https://a.test/a' });
    const b = opt({ url: 'https://a.test/b', rating: 5, ratingCount: 3 });
    const c = opt({ url: 'https://a.test/c', rating: 4.7, ratingCount: 2000 });
    const d = opt({ url: 'https://a.test/d' });
    expect(sortByLoved([a, b, c, d]).map((o) => o.url.slice(-1))).toEqual(['c', 'b', 'a', 'd']);
  });
});

describe('isMostLoved', () => {
  it('needs score >= 4.5 and 50+ ratings, or 500+ likes', () => {
    expect(isMostLoved(opt({ rating: 4.7, ratingCount: 1203 }))).toBe(true);
    expect(isMostLoved(opt({ rating: 4.9, ratingCount: 49 }))).toBe(false);
    expect(isMostLoved(opt({ rating: 4.9 }))).toBe(false);
    expect(isMostLoved(opt({ rating: 4.0, ratingCount: 5000 }))).toBe(false);
    expect(isMostLoved(opt({ likes: 2340 }))).toBe(true);
    expect(isMostLoved(opt({ likes: 499 }))).toBe(false);
    expect(isMostLoved(opt())).toBe(false);
  });
});

describe('ratingLine', () => {
  it('formats stars with a thousands separator and plural', () => {
    expect(ratingLine(opt({ rating: 4.7, ratingCount: 1203 }))).toBe('★ 4.7 · 1,203 ratings');
  });
  it('uses the singular for one rating', () => {
    expect(ratingLine(opt({ rating: 5, ratingCount: 1 }))).toBe('★ 5.0 · 1 rating');
  });
  it('rounds to one decimal and drops a missing count', () => {
    expect(ratingLine(opt({ rating: 4.66 }))).toBe('★ 4.7');
  });
  it('shows likes', () => {
    expect(ratingLine(opt({ likes: 2340 }))).toBe('♥ 2,340 likes');
    expect(ratingLine(opt({ likes: 1 }))).toBe('♥ 1 like');
  });
  it('shows nothing without data', () => {
    expect(ratingLine(opt())).toBeNull();
  });
});
