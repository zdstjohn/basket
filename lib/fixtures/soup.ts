import type { Meal } from '@/lib/domain/types';

export const soup: Meal = {
  id: 'fixture-soup',
  name: 'White bean and mushroom soup',
  baseServings: 4,
  ingredients: [
    { canonical: 'cremini mushrooms', amount: 8, unit: 'oz', role: 'produce' },
    { canonical: 'white beans', amount: 2, unit: 'can', role: 'veg_protein' },
    { canonical: 'yellow onion', amount: 1, unit: 'each', role: 'produce' },
  ],
  vegSwap: null,
  everyoneVegetarian: false,
  isFavorite: false,
};
