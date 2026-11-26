import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateObject = vi.fn();
vi.mock('ai', async (orig) => ({ ...(await orig<typeof import('ai')>()), generateObject: (...a: unknown[]) => generateObject(...a) }));

import { identifyDish } from '@/lib/ai/identify';

const image = { base64: 'AAAA', mediaType: 'image/jpeg' as const };
const long = 'Pan-seared crispy-skin fish fillet with creamy lemon sauce and microgreens on a bed of wild rice and more';

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AI_FAKE;
});

describe('identifyDish with the real model call (mocked)', () => {
  it('clamps an over-long answer to the contract instead of rejecting it', async () => {
    generateObject.mockResolvedValue({
      object: {
        isFood: true, dish: long, searchQuery: long, confidence: 'medium',
        keyIngredients: [long, ...Array.from({ length: 11 }, (_, i) => `item ${i}`)],
      },
      usage: { inputTokens: 900, outputTokens: 60 },
    });
    const onUsage = vi.fn();
    const g = await identifyDish(image, { onUsage });
    expect(g.dish.length).toBeLessThanOrEqual(80);
    expect(g.dish).toBe(long.slice(0, 80).slice(0, long.slice(0, 80).lastIndexOf(' ')));
    expect(g.searchQuery.length).toBeLessThanOrEqual(80);
    expect(g.keyIngredients).toHaveLength(8);
    expect(g.keyIngredients.every((i) => i.length <= 40)).toBe(true);
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 900, outputTokens: 60 }));
  });

  it('asks for a short searchQuery and sends the image as a file part', async () => {
    generateObject.mockResolvedValue({
      object: { isFood: true, dish: 'Duck breast', searchQuery: 'duck breast', keyIngredients: [], confidence: 'high' },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    await identifyDish(image, {});
    const args = generateObject.mock.calls[0][0];
    expect(args.system).toMatch(/2 to 4 plain words/);
    expect(args.system).toMatch(/no word "recipe"/);
    expect(args.maxOutputTokens).toBe(300);
    expect(args.messages[0].content[1]).toEqual({ type: 'file', mediaType: 'image/jpeg', data: 'AAAA' });
  });
});
