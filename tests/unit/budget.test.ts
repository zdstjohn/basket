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
