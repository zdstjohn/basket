import type { Diet, Person, Role } from './types';

const round = (n: number, decimals: number): number => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

/** Fraction of an adult portion for a given age, times appetite. */
export function portionFactor(age: number, appetite = 1): number {
  let base: number;
  if (age < 2) base = 0.25;
  else if (age < 4) base = 0.4;
  else if (age < 6) base = 0.5;
  else if (age < 8) base = 0.6;
  else if (age < 11) base = 0.7;
  else if (age < 14) base = 0.85;
  else base = 1;
  return round(base * appetite, 2);
}

/** Total adult-equivalent servings for the household, rounded to 0.1. */
export function householdServings(people: Person[]): number {
  const total = people.reduce((sum, p) => sum + portionFactor(p.age, p.appetite), 0);
  return round(total, 1);
}

export function eatsRole(diet: Diet, role: Role): boolean {
  if (role === 'meat') return diet === 'none';
  if (role === 'fish') return diet === 'none' || diet === 'pescatarian';
  return true;
}
