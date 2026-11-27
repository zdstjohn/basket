import type { SwapIdea } from './types';
import { rawWords, singular, words } from './words';

export interface Family {
  id: string; // 'tree_nut'
  label: string; // 'tree nut'
  plural: string; // 'tree nuts'
  members: string[]; // foods that are it: 'almond', 'pine nut'
  often: string[]; // prepared foods that usually contain it: 'pesto'
  not: string[]; // phrases that look like it but are not: 'water chestnut', 'coconut milk'
  examples: string[]; // three or four members for the "covers" line, in order
}

// Phrases are matched as whole words, singular or plural, so "nut" never matches "butternut" or "nutmeg".
// A food belongs to one family only (a test checks it); `often` may repeat across families.
export const FAMILIES: readonly Family[] = [
  {
    id: 'mushroom', label: 'mushroom', plural: 'mushrooms',
    members: [
      'mushroom', 'cremini', 'crimini', 'baby bella', 'portobello', 'portabella', 'shiitake', 'enoki', 'chanterelle',
      'porcini', 'morel', 'maitake', 'matsutake',
    ],
    often: ['stroganoff', 'duxelles'],
    not: [],
    examples: ['cremini', 'portobello', 'shiitake'],
  },
  {
    id: 'tree_nut', label: 'tree nut', plural: 'tree nuts',
    members: [
      'almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'hazelnut', 'filbert', 'macadamia', 'brazil nut', 'pine nut',
      'pignoli', 'chestnut', 'mixed nut',
    ],
    often: [
      'pesto', 'marzipan', 'frangipane', 'amaretto', 'nutella', 'praline', 'nougat', 'baklava', 'granola', 'trail mix',
      'macaron', 'gianduja', 'nut butter', 'nut milk', 'nut flour', 'nut meal',
    ],
    not: ['water chestnut'],
    examples: ['almonds', 'walnuts', 'pecans', 'cashews'],
  },
  {
    id: 'peanut', label: 'peanut', plural: 'peanuts',
    members: ['peanut', 'groundnut'],
    often: ['satay', 'trail mix', 'mixed nut', 'nut butter', 'pad thai', 'kung pao', 'mole'],
    not: [],
    examples: ['peanuts', 'peanut butter', 'groundnuts'],
  },
  {
    id: 'milk', label: 'milk', plural: 'milk',
    members: [
      'milk', 'buttermilk', 'butter', 'buttercream', 'butterscotch', 'ghee', 'cream', 'half and half', 'cheese',
      'yogurt', 'yoghurt', 'kefir', 'whey', 'casein', 'caseinate', 'lactose', 'paneer', 'ricotta', 'mascarpone',
      'feta', 'brie', 'camembert', 'cheddar', 'parmesan', 'parmigiano', 'pecorino', 'romano', 'asiago', 'mozzarella',
      'provolone', 'gouda', 'gruyere', 'gruyère', 'swiss', 'havarti', 'colby', 'monterey jack', 'pepper jack',
      'manchego', 'halloumi', 'burrata', 'gorgonzola', 'queso', 'quark', 'labneh', 'skyr', 'creme fraiche',
      'crème fraîche',
    ],
    often: ['alfredo', 'ranch', 'caramel', 'custard', 'pudding', 'bechamel', 'béchamel', 'creamer'],
    not: [
      'coconut milk', 'almond milk', 'oat milk', 'soy milk', 'rice milk', 'cashew milk', 'coconut cream',
      'peanut butter', 'almond butter', 'cashew butter', 'sunflower butter', 'nut butter', 'apple butter',
      'cocoa butter', 'butter lettuce', 'butter bean', 'cream of tartar', 'coconut butter', 'shea butter',
      'cream of coconut', 'coconut yogurt',
    ],
    examples: ['cheese', 'butter', 'yogurt', 'cream'],
  },
  {
    id: 'egg', label: 'egg', plural: 'eggs',
    members: ['egg', 'eggnog', 'yolk', 'albumin', 'albumen'],
    often: ['mayonnaise', 'mayo', 'aioli', 'meringue', 'hollandaise', 'brioche', 'challah', 'custard'],
    not: [],
    examples: ['egg whites', 'yolks', 'egg noodles'],
  },
  {
    id: 'wheat', label: 'wheat', plural: 'wheat',
    members: [
      'wheat', 'flour', 'bread', 'panko', 'crouton', 'cracker', 'pretzel', 'croissant', 'bagel', 'bun', 'pita', 'naan',
      'tortilla', 'dough', 'crust', 'stuffing', 'pasta', 'spaghetti', 'macaroni', 'penne', 'linguine', 'fettuccine',
      'rigatoni', 'lasagna', 'lasagne', 'ravioli', 'tortellini', 'orzo', 'noodle', 'ramen', 'udon', 'couscous',
      'bulgur', 'semolina', 'farro', 'spelt', 'durum', 'einkorn', 'kamut', 'seitan',
    ],
    often: ['soy sauce', 'teriyaki', 'hoisin', 'ponzu', 'gravy', 'cornbread', 'gnocchi'],
    not: [
      'almond flour', 'coconut flour', 'rice flour', 'corn flour', 'oat flour', 'chickpea flour', 'tapioca flour',
      'corn tortilla', 'rice noodle', 'rice paper', 'potato flour', 'cassava flour', 'buckwheat flour',
    ],
    examples: ['flour', 'bread', 'pasta', 'couscous'],
  },
  {
    id: 'soy', label: 'soy', plural: 'soy',
    members: ['soy', 'soya', 'soybean', 'tofu', 'tempeh', 'edamame', 'miso', 'natto', 'tamari', 'shoyu', 'tvp'],
    often: ['teriyaki', 'hoisin', 'ponzu'],
    not: [],
    examples: ['soybeans', 'tofu', 'tempeh', 'miso'],
  },
  {
    id: 'fish', label: 'fish', plural: 'fish',
    members: [
      'fish', 'salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'trout', 'anchovy', 'sardine', 'mackerel', 'haddock',
      'snapper', 'bass', 'catfish', 'herring', 'pollock', 'mahi', 'mahimahi', 'swordfish', 'flounder', 'sole',
      'perch', 'carp', 'eel', 'lox', 'roe', 'caviar', 'bonito', 'surimi',
    ],
    often: ['worcestershire', 'caesar', 'dashi', 'seafood', 'pad thai'],
    not: [],
    examples: ['salmon', 'tuna', 'cod', 'anchovies'],
  },
  {
    id: 'shellfish', label: 'shellfish', plural: 'shellfish',
    members: [
      'shellfish', 'shrimp', 'prawn', 'scampi', 'crab', 'crabmeat', 'lobster', 'crawfish', 'crayfish', 'langoustine',
      'scallop', 'clam', 'mussel', 'oyster', 'squid', 'calamari', 'octopus', 'abalone',
    ],
    often: ['oyster sauce', 'seafood', 'paella', 'gumbo', 'cioppino', 'bouillabaisse'],
    not: ['oyster mushroom'],
    examples: ['shrimp', 'crab', 'lobster', 'scallops'],
  },
  {
    id: 'sesame', label: 'sesame', plural: 'sesame',
    members: ['sesame', 'tahini', 'tehina', 'halva', 'halvah', 'gomasio', 'benne'],
    often: ['hummus', 'baba ghanoush', 'za\'atar', 'everything bagel'],
    not: [],
    examples: ['sesame seeds', 'sesame oil', 'tahini'],
  },
  {
    id: 'olive', label: 'olive', plural: 'olives',
    members: ['olive', 'kalamata', 'castelvetrano'],
    often: ['tapenade', 'puttanesca'],
    not: ['olive oil'],
    examples: ['green olives', 'black olives', 'kalamata'],
  },
  {
    id: 'onion', label: 'onion', plural: 'onions',
    members: ['onion', 'shallot', 'scallion'],
    often: [],
    not: ['onion powder', 'onion salt'],
    examples: ['onions', 'shallots', 'scallions'],
  },
  {
    id: 'pepper', label: 'pepper', plural: 'peppers',
    members: [
      'bell pepper', 'chili pepper', 'chile pepper', 'hot pepper', 'sweet pepper', 'banana pepper', 'red pepper',
      'green pepper', 'yellow pepper', 'orange pepper', 'cayenne pepper', 'jalapeno', 'jalapeño', 'serrano', 'habanero',
      'poblano', 'anaheim', 'pepperoncini', 'capsicum',
    ],
    often: ['hot sauce', 'sriracha', 'chili powder', 'paprika', 'cayenne', 'harissa', 'chili sauce', 'chili paste', 'sambal'],
    not: ['black pepper', 'white pepper', 'ground pepper', 'salt and pepper', 'pepper jack'],
    examples: ['bell peppers', 'jalapeños', 'chili peppers'],
  },
  {
    id: 'tomato', label: 'tomato', plural: 'tomatoes',
    members: ['tomato'],
    often: ['marinara', 'ketchup', 'passata', 'pizza sauce', 'salsa', 'bolognese', 'pomodoro', 'arrabbiata', 'shakshuka'],
    not: [],
    examples: ['tomatoes', 'cherry tomatoes', 'tomato sauce'],
  },
  {
    id: 'cilantro', label: 'cilantro', plural: 'cilantro',
    members: ['cilantro', 'coriander leaf', 'chinese parsley'],
    often: ['pico de gallo', 'salsa'],
    not: [],
    examples: ['cilantro', 'coriander leaves', 'chinese parsley'],
  },
  {
    id: 'bean', label: 'bean', plural: 'beans',
    members: ['bean', 'cannellini', 'pinto', 'borlotti'],
    often: [],
    not: ['green bean', 'string bean', 'vanilla bean', 'coffee bean', 'bean sprout', 'cocoa bean', 'jelly bean'],
    examples: ['black beans', 'kidney beans', 'pinto beans'],
  },
];

