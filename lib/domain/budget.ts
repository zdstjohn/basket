import { formatMoney } from './money-input';

export type BudgetState = 'green' | 'amber' | 'red';

export function budgetState(totalCents: number, targetCents: number, cushionCents: number): BudgetState {
  if (totalCents <= targetCents) return 'green';
  if (totalCents <= targetCents + cushionCents) return 'amber';
  return 'red';
}

export type BudgetSentenceParts = {
  state: 'under' | 'wiggle' | 'past';
  lead: string;
  total: string;
  of: string;
  note: string;
  noteAmount: string | null;
  caveat: string | null;
};

const typed = (cents: number) => formatMoney(cents, { zero: 'drop' });

/** The week against the budget, in parts: the total always shows cents, amounts the family typed drop ".00". */
export function budgetSentence(
  totalCents: number,
  targetCents: number,
  cushionCents: number,
  opts: { exact: boolean },
): BudgetSentenceParts {
  const s = budgetState(totalCents, targetCents, cushionCents);
  const total = formatMoney(totalCents);
  const caveat = opts.exact ? null : 'Estimated total, for the amounts you’ll use';
  if (s === 'green') {
    const left = typed(targetCents - totalCents);
    return {
      state: 'under',
      lead: opts.exact ? 'This week’s total: ' : 'In the basket so far: ',
      total,
      of: ` of ${typed(targetCents)}`,
      note: cushionCents > 0 ? `${left} left, plus ${typed(cushionCents)} wiggle room if you need it.` : `${left} left.`,
      noteAmount: null,
      caveat,
    };
  }
  const of = ` of ${typed(targetCents)}.`;
  if (s === 'amber') {
    return { state: 'wiggle', lead: '', total, of, note: `${typed(totalCents - targetCents)} into the wiggle room.`, noteAmount: null, caveat };
  }
  const past = typed(totalCents - targetCents - cushionCents);
  return {
    state: 'past',
    lead: '',
    total,
    of,
    note: cushionCents > 0 ? `${past} past the wiggle room.` : `${past} over.`,
    noteAmount: past,
    caveat,
  };
}
