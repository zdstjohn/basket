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
});
