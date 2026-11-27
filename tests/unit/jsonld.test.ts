import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractRecipeJsonLd } from '@/lib/recipes/jsonld';

const fx = (name: string) =>
  readFileSync(new URL(`../fixtures/recipes/${name}`, import.meta.url), 'utf8');

describe('extractRecipeJsonLd', () => {
  it('finds a Recipe inside an @graph array and reads all fields', () => {
    const r = extractRecipeJsonLd(fx('graph.html'));
    expect(r).toEqual({
      name: 'Graph Tacos',
      servings: 4,
      ingredients: ['1 lb chicken thighs', '12 corn tortillas'],
      steps: ['Cook the chicken.', 'Warm tortillas.'],
      image: 'https://img.example.test/graph.jpg',
      rating: 4.7,
      ratingCount: 1203,
      totalMinutes: 75,
    });
  });

  it('reads the Recipe from the second of two blocks; yield array and image array', () => {
    const r = extractRecipeJsonLd(fx('two-blocks.html'));
    expect(r?.name).toBe('Second Block Soup');
    expect(r?.servings).toBe(6);
    expect(r?.image).toBe('https://img.example.test/a.jpg');
    expect(r?.steps).toEqual(['Simmer.']);
  });

  it('takes the url of an ImageObject and a plain string image', () => {
    expect(extractRecipeJsonLd(fx('image-object.html'))?.image).toBe('https://img.example.test/pie.jpg');
    expect(extractRecipeJsonLd(fx('image-string.html'))?.image).toBe('https://img.example.test/stew.jpg');
  });

  it('returns null for a page with no Recipe', () => {
    expect(extractRecipeJsonLd(fx('no-recipe.html'))).toBeNull();
    expect(extractRecipeJsonLd('<html></html>')).toBeNull();
  });

  it('keeps reading after a malformed block', () => {
    const r = extractRecipeJsonLd(fx('malformed-first.html'));
    expect(r?.name).toBe('Survivor Salad');
    expect(r?.image).toBeNull();
    expect(r?.servings).toBeNull();
    expect(r?.rating).toBeNull();
    expect(r?.totalMinutes).toBeNull();
  });

  it('resolves relative image URLs against the page URL and drops non-http images', () => {
    const rel = '<script type="application/ld+json">{"@type":"Recipe","name":"R","image":"/img/a.jpg"}</script>';
    expect(extractRecipeJsonLd(rel, 'https://www.example.test/recipes/r')?.image).toBe('https://www.example.test/img/a.jpg');
    const bad = '<script type="application/ld+json">{"@type":"Recipe","name":"R","image":"javascript:alert(1)"}</script>';
    expect(extractRecipeJsonLd(bad, 'https://www.example.test/')?.image).toBeNull();
    const data = '<script type="application/ld+json">{"@type":"Recipe","name":"R","image":"data:image/png;base64,AAAA"}</script>';
    expect(extractRecipeJsonLd(data)?.image).toBeNull();
  });

  it('stays fast on hostile input (2 MB of unterminated <script )', () => {
    const t0 = performance.now();
    expect(extractRecipeJsonLd('<script '.repeat(2 * 1024 * 1024 / 8))).toBeNull();
    expect(extractRecipeJsonLd('<script type="application/ld+json" '.repeat(60_000))).toBeNull();
    expect(extractRecipeJsonLd('<script>'.repeat(260_000))).toBeNull();
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe('extractRecipeJsonLd images', () => {
  const page = (image: unknown) =>
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'X', image })}</script>`;

  it('prefers the widest ImageObject that states a width', () => {
    const r = extractRecipeJsonLd(
      page([
        { '@type': 'ImageObject', url: 'https://a.test/a.jpg', width: 400 },
        { '@type': 'ImageObject', url: 'https://a.test/b.jpg', width: 1600 },
      ]),
    );
    expect(r?.image).toBe('https://a.test/b.jpg');
  });

  it('reads widths given as strings', () => {
    const r = extractRecipeJsonLd(
      page([
        { '@type': 'ImageObject', url: 'https://a.test/a.jpg', width: '400' },
        { '@type': 'ImageObject', url: 'https://a.test/b.jpg', width: '1600 px' },
        { '@type': 'ImageObject', url: 'https://a.test/c.jpg', width: { '@type': 'QuantitativeValue', value: '900' } },
      ]),
    );
    expect(r?.image).toBe('https://a.test/b.jpg');
  });

  it('still returns the first of a list of plain strings', () => {
    const r = extractRecipeJsonLd(page(['https://a.test/a.jpg', 'https://a.test/b.jpg']));
    expect(r?.image).toBe('https://a.test/a.jpg');
  });
});
