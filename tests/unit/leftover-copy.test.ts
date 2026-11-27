import { describe, expect, it } from 'vitest';
import type { NightChoice } from '@/lib/domain/leftovers';
import { familyOfFive } from '@/lib/fixtures/household';
import { tacos } from '@/lib/fixtures/tacos';
import {
  choiceSub,
  doneBox,
  lastNightLine,
  leftoverRowNote,
  leftoverSheetCopy,
  pickerIntro,
  swapDoubleLine,
  takeOffNote,
  tintLines,
} from '@/lib/week/leftover-copy';

const choice = (o: Partial<NightChoice> = {}): NightChoice => ({ day: 'fri', daysLater: 2, taken: null, takenMealId: null, busy: false, current: false, ...o });

describe('leftover copy', () => {
  it('introduces the picker', () => {
    expect(pickerIntro('cook', 'Chicken tacos', 'wed')).toEqual({
      title: 'Cook double',
      sub: 'Chicken tacos on Wednesday. Buy and cook twice as much, then eat it again.',
      action: 'Cook double',
    });
    expect(pickerIntro('move', 'Chicken tacos', 'wed')).toEqual({ title: 'Move the leftovers', sub: 'Chicken tacos, cooked Wednesday.', action: 'Move' });
  });
  it('says what each night is', () => {
    expect(choiceSub(choice({ daysLater: 1 }), null)).toBe('The next night');
    expect(choiceSub(choice(), null)).toBe('2 days later');
    expect(choiceSub(choice({ busy: true }), null)).toBe('2 days later · busy night');
    expect(choiceSub(choice({ busy: true, current: true }), null)).toBe('2 days later · busy night · where they are now');
    expect(choiceSub(choice({ current: true }), null)).toBe('2 days later · where they are now');
    expect(choiceSub(choice({ taken: 'dinner', busy: true }), 'Falafel burgers')).toBe('Falafel burgers is planned');
    expect(choiceSub(choice({ taken: 'leftovers' }), null)).toBe('Leftovers are planned');
  });
  it('lists what the choice does', () => {
    const swap = 'Mom’s black beans double too.';
    expect(tintLines('fri', swap)).toEqual(['Friday adds nothing to the list and nothing to the budget.', swap]);
    expect(tintLines(null, swap)).toEqual(['The list gets twice the ingredients.', swap]);
    expect(tintLines('fri', null)).toEqual(['Friday adds nothing to the list and nothing to the budget.']);
    expect(tintLines(null, null)).toEqual(['The list gets twice the ingredients.']);
  });
  it('names whose swap doubles', () => {
    expect(swapDoubleLine(tacos, familyOfFive)).toBe('Mom’s black beans double too.');
    expect(swapDoubleLine({ ...tacos, everyoneVegetarian: true }, familyOfFive)).toBeNull();
    expect(swapDoubleLine(tacos, familyOfFive.filter((p) => p.diet === 'none'))).toBeNull();
    expect(swapDoubleLine({ ...tacos, vegSwap: null }, familyOfFive)).toBeNull();
  });
  it('explains a last night', () => {
    expect(lastNightLine('sat')).toBe('Saturday is the last night of this week, so there’s no later night for leftovers. You can still cook double for lunches.');
  });
  it('boxes the state of a cooking night', () => {
    expect(doneBox({ kind: 'usual' })).toBeNull();
    expect(doneBox({ kind: 'double', night: 'fri' })).toEqual({ head: 'Cooking double', sub: 'Leftovers on Friday' });
    expect(doneBox({ kind: 'double', night: null })).toEqual({ head: 'Cooking double', sub: 'No leftovers night. Extra for lunches.' });
    expect(doneBox({ kind: 'extra', servings: 2 })).toEqual({ head: 'Cooking 2 extra servings', sub: 'For leftovers, no set night' });
    expect(doneBox({ kind: 'extra', servings: 1 })).toEqual({ head: 'Cooking 1 extra serving', sub: 'For leftovers, no set night' });
  });
  it('writes the week row and the leftovers sheet', () => {
    expect(leftoverRowNote('Chicken tacos', 'wed')).toBe('Chicken tacos, from Wednesday');
    const swap = 'Mom’s black beans double too.';
    const c = leftoverSheetCopy('Chicken tacos', 'fri', 'wed', 2, swap);
    expect(c.nothing).toBe('Nothing to buy for Friday. It’s all on Wednesday’s list, Mom’s black beans too.');
    expect(c.when).toBe('Cooked Wednesday, 2 days before');
    expect(c.undo).toBe('Taking it off puts Wednesday back to the usual amount.');
    expect(leftoverSheetCopy('Chicken tacos', 'fri', 'wed', 2, null).nothing).toBe('Nothing to buy for Friday. It’s all on Wednesday’s list.');
    expect(leftoverSheetCopy('Chicken tacos', 'thu', 'wed', 1, null).when).toBe('Cooked Wednesday, the day before');
  });
  it('tells the cooking night what comes off with it', () => {
    expect(takeOffNote('fri')).toBe('Friday’s leftovers come off too.');
    expect(takeOffNote(null)).toBeNull();
  });
});
