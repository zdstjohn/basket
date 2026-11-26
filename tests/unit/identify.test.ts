import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { identifyDish } from '@/lib/ai/identify';
import { UnreadableError } from '@/lib/ai/provider';
import { DishGuessSchema } from '@/lib/ai/schemas';

const food = readFileSync('e2e/fixtures/food.jpg').toString('base64');
const tiny = (extra = '') => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from(extra)]).toString('base64');

beforeEach(() => {
  process.env.AI_FAKE = '1';
});

describe('identifyDish (fake model)', () => {
  it('guesses chicken tacos for a food photo and reports usage', async () => {
    const onUsage = vi.fn();
    const guess = await identifyDish({ base64: food, mediaType: 'image/jpeg' }, { onUsage });
    expect(guess).toMatchObject({ isFood: true, dish: 'Chicken tacos', searchQuery: 'chicken tacos' });
    expect(DishGuessSchema.safeParse(guess).success).toBe(true);
    expect(onUsage).toHaveBeenCalledOnce();
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ model: 'fake', inputTokens: expect.any(Number) }));
  });

  it('says isFood false for something that is not a dish', async () => {
    const guess = await identifyDish({ base64: tiny(), mediaType: 'image/jpeg' }, { onUsage: vi.fn() });
    expect(guess.isFood).toBe(false);
  });

  it('throws UnreadableError for an invalid answer, with usage still reported', async () => {
    const onUsage = vi.fn();
    const err = await identifyDish({ base64: tiny('broken'), mediaType: 'image/jpeg' }, { onUsage }).catch((e) => e);
    expect(err).toBeInstanceOf(UnreadableError);
    expect(onUsage).toHaveBeenCalledOnce();
  });
});

describe('DishGuessSchema', () => {
  const ok = { isFood: true, dish: 'Pad thai', searchQuery: 'pad thai', keyIngredients: ['noodles'], confidence: 'low' };
  it('accepts the documented shape and rejects overlong or unknown values', () => {
    expect(DishGuessSchema.safeParse(ok).success).toBe(true);
    expect(DishGuessSchema.safeParse({ ...ok, dish: 'x'.repeat(81) }).success).toBe(false);
    expect(DishGuessSchema.safeParse({ ...ok, keyIngredients: Array(9).fill('a') }).success).toBe(false);
    expect(DishGuessSchema.safeParse({ ...ok, keyIngredients: ['x'.repeat(41)] }).success).toBe(false);
    expect(DishGuessSchema.safeParse({ ...ok, confidence: 'certain' }).success).toBe(false);
  });
});