export const COMMON_ALLERGENS: readonly string[] = [
  'peanuts', 'tree nuts', 'milk', 'eggs', 'wheat', 'soy', 'fish', 'shellfish', 'sesame',
];

/** Trimmed, single-spaced, lower case; null if nothing is left or it is over 40 characters. */
export function cleanFood(typed: string): string | null {
  const s = typed.trim().replace(/\s+/g, ' ').toLowerCase();
  return s.length === 0 || s.length > 40 ? null : s;
}

const key = (s: string): string => words(s).join(' ');

interface Compiled {
  family: Family;
  names: Set<string>;
  memberKeys: Set<string>;
  not: string[][];
  often: string[][];
  members: string[][];
}

const byLength = (a: string[], b: string[]): number => b.length - a.length;

const COMPILED: readonly Compiled[] = FAMILIES.map((family) => ({
  family,
  names: new Set([key(family.plural), key(family.label)]),
  memberKeys: new Set(family.members.map(key)),
  not: family.not.map(words).sort(byLength),
  often: family.often.map(words).sort(byLength),
  members: family.members.map(words).sort(byLength),
}));

/** The family a food names: its plural or label always, a single member only when `wide`. */
function stand(food: string, wide: boolean): Compiled | null {
  const k = key(food);
  if (!k) return null;
  return COMPILED.find((c) => c.names.has(k) || (wide && c.memberKeys.has(k))) ?? null;
}

