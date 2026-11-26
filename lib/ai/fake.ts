import { tacos } from '@/lib/fixtures/tacos';

/**
 * Fixed prices the fake estimator returns, in cents per base unit, so end-to-end totals are predictable:
 * 1 cent per gram (about $4.54 a pound), 0.1 cent per millilitre (about $3.79 a gallon), 50 cents per item.
 */
export const FAKE_CENTS_PER_BASE = { gram: 1, milliliter: 0.1, each: 50 } as const;

export type AiTask = 'lines' | 'vegswap' | 'text' | 'estimate';

/** Deterministic stand-in for the model (AI_FAKE=1). Input containing "broken" yields invalid output. */
export function fakeGenerate(task: AiTask, prompt: string): unknown {
  if (prompt.toLowerCase().includes('broken')) return { nonsense: true };
  switch (task) {
    case 'lines':
      return { ingredients: tacos.ingredients, vegSwap: tacos.vegSwap };
    case 'vegswap':
      return { vegSwap: tacos.vegSwap };
    case 'text':
      return {
        name: prompt.split('\n')[0].trim().slice(0, 120) || tacos.name,
        baseServings: tacos.baseServings,
        ingredients: tacos.ingredients,
        vegSwap: tacos.vegSwap,
        sourceUrl: null,
        photo: null,
      };
    case 'estimate': {
      const items = JSON.parse(prompt.slice(prompt.indexOf('['))) as { canonical: string; baseUnit?: string }[];
      const centsFor = (u?: string): number =>
        u === 'gram' ? FAKE_CENTS_PER_BASE.gram : u === 'milliliter' ? FAKE_CENTS_PER_BASE.milliliter : FAKE_CENTS_PER_BASE.each;
      return { prices: items.map((i) => ({ canonical: i.canonical, centsPerBase: centsFor(i.baseUnit) })) };
    }
  }
}
