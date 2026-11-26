export type BudgetState = 'green' | 'amber' | 'red';

export function budgetState(totalCents: number, targetCents: number, cushionCents: number): BudgetState {
  if (totalCents <= targetCents) return 'green';
  if (totalCents <= targetCents + cushionCents) return 'amber';
  return 'red';
}
