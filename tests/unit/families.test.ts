import { describe, expect, it } from 'vitest';
import {
  COMMON_ALLERGENS, FAMILIES, cleanFood, coversLine, familyFor, matchFood, swapIdeas,
} from '@/lib/domain/families';
import { rawWords, words } from '@/lib/domain/words';

describe('food families', () => {
  // flagged, not "often"
  it.each([
    ['mushrooms', '8 oz cremini mushrooms', 'cremini mushrooms'],
    ['mushrooms', '2 portobello caps', 'portobello'],
    ['mushrooms', 'shiitake', 'shiitake'],
    ['tree nuts', '1/4 cup sliced almonds', 'almonds'],
    ['tree nuts', '2 cups almond flour', 'almond'],
    ['tree nuts', '3 tbsp pine nuts', 'pine nuts'],
    ['tree nuts', 'chopped walnuts', 'walnuts'],
    ['tree nuts', '1 cup cashews', 'cashews'],
    ['peanuts', '2 tbsp peanut butter', 'peanut'],
    ['milk', '1 cup whole milk', 'milk'],
    ['milk', '2 tbsp ghee', 'ghee'],
    ['milk', '4 oz brie', 'brie'],
    ['milk', 'grated parmesan', 'parmesan'],
    ['eggs', '2 large eggs', 'eggs'],
    ['wheat', '1 lb spaghetti', 'spaghetti'],
    ['wheat', '2 cups all-purpose flour', 'flour'],
    ['soy', '14 oz firm tofu', 'tofu'],
    ['fish', '2 anchovy fillets', 'anchovy'],
    ['shellfish', '1 lb shrimp', 'shrimp'],
    ['sesame', '2 tbsp tahini', 'tahini'],
  ])('%s is found in "%s"', (food, line, found) => {
    expect(matchFood(food, line)).toEqual({ found, often: false });
  });
  // flagged as "often has"
  it.each([
    ['tree nuts', '1/2 cup pesto'], ['tree nuts', 'marzipan'], ['fish', '1 tbsp worcestershire sauce'],
    ['wheat', '2 tbsp soy sauce'], ['eggs', '1/4 cup mayonnaise'], ['sesame', '1 cup hummus'], ['shellfish', 'oyster sauce'],
  ])('%s is often in "%s"', (food, line) => expect(matchFood(food, line)?.often).toBe(true));
  // never flagged
  it.each([
    ['tree nuts', '1 butternut squash'], ['tree nuts', '1/4 tsp nutmeg'], ['tree nuts', '1 can coconut milk'],
    ['tree nuts', 'water chestnuts'], ['tree nuts', '2 tbsp peanut butter'], ['tree nuts', '1 doughnut'],
    ['peanuts', 'sliced almonds'], ['milk', '1 can coconut milk'], ['milk', 'almond milk'], ['milk', 'oat milk'],
    ['milk', 'peanut butter'], ['milk', 'cream of tartar'], ['milk', 'butternut squash'], ['milk', 'butter lettuce'],
    ['eggs', '1 eggplant'], ['wheat', 'buckwheat groats'], ['wheat', 'almond flour'], ['wheat', 'corn tortillas'],
    ['wheat', 'rice noodles'], ['shellfish', 'oyster mushrooms'], ['fish', 'goldfish crackers'], ['mushrooms', 'cream of chicken soup'],
  ])('%s is not found in "%s"', (food, line) => expect(matchFood(food, line)).toBeNull());

  it('matches a typed food outside the table as whole words, singular or plural', () => {
    expect(matchFood('beets', '3 medium beets')).toEqual({ found: 'beets', often: false });
    expect(matchFood('beet', '3 medium beets')?.found).toBe('beets');
    expect(matchFood('beets', 'beetroot powder')).toBeNull();
  });
  it('finds a family from any of its names', () => {
    for (const f of ['mushroom', 'Mushrooms', 'cremini']) expect(familyFor(f)?.id).toBe('mushroom');
    for (const f of ['tree nuts', 'tree nut', 'almonds', 'pecan']) expect(familyFor(f)?.id).toBe('tree_nut');
    expect(familyFor('beets')).toBeNull();
  });
  it('spells out what a family covers', () => {
    expect(coversLine('Mushroom')).toBe('Mushrooms covers cremini, portobello, shiitake and the rest.');
    expect(coversLine('tree nuts')).toBe('Tree nuts covers almonds, walnuts, pecans, cashews and the rest.');
    expect(coversLine('beets')).toBeNull();
  });
  it('offers up to three swap ideas, none in the same family, and none at all for an allergen', () => {
    expect(swapIdeas('mushrooms')).toEqual([
      { canonical: 'zucchini', amountPerServing: 0.25, unit: 'each', role: 'produce' },
      { canonical: 'white beans', amountPerServing: 0.25, unit: 'cup', role: 'veg_protein' },
      { canonical: 'carrots', amountPerServing: 0.5, unit: 'each', role: 'produce' },
    ]);
    expect(swapIdeas('beets')).toEqual([]);
    for (const a of COMMON_ALLERGENS) expect(swapIdeas(a)).toEqual([]);
    const first = (plural: string) => swapIdeas(plural)[0];
    expect(first('olives')).toEqual({ canonical: 'capers', amountPerServing: 0.5, unit: 'tbsp', role: 'pantry' });
    expect(first('onions')).toEqual({ canonical: 'celery', amountPerServing: 0.5, unit: 'each', role: 'produce' });
    expect(first('peppers')).toEqual({ canonical: 'zucchini', amountPerServing: 0.25, unit: 'each', role: 'produce' });
    expect(first('tomatoes')).toEqual({ canonical: 'carrots', amountPerServing: 0.5, unit: 'each', role: 'produce' });
    expect(first('cilantro')).toEqual({ canonical: 'parsley', amountPerServing: 0.1, unit: 'bunch', role: 'produce' });
    expect(first('beans')).toEqual({ canonical: 'lentils', amountPerServing: 0.25, unit: 'cup', role: 'veg_protein' });
    for (const f of FAMILIES) {
      expect(swapIdeas(f.plural).length).toBeLessThanOrEqual(3);
      for (const i of swapIdeas(f.plural)) expect(matchFood(f.plural, i.canonical)).toBeNull();
    }
  });
  it('cleans what is typed', () => {
    expect(cleanFood('  Tree   Nuts ')).toBe('tree nuts');
    expect(cleanFood('   ')).toBeNull();
    expect(cleanFood('x'.repeat(41))).toBeNull();
  });
  it('lists the nine common allergens, each with a family', () => {
    expect(COMMON_ALLERGENS).toEqual(['peanuts', 'tree nuts', 'milk', 'eggs', 'wheat', 'soy', 'fish', 'shellfish', 'sesame']);
    for (const a of COMMON_ALLERGENS) expect(familyFor(a)).not.toBeNull();
  });
  // added by the revision
  it.each([
    ['peppers', '1/2 tsp black pepper'], ['peppers', 'salt and pepper'], ['beans', '1 vanilla bean'],
    ['milk', '1 cup soy milk'], ['milk', '2 tbsp almond butter'], ['wheat', '1 cup rice flour'],
  ])('%s is not found in "%s" either', (food, line) => expect(matchFood(food, line)).toBeNull());
  it('a real member beside a prepared food wins over "often"', () => {
    expect(matchFood('tree nuts', '1/2 cup pesto with pine nuts')).toEqual({ found: 'pine nuts', often: false });
    expect(matchFood('peppers', '1 red bell pepper')?.often).toBe(false);
  });
  it('one member on its own is matched as typed, and as its family only when asked wide', () => {
    expect(matchFood('cheddar', '4 oz sharp cheddar')).toEqual({ found: 'cheddar', often: false });
    expect(matchFood('cheddar', '1 cup whole milk')).toBeNull();
    expect(matchFood('cheddar', '1 cup whole milk', { wide: true })).toEqual({ found: 'milk', often: false });
    expect(matchFood('almonds', '1/2 cup pesto', { wide: true })?.often).toBe(true);
    expect(coversLine('cheddar')).toBeNull();
    expect(coversLine('almonds', { wide: true })).toBe('Tree nuts covers almonds, walnuts, pecans, cashews and the rest.');
  });
  it('keeps the words as written', () => {
    expect(rawWords('8 oz Cremini Mushrooms')).toEqual(['oz', 'cremini', 'mushrooms']);
    expect(words('8 oz Cremini Mushrooms')).toEqual(['oz', 'cremini', 'mushroom']);
  });

  // Beyond the pinned table: the data itself stays consistent.
  it('every example in a "covers" line is a member of its family', () => {
    for (const f of FAMILIES) {
      expect(f.examples.length).toBeGreaterThanOrEqual(3);
      expect(f.examples.length).toBeLessThanOrEqual(4);
      for (const e of f.examples) expect(matchFood(f.plural, e)?.often, `${f.id}: ${e}`).toBe(false);
    }
  });
  it('no food is a member of two families', () => {
    const seen = new Map<string, string>();
    for (const f of FAMILIES) {
      for (const m of f.members) {
        const key = words(m).join(' ');
        expect(seen.get(key), `${m} in ${f.id} and ${seen.get(key)}`).toBeUndefined();
        seen.set(key, f.id);
      }
    }
  });
  it('olive oil is not an olive, and a bare "pepper" is not a pepper', () => {
    expect(matchFood('olives', '2 tbsp extra virgin olive oil')).toBeNull();
    expect(matchFood('olives', '1/2 cup kalamata olives')?.found).toBe('kalamata olives');
    expect(matchFood('peppers', '1 pepper, diced')).toBeNull();
    expect(matchFood('peppers', '1 jalapeño')?.found).toBe('jalapeño');
  });
});
