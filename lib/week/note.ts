import { eatsRole, householdServings } from '@/lib/domain/portions';
import type { Meal, Person, Role } from '@/lib/domain/types';

const isProtein = (role: Role): boolean => role === 'meat' || role === 'fish';

/** True when the meal has meat or fish for anyone to skip. */
export function hasMeatOrFish(meal: Meal): boolean {
  return !meal.everyoneVegetarian && meal.ingredients.some((i) => isProtein(i.role));
}

/** People who eat none of the meat/fish in this meal: they get the swap (same rule as scaleMeal). */
export function swapPeople(meal: Meal, people: Person[]): Person[] {
  if (!hasMeatOrFish(meal)) return [];
  const roles = [...new Set(meal.ingredients.filter((i) => isProtein(i.role)).map((i) => i.role))];
  return people.filter((p) => roles.every((r) => !eatsRole(p.diet, r)));
}

export function joinNames(people: Person[]): string {
  const names = [...new Set(people.map((p) => p.name))];
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const num = (n: number): string => String(Math.round(n * 10) / 10);

/** The line under a meal on the week: who eats something else, and leftovers. */
export function dayNote(meal: Meal, people: Person[], servingsOverride: number | null, double = false): string {
  let main: string;
  if (!hasMeatOrFish(meal)) {
    main = 'Everyone vegetarian';
  } else {
    const skipping = swapPeople(meal, people);
    if (skipping.length === 0) main = 'Everyone eats this';
    else if (meal.vegSwap) main = `${joinNames(skipping)}: ${meal.vegSwap.canonical} instead`;
    else main = `${joinNames(skipping)}: no swap yet`;
  }
  const household = householdServings(people);
  const isDouble =
    household > 0 &&
    (double || (servingsOverride !== null && Math.abs(servingsOverride - 2 * household) <= 0.06));
  if (isDouble) return `${main} · cooking double`;
  const extra = servingsOverride === null ? 0 : Math.round((servingsOverride - household) * 10) / 10;
  return extra > 0 ? `${main} · +${num(extra)} for leftovers` : main;
}

/** The Favorites tag: Vegetarian, or Veg swap when meat/fish comes with a swap. */
export function mealTag(meal: Meal): 'vegetarian' | 'swap' | null {
  if (!hasMeatOrFish(meal)) return 'vegetarian';
  return meal.vegSwap ? 'swap' : null;
}
