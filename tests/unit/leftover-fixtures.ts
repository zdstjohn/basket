import type { MealRow, WeekMeal } from '@/lib/db/rows';
import { tacos } from '@/lib/fixtures/tacos';

export const tacosRow: MealRow = {
  id: tacos.id,
  created_at: '2026-11-26T00:00:00Z',
  household_id: 'h1',
  name: tacos.name,
  base_servings: tacos.baseServings,
  ingredients: tacos.ingredients as unknown as MealRow['ingredients'],
  veg_swap: tacos.vegSwap as unknown as MealRow['veg_swap'],
  everyone_vegetarian: false,
  is_favorite: false,
  photo_credit: null,
  photo_credit_url: null,
  photo_path: null,
  photo_url: null,
  source_url: null,
  times_planned: 0,
  facts_checked_at: null,
  likes: null,
  make_ahead: false,
  method: null,
  person_changes: [],
  rating: null,
  rating_count: null,
  steps: null,
  total_minutes: null,
};

export const wm = (id: string, day: string, mealId: string, o: Partial<WeekMeal> = {}): WeekMeal => ({
  id,
  created_at: '2026-11-26T00:00:00Z',
  household_id: 'h1',
  week_id: 'w1',
  day,
  slot: 'dinner',
  meal_id: mealId,
  servings_override: null,
  updated_by: null,
  leftover_of: null,
  ...o,
});

