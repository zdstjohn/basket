// Typical densities (grams per millilitre) and item weights (grams), keyed by the words in a food's name.
// The longest matching keyword wins, so "peanut butter" beats "butter" and "kosher salt" beats "salt".

const DENSITY: Record<string, number> = {
  // salts
  salt: 1.2, 'kosher salt': 0.8, 'sea salt': 1, 'table salt': 1.2,
  // sugars
  sugar: 0.85, 'brown sugar': 0.9, 'powdered sugar': 0.5, 'confectioners sugar': 0.5, 'icing sugar': 0.5,
  // flours and starches
  flour: 0.53, 'bread flour': 0.55, 'whole wheat flour': 0.5, cornstarch: 0.54, cornmeal: 0.65,
  'baking powder': 0.96, 'baking soda': 1.2, 'cocoa powder': 0.45, cocoa: 0.45,
  // honey and syrups
  honey: 1.42, 'maple syrup': 1.33, syrup: 1.33, molasses: 1.4, 'agave': 1.37,
  // oils and fats
  oil: 0.92, butter: 0.96, ghee: 0.91, shortening: 0.87, lard: 0.92, margarine: 0.96,
  // ground spices and dried herbs
  paprika: 0.5, cumin: 0.45, cinnamon: 0.55, turmeric: 0.6, cayenne: 0.45, nutmeg: 0.5, 'black pepper': 0.45,
  'chili powder': 0.5, 'garlic powder': 0.5, 'onion powder': 0.5, powder: 0.5, 'curry powder': 0.45,
  oregano: 0.2, thyme: 0.2, rosemary: 0.2, sage: 0.2, dill: 0.2, 'italian seasoning': 0.2, 'dried oregano': 0.2,
  'dried basil': 0.2, 'dried parsley': 0.2, 'red pepper flakes': 0.4,
  // liquids and condiments
  milk: 1.03, cream: 1, 'half and half': 1.02, broth: 1, stock: 1, juice: 1.04, vinegar: 1.01, wine: 0.99,
  'soy sauce': 1.15, ketchup: 1.15, mayonnaise: 0.95, mayo: 0.95, mustard: 1.05, 'dijon mustard': 1.05,
  salsa: 1.05, 'tomato paste': 1.1, 'tomato sauce': 1.03, 'hot sauce': 1.05, yogurt: 1.04, 'sour cream': 1,
  'pasta sauce': 1.03, 'spaghetti sauce': 1.03, marinara: 1.03, 'cheese sauce': 1.05, pesto: 1.0,
  'orange juice': 1.04, 'lemon juice': 1.03, 'lime juice': 1.03,
  'cream cheese': 1, 'cottage cheese': 1, ricotta: 1.03,
  // nut butters
  'peanut butter': 1.1, 'almond butter': 1.1, 'nut butter': 1.1, tahini: 1.05,
  // grains and dry goods
  rice: 0.8, oats: 0.38, oatmeal: 0.38, quinoa: 0.72, lentils: 0.85, 'dried beans': 0.8, couscous: 0.7,
  raisins: 0.65, 'chocolate chips': 0.7, 'shredded coconut': 0.35, panko: 0.25,
  // light, airy foods (I2)
  spinach: 0.13, arugula: 0.13, lettuce: 0.13, romaine: 0.13, 'salad greens': 0.13, 'mixed greens': 0.13,
  kale: 0.15, chard: 0.15, cabbage: 0.3, basil: 0.25, parsley: 0.25, cilantro: 0.25, mint: 0.25,
  'shredded cheese': 0.47, cheese: 0.47, cheddar: 0.47, mozzarella: 0.47, parmesan: 0.4,
  breadcrumbs: 0.45, 'bread crumbs': 0.45,
  walnuts: 0.5, pecans: 0.45, almonds: 0.45, nuts: 0.5, peanuts: 0.6, cashews: 0.5,
  pasta: 0.45, macaroni: 0.45, spaghetti: 0.45, penne: 0.45, noodles: 0.4,
  berries: 0.6, blueberries: 0.63, strawberries: 0.65, raspberries: 0.52, blackberries: 0.6,
};

const EACH: Record<string, number> = {
  egg: 50, onion: 225, 'green onion': 15, scallion: 15, shallot: 40, lemon: 100, lime: 65, orange: 180,
  apple: 180, banana: 120, potato: 213, 'sweet potato': 200, tomato: 150, 'bell pepper': 160, jalapeno: 15,
  carrot: 60, cucumber: 300, zucchini: 200, avocado: 170, garlic: 50, 'chicken breast': 225,
};

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(table: Record<string, number>): { re: RegExp; value: number; len: number }[] {
  return Object.entries(table)
    .map(([k, value]) => ({ re: new RegExp(`(?:^|[^a-z])${escape(k)}(?:e?s)?(?:$|[^a-z])`), value, len: k.length }))
    .sort((a, b) => b.len - a.len);
}

const DENSITY_RULES = compile(DENSITY);
const EACH_RULES = compile(EACH);

const findRule = (rules: ReturnType<typeof compile>, name: string) => rules.find((r) => r.re.test(name));
const find = (rules: ReturnType<typeof compile>, canonical: string): number | null =>
  findRule(rules, canonical.toLowerCase())?.value ?? null;

/** Grams in one millilitre of this food; 1 (water) when unknown. */
export function gramsPerMl(canonical: string): number {
  return find(DENSITY_RULES, canonical) ?? 1;
}

/** Typical grams of one loose item of this food, or null when we have no idea. */
export function eachGramsKnown(canonical: string): number | null {
  const name = canonical.toLowerCase();
  const each = findRule(EACH_RULES, name);
  // "tomato paste" or "orange juice" is a liquid or sauce, not a loose tomato or orange.
  if (!each || (findRule(DENSITY_RULES, name)?.len ?? 0) > each.len) return null;
  return each.value;
}

/** Typical grams of one loose item of this food; 150 when unknown. */
export function eachGrams(canonical: string): number {
  return eachGramsKnown(canonical) ?? 150;
}
