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

describe('a model call that throws something else', () => {
  const timeout = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  const withStatus = (statusCode: number) => Object.assign(new Error(`gateway ${statusCode}`), { statusCode });
  const schema = z.object({ a: z.number() });
  const gen = (onUsage: () => void) => generateStructured({ task: 'text', schema, system: 's', prompt: 'p', onUsage });

  it('no HTTP status (a timeout, a dropped connection): billed at the model\'s own rate times the output limit', async () => {
    generateObject.mockRejectedValue(timeout());
    const onUsage = vi.fn();
    await expect(gen(onUsage)).rejects.toThrow('timeout');
    expect(onUsage).toHaveBeenCalledTimes(1);
    const report = onUsage.mock.calls[0][0];
    expect(report).toMatchObject({ inputTokens: 0, outputTokens: 4000 });
    expect(report.assumed).toBeUndefined(); // not the 6-cent unknown-model rate
  });

  it.each([401, 429, 500, 503])('an answer with HTTP status %i bills nothing', async (code) => {
    generateObject.mockRejectedValue(withStatus(code));
    const onUsage = vi.fn();
    await expect(gen(onUsage)).rejects.toThrow('gateway');
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('a status on the cause counts too', async () => {
    generateObject.mockRejectedValue(Object.assign(new Error('wrapped'), { cause: withStatus(502) }));
    const onUsage = vi.fn();
    await expect(gen(onUsage)).rejects.toThrow('wrapped');
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('identifyDish: no status bills at its own limit, a status bills nothing', async () => {
    const onUsage = vi.fn();
    generateObject.mockRejectedValue(timeout());
    await expect(identifyDish({ base64: 'AAAA', mediaType: 'image/jpeg' }, { onUsage })).rejects.toThrow('timeout');
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 0, outputTokens: 300 }));
    expect(onUsage.mock.calls[0][0].assumed).toBeUndefined();
    onUsage.mockClear();
    generateObject.mockRejectedValue(withStatus(401));
    await expect(identifyDish({ base64: 'AAAA', mediaType: 'image/jpeg' }, { onUsage })).rejects.toThrow('gateway');
    expect(onUsage).not.toHaveBeenCalled();
  });
});
