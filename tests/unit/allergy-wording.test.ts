import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The wording gate for allergy copy. Task 14 re-runs it.
const root = process.cwd();

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = join(dir, name);
    const full = join(root, rel);
    if (statSync(full).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(name) ? [rel] : [];
  });
}

const everywhere = ['app', 'components', 'lib'].flatMap(sourceFiles);
const strict = [
  'lib/domain/flags.ts',
  'lib/domain/families.ts',
  ...sourceFiles('components/flags'),
  'components/household/FoodChips.tsx',
  'components/PersonRow.tsx',
  'app/(app)/household/PersonEditor.tsx',
];
const read = (file: string): string => readFileSync(join(root, file), 'utf8');

describe('allergy wording', () => {
  it('finds the files it is meant to check', () => {
    expect(everywhere.length).toBeGreaterThan(50);
    expect(strict.length).toBeGreaterThanOrEqual(7);
  });
  it('never claims a recipe is free of an allergen, anywhere in the app', () => {
    const bad = everywhere.filter((f) => /nut-free|allergen-free|no allergens/i.test(read(f)));
    expect(bad).toEqual([]);
  });
  it('keeps the allergy files free of the words that sound like a guarantee, in code and comments', () => {
    const bad = strict.filter((f) => /\bsafe\b/i.test(read(f)) || /free of/i.test(read(f)));
    expect(bad).toEqual([]);
  });
});
