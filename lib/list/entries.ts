import type { MealRow, WeekMeal } from '@/lib/db/rows';
import { toMeal } from '@/lib/db/queries/meals';
import { cookedNights } from '@/lib/domain/leftovers';
import type { Meal } from '@/lib/domain/types';

/**
 * The one place week rows become things to buy. A leftovers night buys nothing (cookedNights),
 * and a night whose meal did not load is left out too.
 */
export function weekEntries(rows: WeekMeal[], meals: Map<string, MealRow>): { meal: Meal; servings: number | null }[] {
  return cookedNights(rows).flatMap((r) => {
    const row = meals.get(r.meal_id);
    return row ? [{ meal: toMeal(row), servings: r.servings_override === null ? null : Number(r.servings_override) }] : [];
  });
}
