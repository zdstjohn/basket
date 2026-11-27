import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const generateObject = vi.fn();
vi.mock('ai', async (orig) => ({ ...(await orig<typeof import('ai')>()), generateObject: (...a: unknown[]) => generateObject(...a) }));

import { generateStructured } from '@/lib/ai/provider';
import { identifyDish } from '@/lib/ai/identify';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AI_FAKE', '');
});

describe('a model answer that reports no token counts', () => {
  it('generateStructured reports it as assumed, at the output limit', async () => {
    generateObject.mockResolvedValue({ object: { a: 1 }, usage: {} });
    const onUsage = vi.fn();
    await generateStructured({ task: 'text', schema: z.object({ a: z.number() }), system: 's', prompt: 'p', onUsage });
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 0, outputTokens: 4000, assumed: true }));
  });

  it('keeps real counts as they are', async () => {
    generateObject.mockResolvedValue({ object: { a: 1 }, usage: { inputTokens: 12, outputTokens: 7 } });
    const onUsage = vi.fn();
    await generateStructured({ task: 'text', schema: z.object({ a: z.number() }), system: 's', prompt: 'p', onUsage });
    expect(onUsage).toHaveBeenCalledWith({ model: expect.any(String), inputTokens: 12, outputTokens: 7 });
  });

  it('identifyDish reports it as assumed, at its own 300 token limit', async () => {
    generateObject.mockResolvedValue({
      object: { isFood: false, dish: '', searchQuery: '', keyIngredients: [], confidence: 'low' },
      usage: { inputTokens: undefined, outputTokens: 5 },
    });
    const onUsage = vi.fn();
    await identifyDish({ base64: 'AAAA', mediaType: 'image/jpeg' }, { onUsage });
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 0, outputTokens: 300, assumed: true }));
  });
});
