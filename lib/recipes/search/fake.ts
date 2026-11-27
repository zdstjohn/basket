import { soup } from '@/lib/fixtures/soup';
import { tacos } from '@/lib/fixtures/tacos';
import type { RecipeOption, SearchHit, WebSearchProvider } from './provider';

const img = (name: string) => `https://images.example.test/${name}.jpg`;

const base = {
  rating: null, ratingCount: null, likes: null, totalMinutes: 30, servings: 4, structured: null,
} satisfies Partial<RecipeOption>;

const SITES: Record<string, RecipeOption[]> = {
  tacos: [
    {
      ...base, source: 'sites', url: 'https://www.allrecipes.com/recipe/fake-chicken-tacos', site: 'Allrecipes',
      title: 'Chicken tacos', image: img('tacos'), rating: 4.7, ratingCount: 1203,
      ingredients: ['1 lb boneless chicken thighs', '12 corn tortillas', '1 yellow onion'],
    },
    {
      ...base, source: 'sites', url: 'https://www.budgetbytes.com/fake-taco-bowls', site: 'Budget Bytes',
      title: 'Easy taco bowls', image: img('taco-bowls'), ingredients: ['1 lb ground beef', '1 cup rice', '1 cup cooked chicken'],
    },
  ],
  'beef stew': [
    {
      ...base, source: 'sites', url: 'https://www.budgetbytes.com/fake-beef-stew', site: 'Budget Bytes',
      title: 'Beef stew', image: img('beef-stew'), totalMinutes: 120,
      ingredients: ['2 lb beef chuck', '4 potatoes', '3 carrots'],
    },
  ],
  'pot pie': [
    {
      ...base, source: 'sites', url: 'https://www.tasteofhome.com/recipes/fake-pot-pie', site: 'Taste of Home',
      title: 'Chicken pot pie', image: img('pot-pie'), totalMinutes: 70,
      ingredients: ['2 cups cooked chicken', '1 pie crust', '1 cup frozen peas and carrots'],
    },
  ],
};

const SPOON: Record<string, RecipeOption[]> = {
  tacos: [
    {
      ...base, source: 'spoonacular', url: 'https://www.example-kitchen.test/sheet-pan-tacos', site: 'Example Kitchen',
      title: 'Sheet pan chicken tacos', image: img('sheet-pan-tacos'), likes: 340,
      ingredients: ['1 lb boneless chicken thighs', '12 corn tortillas', '1 yellow onion'],
      structured: tacos.ingredients,
    },
  ],
  // Both carry structured lines, so a draft built from them keeps these ingredients (the AI fake answers tacos lines).
  // With no SITES entry a Big sites search for "soup" or "pesto" falls back to them, as "lasagna" does.
  soup: [
    {
      ...base, source: 'spoonacular', url: 'https://www.budgetbytes.com/fake-white-bean-mushroom-soup', site: 'Budget Bytes',
      title: 'White bean and mushroom soup', image: img('bean-soup'), likes: 512, totalMinutes: 40,
      ingredients: ['8 oz cremini mushrooms', '2 cans white beans', '1 yellow onion'],
      structured: soup.ingredients,
    },
    {
      ...base, source: 'spoonacular', url: 'https://www.example-kitchen.test/broccolini-quinoa-pilaf', site: 'Example Kitchen',
      title: 'Broccolini quinoa pilaf with toasted almonds', image: img('quinoa-pilaf'), likes: 208, totalMinutes: 30,
      ingredients: ['1 cup quinoa', '2 bunches broccolini', '1/4 cup sliced almonds', '1 lemon'],
      structured: [
        { canonical: 'quinoa', amount: 1, unit: 'cup', role: 'pantry' },
        { canonical: 'broccolini', amount: 2, unit: 'each', role: 'produce' },
        { canonical: 'sliced almonds', amount: 0.25, unit: 'cup', role: 'pantry' },
        { canonical: 'lemon', amount: 1, unit: 'each', role: 'produce' },
      ],
    },
  ],
  pesto: [
    {
      ...base, source: 'spoonacular', url: 'https://www.example-kitchen.test/pesto-pasta', site: 'Example Kitchen',
      title: 'Basil pesto pasta', image: img('pesto-pasta'), likes: 150, totalMinutes: 25,
      ingredients: ['12 oz spaghetti', '1/2 cup basil pesto', '1 cup cherry tomatoes'],
      structured: [
        { canonical: 'spaghetti', amount: 12, unit: 'oz', role: 'pantry' },
        { canonical: 'basil pesto', amount: 0.5, unit: 'cup', role: 'pantry' },
        { canonical: 'cherry tomatoes', amount: 1, unit: 'cup', role: 'produce' },
      ],
    },
  ],
  // Only Spoonacular knows lasagna, so a Big sites search for it falls back.
  lasagna: [
    {
      ...base, source: 'spoonacular', url: 'https://spoonacular.com/fake-lasagna', site: 'Spoonacular',
      title: 'Easy lasagna', image: img('lasagna'), totalMinutes: 75,
      ingredients: ['1 lb ground beef', '12 lasagna noodles'],
      structured: [
        { canonical: 'ground beef', amount: 1, unit: 'lb', role: 'meat' },
        { canonical: 'lasagna noodles', amount: 12, unit: 'each', role: 'pantry' },
      ],
    },
  ],
  'pot pie': [
    {
      ...base, source: 'spoonacular', url: 'https://spoonacular.com/fake-pot-pie', site: 'Spoonacular',
      title: 'Easy pot pie', image: img('easy-pot-pie'), totalMinutes: 60,
      ingredients: ['2 cups cooked chicken', '1 pie crust'],
      structured: [
        { canonical: 'cooked chicken', amount: 2, unit: 'cup', role: 'meat' },
        { canonical: 'pie crust', amount: 1, unit: 'each', role: 'bakery' },
      ],
    },
  ],
};

const lookupFor = (table: Record<string, RecipeOption[]>, query: string): RecipeOption[] => {
  const q = query.toLowerCase();
  const key = Object.keys(table).find((k) => q.includes(k));
  return key ? table[key].map((o) => ({ ...o })) : [];
};

export const fakeSiteOptions = (query: string) => lookupFor(SITES, query);
export const fakeSpoonacular = async (query: string) => lookupFor(SPOON, query);

export const fakeWebSearch: WebSearchProvider = {
  async search(query) {
    return fakeSiteOptions(query).map<SearchHit>((o) => ({ url: o.url, title: o.title }));
  },
};
