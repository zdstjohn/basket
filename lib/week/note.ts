import { matchFood } from '@/lib/domain/families';
import { personLabel } from '@/lib/domain/flags';
import { eatsRole, householdServings } from '@/lib/domain/portions';
import { liveChanges } from '@/lib/domain/scaling';
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

/** "Daughter (4): no mushrooms", "Daughter (4): zucchini instead of mushrooms", in the order the changes were made. */
export function changeNotes(meal: Meal, people: Person[]): string[] {
  return liveChanges(meal, people).flatMap((c) => {
    const person = people.find((p) => p.id === c.personId);
    if (!person) return [];
    const who = personLabel(person, people);
    if (c.action === 'leave_out') return [`${who}: no ${c.food}`];
    return c.swap ? [`${who}: ${c.swap.canonical} instead of ${c.food}`] : [];
  });
}

/** The line under a meal on the week: who eats something else, and leftovers. */
export function dayNote(meal: Meal, people: Person[], servingsOverride: number | null): string {
  let main: string | null;
  if (!hasMeatOrFish(meal)) {
    main = 'Everyone vegetarian';
  } else {
    const all = swapPeople(meal, people);
    const swapFood = meal.vegSwap?.canonical;
    // Someone with a change on the swap's own food is named by their change, not here.
    const skipping = swapFood
      ? all.filter((p) => !(meal.personChanges ?? []).some((c) => c.personId === p.id && matchFood(c.food, swapFood) !== null))
      : all;
    if (all.length === 0) main = 'Everyone eats this';
    else if (skipping.length === 0) main = null;
    else if (meal.vegSwap) main = `${joinNames(skipping)}: ${meal.vegSwap.canonical} instead`;
    else main = `${joinNames(skipping)}: no swap yet`;
  }
  const extra =
    servingsOverride === null ? 0 : Math.round((servingsOverride - householdServings(people)) * 10) / 10;
  const parts = [...(main === null ? [] : [main]), ...(extra > 0 ? [`+${num(extra)} for leftovers`] : []), ...changeNotes(meal, people)];
  return parts.join(' · ');
}

/** The Favorites tag: Vegetarian, or Veg swap when meat/fish comes with a swap. */
export function mealTag(meal: Meal): 'vegetarian' | 'swap' | null {
  if (!hasMeatOrFish(meal)) return 'vegetarian';
  return meal.vegSwap ? 'swap' : null;
}