/** The family a food belongs to by any of its names: plural, label or member, singular or plural. */
export function familyFor(food: string): Family | null {
  return stand(food, true)?.family ?? null;
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "Mushrooms covers cremini, portobello, shiitake and the rest.", or null if the food names no family. */
export function coversLine(food: string, opts?: { wide?: boolean }): string | null {
  const c = stand(food, opts?.wide === true);
  if (!c) return null;
  return `${capital(c.family.plural)} covers ${c.family.examples.join(', ')} and the rest.`;
}

export interface FoodHit {
  found: string; // the ingredient's own words that matched, as written, lower case
  often: boolean;
}

/** Start positions where `phrase` sits in `tokens` as consecutive words, none of them already taken. */
function findPhrase(tokens: string[], phrase: string[], taken: boolean[]): number[] {
  const at: number[] = [];
  if (phrase.length === 0) return at;
  for (let i = 0; i + phrase.length <= tokens.length; i++) {
    if (phrase.every((w, k) => tokens[i + k] === w && !taken[i + k])) at.push(i);
  }
  return at;
}

/** The longest run of neighbouring marked positions, as written (the first one on a tie). */
function longestRun(raw: string[], marked: boolean[]): string {
  let best: [number, number] = [0, 0];
  for (let i = 0; i < marked.length; ) {
    if (!marked[i]) { i++; continue; }
    let j = i;
    while (j < marked.length && marked[j]) j++;
    if (j - i > best[1] - best[0]) best = [i, j];
    i = j;
  }
  return raw.slice(best[0], best[1]).join(' ');
}

/**
 * Does this ingredient line hold the food? Whole words only, singular or plural.
 * A food that names a family (see `stand`) is read as the whole family; any other food is matched as typed.
 */
export function matchFood(food: string, ingredient: string, opts?: { wide?: boolean }): FoodHit | null {
  const raw = rawWords(ingredient);
  const tokens = raw.map(singular);
  const marked = tokens.map(() => false);
  const c = stand(food, opts?.wide === true);

  if (!c) {
    const phrase = words(food);
    for (const start of findPhrase(tokens, phrase, marked)) {
      for (let k = 0; k < phrase.length; k++) marked[start + k] = true;
    }
    return marked.some(Boolean) ? { found: longestRun(raw, marked), often: false } : null;
  }

  const taken = tokens.map(() => false);
  for (const phrase of c.not) {
    for (const start of findPhrase(tokens, phrase, taken)) {
      for (let k = 0; k < phrase.length; k++) taken[start + k] = true;
    }
  }
  const oftenMarked = tokens.map(() => false);
  for (const phrase of c.often) {
    for (const start of findPhrase(tokens, phrase, taken)) {
      for (let k = 0; k < phrase.length; k++) { taken[start + k] = true; oftenMarked[start + k] = true; }
    }
  }
  for (const phrase of c.members) {
    for (const start of findPhrase(tokens, phrase, taken)) {
      for (let k = 0; k < phrase.length; k++) { taken[start + k] = true; marked[start + k] = true; }
    }
  }
  if (marked.some(Boolean)) return { found: longestRun(raw, marked), often: false };
  if (oftenMarked.some(Boolean)) return { found: longestRun(raw, oftenMarked), often: true };
  return null;
}

// Swap ideas exist only for foods that are not allergens: an allergy is never offered a swap.
const SWAPS: Readonly<Record<string, readonly SwapIdea[]>> = {
  mushroom: [
    { canonical: 'zucchini', amountPerServing: 0.25, unit: 'each', role: 'produce' },
    { canonical: 'white beans', amountPerServing: 0.25, unit: 'cup', role: 'veg_protein' },
    { canonical: 'carrots', amountPerServing: 0.5, unit: 'each', role: 'produce' },
  ],
  olive: [{ canonical: 'capers', amountPerServing: 0.5, unit: 'tbsp', role: 'pantry' }],
  onion: [{ canonical: 'celery', amountPerServing: 0.5, unit: 'each', role: 'produce' }],
  pepper: [{ canonical: 'zucchini', amountPerServing: 0.25, unit: 'each', role: 'produce' }],
  tomato: [{ canonical: 'carrots', amountPerServing: 0.5, unit: 'each', role: 'produce' }],
  cilantro: [{ canonical: 'parsley', amountPerServing: 0.1, unit: 'bunch', role: 'produce' }],
  bean: [{ canonical: 'lentils', amountPerServing: 0.25, unit: 'cup', role: 'veg_protein' }],
};

/** Up to three things to put in instead; none for an allergen or a food outside the table. */
export function swapIdeas(food: string): SwapIdea[] {
  const family = familyFor(food);
  return (family ? (SWAPS[family.id] ?? []) : []).slice(0, 3).map((s) => ({ ...s }));
}
