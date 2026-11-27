export type Diet = 'none' | 'vegetarian' | 'vegan' | 'pescatarian';

export interface Person {
  id: string;
  name: string;
  age: number;
  diet: Diet;
  appetite: number;
  dislikes: string[];
  allergies?: string[]; // optional on purpose: read as `?? []` (cached lists and old rows have none)
}

export type Role =
  | 'meat'
  | 'fish'
  | 'veg_protein'
  | 'produce'
  | 'dairy'
  | 'bakery'
  | 'frozen'
  | 'pantry'
  | 'other';

export interface Quantity {
  amount: number;
  kind: 'mass' | 'volume' | 'count';
  base: 'g' | 'ml' | 'each';
  countUnit?: string;
}

export interface IngredientLine {
  canonical: string;
  amount: number;
  unit: string;
  role: Role;
  note?: string;
}

export interface VegSwap {
  canonical: string;
  amountPerServing: number;
  unit: string;
  role: Role;
}

export type SwapIdea = VegSwap;

export interface PersonChange {
  personId: string;
  food: string;
  action: 'leave_out' | 'swap';
  swap?: SwapIdea;
}

export interface Meal {
  id: string;
  name: string;
  baseServings: number;
  ingredients: IngredientLine[];
  vegSwap: VegSwap | null;
  everyoneVegetarian: boolean;
  isFavorite: boolean;
  personChanges?: PersonChange[]; // optional on purpose: read as `?? []` (cached lists and old rows have none)
}
