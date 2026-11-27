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
