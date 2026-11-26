import { tacos } from '@/lib/fixtures/tacos';

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
      const items = JSON.parse(prompt.slice(prompt.indexOf('['))) as { canonical: string }[];
      return { prices: items.map((i) => ({ canonical: i.canonical, centsPerBase: 1 })) };
    }
  }
}
