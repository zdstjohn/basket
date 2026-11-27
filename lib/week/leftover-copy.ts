import type { CookState, NightChoice } from '@/lib/domain/leftovers';
import { laterWords } from '@/lib/domain/leftovers';
import type { Meal, Person } from '@/lib/domain/types';
import type { Day } from '@/lib/domain/weeks';
import { dayName } from '@/lib/week/format';
import { joinNames, swapPeople } from '@/lib/week/note';

/** The words on the leftovers screens. Fixed copy from the approved artboards. */

export function pickerIntro(mode: 'cook' | 'move', mealName: string, cookDay: Day): { title: string; sub: string; action: string } {
  if (mode === 'cook') {
    return {
      title: 'Cook double',
      sub: `${mealName} on ${dayName(cookDay)}. Buy and cook twice as much, then eat it again.`,
      action: 'Cook double',
    };
  }
  return { title: 'Move the leftovers', sub: `${mealName}, cooked ${dayName(cookDay)}.`, action: 'Move' };
}

export function choiceSub(c: NightChoice, takenName: string | null): string {
  if (c.taken === 'dinner') return `${takenName ?? 'A dinner'} is planned`;
  if (c.taken === 'leftovers') return 'Leftovers are planned';
  return `${laterWords(c.daysLater)}${c.busy ? ' · busy night' : ''}${c.current ? ' · where they are now' : ''}`;
}

export function tintLines(day: Day | null, swapLine: string | null): string[] {
  const first = day ? `${dayName(day)} adds nothing to the list and nothing to the budget.` : 'The list gets twice the ingredients.';
  return swapLine ? [first, swapLine] : [first];
}

/** "Mom’s black beans double too." when someone gets the swap; otherwise null. */
export function swapDoubleLine(meal: Meal, people: Person[]): string | null {
  const skipping = swapPeople(meal, people);
  if (skipping.length === 0 || !meal.vegSwap) return null;
  return `${joinNames(skipping)}’s ${meal.vegSwap.canonical} double too.`;
}

export function lastNightLine(cookDay: Day): string {
  return `${dayName(cookDay)} is the last night of this week, so there’s no later night for leftovers. You can still cook double for lunches.`;
}

const servingsWords = (n: number): string => String(Math.round(n * 10) / 10);

/** The green box on a cooking night; null when it is the usual amount. */
export function doneBox(state: CookState): { head: string; sub: string } | null {
  if (state.kind === 'usual') return null;
  if (state.kind === 'double') {
    return {
      head: 'Cooking double',
      sub: state.night ? `Leftovers on ${dayName(state.night)}` : 'No leftovers night. Extra for lunches.',
    };
  }
  return {
    head: `Cooking ${servingsWords(state.servings)} extra serving${state.servings === 1 ? '' : 's'}`,
    sub: 'For leftovers, no set night',
  };
}

export const leftoverRowNote = (mealName: string, cookDay: Day): string => `${mealName}, from ${dayName(cookDay)}`;

export function leftoverSheetCopy(
  _mealName: string,
  day: Day,
  cookDay: Day,
  daysBefore: number,
  swapLine: string | null,
): { when: string; nothing: string; undo: string } {
  const swapPart = swapLine ? `, ${swapLine.replace(/ double too\.$/, '')} too` : '';
  return {
    when: `Cooked ${dayName(cookDay)}, ${daysBefore === 1 ? 'the day before' : `${daysBefore} days before`}`,
    nothing: `Nothing to buy for ${dayName(day)}. It’s all on ${dayName(cookDay)}’s list${swapPart}.`,
    undo: `Taking it off puts ${dayName(cookDay)} back to the usual amount.`,
  };
}

export const takeOffNote = (leftoverDay: Day | null): string | null =>
  leftoverDay ? `${dayName(leftoverDay)}’s leftovers come off too.` : null;

export const OFFLINE_LINE = 'You’re offline. Connect to change this week.';
export const BEST_WITHIN = 'Leftovers are best within 3 to 4 days.';
