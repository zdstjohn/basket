import type { Person } from '@/lib/domain/types';

const person = (id: string, name: string, age: number, diet: Person['diet']): Person => ({
  id,
  name,
  age,
  diet,
  appetite: 1,
  dislikes: [],
});

export const familyOfFive: Person[] = [
  person('dad', 'Dad', 38, 'none'),
  person('mom', 'Mom', 39, 'vegetarian'),
  person('son', 'Son', 8, 'none'),
  person('daughter-6', 'Daughter', 6, 'none'),
  person('daughter-4', 'Daughter', 4, 'none'),
];
