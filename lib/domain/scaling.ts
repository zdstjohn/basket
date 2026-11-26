import { eatsRole, householdServings, portionFactor } from './portions';
import type { Meal, Person, Quantity, Role } from './types';
import { quantityOrCount } from './units';

export interface ScaledLine {
  canonical: string;
  qty: Quantity;
  role: Role;
  sources: string[];
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Share of the household's portions eaten by people who eat this role. */
function eaterShare(people: Person[], role: Role): number {
  let total = 0;
  let eating = 0;
  for (const p of people) {
    const f = portionFactor(p.age, p.appetite);
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
    lines.push({
      canonical: norm(ing.canonical),
      qty: quantityOrCount((ing.amount * servings) / meal.baseServings, ing.unit),
      role: ing.role,
      sources,
    });
  }

  if (meal.vegSwap && !meal.everyoneVegetarian) {
    const roles = proteinRoles.size > 0 ? [...proteinRoles] : (['meat'] as Role[]);
    const share = Math.min(...roles.map((r) => eaterShare(people, r)));
    if (share < 1) {
      const swap = meal.vegSwap;
      lines.push({
        canonical: norm(swap.canonical),
        qty: quantityOrCount(swap.amountPerServing * target * (1 - share), swap.unit),
        role: swap.role,
        sources,
      });
    }
  }
  return lines;
}
