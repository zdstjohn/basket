import { describe, expect, it } from 'vitest';
import { budgetState } from '@/lib/domain/budget';

describe('budgetState', () => {
  it('is green up to and including the target', () => {
    expect(budgetState(18412, 20000, 2500)).toBe('green');
    expect(budgetState(20000, 20000, 2500)).toBe('green');
  });
  it('is amber within the cushion', () => {
    expect(budgetState(20001, 20000, 2500)).toBe('amber');
    expect(budgetState(22500, 20000, 2500)).toBe('amber');
  });
  it('is red above target plus cushion', () => {
    expect(budgetState(22501, 20000, 2500)).toBe('red');
  });
});

import { budgetSentence } from '@/lib/domain/budget';

describe('budgetSentence', () => {
  it('under, estimated', () => {
    expect(budgetSentence(16800, 20000, 2500, { exact: false })).toEqual({ state: 'under', lead: 'In the basket so far: ', total: '$168.00', of: ' of $200', note: '$32 left, plus $25 wiggle room if you need it.', noteAmount: null, caveat: 'Estimated total, for the amounts you’ll use' });
  });
  it('under, exact, no cushion keeps real cents in the note', () => {
    expect(budgetSentence(16743, 20000, 0, { exact: true })).toMatchObject({ lead: 'This week’s total: ', total: '$167.43', note: '$32.57 left.', caveat: null });
  });
  it('wiggle', () => {
    expect(budgetSentence(21200, 20000, 2500, { exact: true })).toMatchObject({ state: 'wiggle', lead: '', total: '$212.00', of: ' of $200.', note: '$12 into the wiggle room.' });
  });
  it('past', () => {
    expect(budgetSentence(23600, 20000, 2500, { exact: true })).toMatchObject({ state: 'past', of: ' of $200.', note: '$11 past the wiggle room.', noteAmount: '$11' });
  });
  it('edges', () => {
    expect(budgetSentence(20000, 20000, 2500, { exact: true }).state).toBe('under');
    expect(budgetSentence(22500, 20000, 2500, { exact: true }).state).toBe('wiggle');
  });
  it('thousands', () => {
    expect(budgetSentence(123456, 1000000, 0, { exact: true })).toMatchObject({ total: '$1,234.56', of: ' of $10,000' });
  });
});
