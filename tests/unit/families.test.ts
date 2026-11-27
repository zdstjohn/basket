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

  // Fix round 1: every miss and false alarm from the review probe (wide reading, as an allergy list is read).
  it.each([
    ['tree nuts', '3 tbsp pinenuts'],
    ['tree nuts', '1/2 cup chopped nuts'],
    ['tree nuts', 'nuts, for garnish'],
    ['tree nuts', '1 cup unsweetened almondmilk'],
    ['fish', '1 lb monkfish'],
    ['fish', 'smoked whitefish'],
    ['fish', '2 branzino fillets'],
    ['fish', '1 lb grouper'],
    ['fish', '1 lb swai fillets'],
    ['fish', 'ahi steaks'],
    ['fish', '1 lb hake'],
    ['shellfish', '8 oz langostino tails'],
    ['shellfish', '1 lb cuttlefish'],
    ['milk', '1 cup half & half'],
    ['milk', '1/4 cup Mexican crema'],
    ['milk', 'crumbled cotija'],
    ['milk', '4 oz fontina'],
    ['milk', '1 cup curd'],
    ['milk', '2 cups whole or oat milk'],
    ['milk', '1/2 cup grated Gruyère'],
    ['milk', 'dulce de leche'],
    ['soy', '1 cup soymilk'],
    ['soy', '8 oz bean curd'],
    ['fish', '8 oz imitation crab'],
    ['fish', '6 crab sticks'],
    ['fish', '2 steelhead fillets'],
    ['wheat', '8 oz orecchiette'],
    ['wheat', '4 English muffins'],
    ['wheat', '1 lb rotelle'],
    ['soy', '2 tbsp liquid aminos'],
    ['soy', 'textured vegetable protein'],
    ['wheat', '1 cup breadcrumbs'],
    ['wheat', '1 lb fusilli'],
    ['wheat', '12 oz rotini'],
    ['wheat', '1 lb ziti'],
    ['wheat', '8 oz angel hair'],
    ['wheat', '1 baguette'],
    ['wheat', '4 flatbreads'],
    ['wheat', '1 sheet puff pastry'],
    ['wheat', 'wonton wrappers'],
    ['wheat', '1 cup all-purpose or almond flour'],
    ['peppers', '2 green chiles'],
    ['peppers', '1 jalapeño'],
  ])('%s is found in "%s"', (food, line) => expect(matchFood(food, line, { wide: true })).toMatchObject({ often: false }));
  it.each([
    ['tree nuts', 'amaretti cookies'],
    ['peanuts', '1/2 cup chopped nuts'],
    ['sesame', '1 tbsp zaatar'],
    ['sesame', 'everything but the bagel seasoning'],
    ['sesame', '1 tbsp furikake'],
    ['sesame', '2 tbsp dukkah'],
    ['shellfish', '2 tbsp red curry paste'],
    ['milk', '1 cup tzatziki'],
    ['eggs', 'bearnaise sauce'],
    ['soy', '2 tbsp oyster sauce'],
    ['eggs', '1/4 cup tartar sauce'],
    ['soy', '2 tbsp kecap manis'],
    ['soy', '1 tbsp gochujang'],
  ])('%s is often in "%s"', (food, line) => expect(matchFood(food, line, { wide: true })?.often).toBe(true));
  it.each([
    ['shellfish', 'oyster crackers'],
    ['milk', '1 bunch Swiss chard'],
    ['milk', '1 cup cashew cream'],
    ['milk', '1 lb romano beans'],
    ['milk', '2 oz cacao butter'],
  ])('%s is not found in "%s"', (food, line) => expect(matchFood(food, line, { wide: true })).toBeNull());

  // Typed allergies that name no family, read wide: what each one must catch.
  it.each([
    ['cashew nuts', '1 cup cashews'], ['cashew nuts', 'sliced almonds'], ['nuts', 'chopped walnuts'], ['nut', '1 cup pecans'],
    ['treenuts', '1/2 cup hazelnuts'], ['tree-nut', 'pine nuts'], ['macadamia nuts', '1/2 cup macadamias'],
    ['dairy', '1 cup milk'], ['dairy', '2 tbsp butter'], ['dairy', '4 oz cheddar'], ["cow's milk", '1 cup whole milk'],
    ['egg whites', '2 eggs'], ['sesame seeds', '2 tbsp tahini'], ['peanut butter', '1 cup peanuts'],
    ['shell fish', '1 lb shrimp'], ['seafood', '1 lb shrimp'], ['seafood', '2 salmon fillets'],
    ['gluten', '1 cup all-purpose flour'], ['gluten', '1 lb spaghetti'], ['gluten', '1 cup pearl barley'], ['gluten', '1 cup rye flour'],
    ['gluten', '1 bottle beer'], ['gluten', '2 tbsp malt vinegar'], ['gluten', '1 cup spelt'], ['gluten', 'triticale berries'],
    ['wheat flour', 'all-purpose flour'], ['soy beans', '14 oz firm tofu'], ['soy beans', 'shelled edamame'],
  ])('typed "%s" is found in "%s"', (food, line) => {
    expect(matchFood(food, line, { wide: true })).not.toBeNull();
  });
  it.each([
    ['cashew nuts', '1 can coconut milk'], ['cashew nuts', '1 butternut squash'], ['dairy', 'almond milk'], ['dairy', 'oat milk'],
    ['dairy', 'peanut butter'], ['almond milk', '1 cup whole milk'], ['egg whites', '1 eggplant'], ['seafood', 'oyster mushrooms'],
    ['gluten', 'buckwheat groats'], ['gluten', 'almond flour'], ['nuts', '1 nutmeg'],
  ])('typed "%s" is not found in "%s"', (food, line) => {
    expect(matchFood(food, line, { wide: true })).toBeNull();
  });
  it('typed allergies are read wide only: a won\'t-eat list stays exact', () => {
    expect(matchFood('cashew nuts', '1 cup cashews')).toBeNull();
    expect(matchFood('dairy', '1 cup milk')).toBeNull();
    expect(matchFood('nuts', 'chopped walnuts')).toBeNull();
    expect(matchFood('cashew nuts', '1 cup cashew nuts')?.found).toBe('cashew nuts');
  });
  it('a typed allergy that names no family still shows what it covers', () => {
    expect(coversLine('cashew nuts', { wide: true })).toBe('Tree nuts covers almonds, walnuts, pecans, cashews and the rest.');
    expect(coversLine('nuts', { wide: true })).toBe('Tree nuts covers almonds, walnuts, pecans, cashews and the rest.');
    expect(coversLine('dairy', { wide: true })).toBe('Milk covers cheese, butter, yogurt, cream and the rest.');
    expect(coversLine('cashew nuts')).toBeNull();
    expect(coversLine('seafood', { wide: true })).toContain('Shellfish covers');
    expect(coversLine('beets', { wide: true })).toBeNull();
  });
  it('"or" keeps the word that is still the real food', () => {
    expect(matchFood('milk', '2 cups whole or oat milk')?.found).toBe('milk');
    expect(matchFood('wheat', '1 cup all-purpose or almond flour')?.found).toBe('flour');
    expect(matchFood('milk', '1 cup oat milk')).toBeNull();
  });
  it('reads a decomposed accent the same as a composed one', () => {
    expect(rawWords('jalapen\u0303o')).toEqual(['jalapeño']);
    expect(matchFood('peppers', '1 jalapen\u0303o')?.found).toBe('jalapeño');
    expect(matchFood('milk', 'grated Gruye\u0300re')?.found).toBe('gruyère');
  });
  it('chiles and chilies are chile and chili, for won\'t-eat peppers too', () => {
    expect(words('green chiles and red chilies')).toEqual(['green', 'chile', 'and', 'red', 'chili']);
    expect(matchFood('peppers', '2 green chiles')?.often).toBe(false);
    expect(matchFood('peppers', '2 red chilies')?.often).toBe(false);
  });

  // Fix round 2
  it.each([
    ['dairy products', '1 cup milk'], ['all dairy', '2 tbsp butter'], ['gluten and dairy', '1 cup milk'],
    ['gluten and dairy', '1 lb spaghetti'], ['eggs and dairy', '2 large eggs'], ['eggs and dairy', '4 oz cheddar'],
    ['all shell fish', '1 lb shrimp'], ['gluten free dairy free', '1 cup milk'], ['no gluten', '1 cup rye flour'],
  ])('typed "%s" is found in "%s" (aliases read inside longer text)', (food, line) => {
    expect(matchFood(food, line, { wide: true })).not.toBeNull();
  });
  it('"all shell fish" is shellfish, never fish', () => {
    expect(matchFood('all shell fish', '2 salmon fillets', { wide: true })).toBeNull();
    expect(coversLine('all shell fish', { wide: true })).toBe('Shellfish covers shrimp, crab, lobster, scallops and the rest.');
    expect(coversLine('dairy products', { wide: true })).toBe('Milk covers cheese, butter, yogurt, cream and the rest.');
  });
  it.each([
    ['milk', 'almond or oat milk'], ['milk', 'water or coconut milk'], ['milk', 'jam or peanut butter'],
    ['wheat', 'lettuce wraps or corn tortillas'], ['wheat', 'zucchini or rice noodles'],
    ['tree nuts', 'bamboo shoots or water chestnuts'], ['beans', 'asparagus or green beans'], ['milk', '8 oz bean curd'],
  ])('%s is not found in "%s"', (food, line) => expect(matchFood(food, line, { wide: true })).toBeNull());
  it.each([
    ['milk', 'whole or oat milk'], ['milk', 'skim or almond milk'], ['milk', 'low-fat or coconut milk'],
    ['milk', "cow's or oat milk"], ['wheat', 'all-purpose or almond flour'], ['wheat', 'white or rice flour'],
  ])('%s is still found in "%s"', (food, line) => expect(matchFood(food, line, { wide: true })).not.toBeNull());
  it('chillies is chili', () => expect(words('2 red chillies')).toEqual(['red', 'chili']));
});
