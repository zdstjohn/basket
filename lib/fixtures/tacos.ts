import type { Meal } from '@/lib/domain/types';

export const tacos: Meal = {
  id: 'fixture-tacos',
  name: 'Chicken tacos',
  baseServings: 4,
  ingredients: [
    { canonical: 'boneless chicken thighs', amount: 1, unit: 'lb', role: 'meat' },
    { canonical: 'corn tortillas', amount: 12, unit: 'each', role: 'bakery' },
    { canonical: 'yellow onion', amount: 1, unit: 'each', role: 'produce' },
  ],
  vegSwap: { canonical: 'black beans', amountPerServing: 0.25, unit: 'can', role: 'veg_protein' },
  everyoneVegetarian: false,
  isFavorite: false,
};
