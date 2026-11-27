import { matchFood } from "@/lib/domain/families";
import { findFlags, ingredientNames, type Flag } from "@/lib/domain/flags";
import { eatersOf } from "@/lib/domain/scaling";
import type { Meal, Person, Role, SwapIdea } from "@/lib/domain/types";

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** "four" up to twelve, then the digits. */
export function inWords(n: number): string {
  return WORDS[n] !== undefined ? WORDS[n] : String(n);
}

/** What a swap does to the shopping list: it names the food, not an amount. */
export function ideaNote(idea: SwapIdea, meal: Meal): string {
  return ingredientNames(meal).some((n) => matchFood(idea.canonical, n) !== null)
    ? "Already on the list"
    : `Adds ${idea.canonical} to the list`;
}

/** How many people still eat this food in this meal, once these people (and anyone with an earlier change) have left it. */
export function eatersLeft(flag: Flag, meal: Meal, people: Person[]): number {
  const lines: { canonical: string; role: Role }[] = [
    ...meal.ingredients,
    ...(meal.vegSwap ? [{ canonical: meal.vegSwap.canonical, role: meal.vegSwap.role }] : []),
  ];
  const line = lines.find((l) => matchFood(flag.food, l.canonical) !== null);
  if (!line) return Math.max(0, people.length - flag.people.length);
  return eatersOf(meal, line, people).filter((p) => !flag.people.some((f) => f.id === p.id)).length;
}

/** The allergy flags a food would raise if it went on the shared list. A swap that has any is not allowed from the swap sheet. */
export function allergyHits(swap: SwapIdea | null, people: Person[]): Flag[] {
  return swap ? findFlags([swap.canonical], people).filter((f) => f.kind === "allergy") : [];
}
