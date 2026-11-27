import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeOn } from '@/lib/fake';

afterEach(() => vi.unstubAllEnvs());

describe('fakeOn', () => {
  it('is true only when the variable is 1', () => {
    vi.stubEnv('KROGER_FAKE', '1');
    expect(fakeOn('KROGER_FAKE')).toBe(true);
    vi.stubEnv('KROGER_FAKE', 'true');
    expect(fakeOn('KROGER_FAKE')).toBe(false);
    vi.stubEnv('KROGER_FAKE', '');
    expect(fakeOn('KROGER_FAKE')).toBe(false);
  });
  it('is ignored when VERCEL=1', () => {
    vi.stubEnv('VERCEL', '1');
    for (const name of ['KROGER_FAKE', 'AI_FAKE', 'RECIPE_SEARCH_FAKE']) {
      vi.stubEnv(name, '1');
      expect(fakeOn(name)).toBe(false);
    }
  });
});
