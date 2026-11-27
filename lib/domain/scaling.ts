import { matchFood } from './families';
import { eatsRole, householdServings, portionFactor } from './portions';
import type { Meal, Person, PersonChange, Quantity, Role } from './types';
import { quantityOrCount } from './units';

export interface ScaledLine {
  canonical: string;
  qty: Quantity;
  role: Role;
  sources: string[];
}

const norm = (s: string): string => s.trim().toLowerCase();

const factorOf = (p: Person): number => portionFactor(p.age, p.appetite);
const sumFactors = (people: Person[]): number => people.reduce((sum, p) => sum + factorOf(p), 0);

/** Everything in the meal a change can name: its ingredients and the vegetarian swap food. */
export function mealFoods(meal: Meal): string[] {
  return [...meal.ingredients.map((i) => i.canonical), ...(meal.vegSwap ? [meal.vegSwap.canonical] : [])];
}

/** A change for someone in the household, naming a food that is in the meal; any other change is ignored everywhere. */
export function liveChanges(meal: Meal, people: Person[]): PersonChange[] {
  const foods = mealFoods(meal);
  return (meal.personChanges ?? []).filter(
    (c) => people.some((p) => p.id === c.personId) && foods.some((f) => matchFood(c.food, f) !== null),
  );
}

/**
 * The one rule for who eats a line: people who eat its role (the diet rule) and have no change
 * whose food matches it. `scaleMeal`, `changeNotes` and the cut-to count all call this.
 */
export function eatersOf(meal: Meal, line: { canonical: string; role: Role }, people: Person[]): Person[] {
  const changes = meal.personChanges ?? [];
  return people.filter(
    (p) =>
      eatsRole(p.diet, line.role) &&
      !changes.some((c) => c.personId === p.id && matchFood(c.food, line.canonical) !== null),
  );
}

/** Share of the household's portions eaten by people who eat this role. */
function eaterShare(people: Person[], role: Role): number {
  let total = 0;
  let eating = 0;
  for (const p of people) {
    const f = factorOf(p);
    total += f;
    if (eatsRole(p.diet, role)) eating += f;
  }
  return total === 0 ? 0 : eating / total;
}

export function scaleMeal(meal: Meal, people: Person[], servingsOverride?: number): ScaledLine[] {
  const target = servingsOverride ?? householdServings(people);
  const sources = [meal.name];
  const lines: ScaledLine[] = [];
  const proteinRoles = new Set<Role>();

  for (const ing of meal.ingredients) {
    const isProtein = ing.role === 'meat' || ing.role === 'fish';
    let servings = target;
    if (isProtein) {
      if (meal.everyoneVegetarian) continue;
      proteinRoles.add(ing.role);
      const share = eaterShare(people, ing.role);
      if (share === 0) continue;
      servings = target * share;
    }
    // Somebody who eats this role has left it out: the line is for the rest.
    const byRole = people.filter((p) => eatsRole(p.diet, ing.role));
    const eaters = eatersOf(meal, ing, people);
    if (eaters.length < byRole.length) {
      if (eaters.length === 0) continue;
      servings = target * (sumFactors(eaters) / sumFactors(people));
    }
    lines.push({
      canonical: norm(ing.canonical),
      qty: quantityOrCount((ing.amount * servings) / meal.baseServings, ing.unit),
      role: ing.role,
      sources,
    });
  }

  // A person's own swap, in the order the changes were made. Always before the vegetarian swap.
  const total = sumFactors(people);
  for (const c of liveChanges(meal, people)) {
    if (c.action !== 'swap' || !c.swap) continue;
    const person = people.find((p) => p.id === c.personId);
    if (!person || total === 0) continue;
    lines.push({
      canonical: norm(c.swap.canonical),
      qty: quantityOrCount(c.swap.amountPerServing * target * (factorOf(person) / total), c.swap.unit),
      role: c.swap.role,
      sources,
    });
  }

  if (meal.vegSwap && !meal.everyoneVegetarian && proteinRoles.size > 0) {
    // The swap goes only to people who eat none of the meat/fish roles in the meal,
    // minus anyone with a change on the swap's own food.
    const roles = [...proteinRoles];
    const swap = meal.vegSwap;
    const none = people.filter((p) => roles.every((r) => !eatsRole(p.diet, r)));
    const noneShare = total === 0 ? 0 : sumFactors(eatersOf(meal, swap, none)) / total;
    if (noneShare > 0) {
      lines.push({
        canonical: norm(swap.canonical),
        qty: quantityOrCount(swap.amountPerServing * target * noneShare, swap.unit),
        role: swap.role,
        sources,
      });
    }
  }
  return lines;
}
