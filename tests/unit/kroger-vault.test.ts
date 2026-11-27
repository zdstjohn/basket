import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KrogerNotConfigured } from '@/lib/kroger/token';
import { isVaultConfigured, seal, unseal } from '@/lib/kroger/vault';

const key = (n = 32, fill = 7) => Buffer.alloc(n, fill).toString('base64');

beforeEach(() => vi.stubEnv('KROGER_TOKEN_KEY', key()));
afterEach(() => vi.unstubAllEnvs());

describe('vault', () => {
  it('round-trips', () => {
    expect(unseal(seal('secret', 'u1'), 'u1')).toBe('secret');
  });
  it('seals the same text differently each time, in the v1 shape', () => {
    const a = seal('secret', 'u1');
    expect(a).not.toBe(seal('secret', 'u1'));
    expect(a).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });
  it('does not contain the plain text', () => {
    expect(seal('secret', 'u1')).not.toContain('secret');
  });
  it('refuses another person (wrong aad)', () => {
    expect(unseal(seal('secret', 'u1'), 'u2')).toBeNull();
  });
  it('refuses a changed ciphertext', () => {
    const [v, iv, ct, tag] = seal('secret', 'u1').split('.');
    const flipped = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
    expect(unseal([v, iv, flipped, tag].join('.'), 'u1')).toBeNull();
  });
  it('refuses a different key', () => {
    const sealed = seal('secret', 'u1');
    vi.stubEnv('KROGER_TOKEN_KEY', key(32, 9));
    expect(unseal(sealed, 'u1')).toBeNull();
  });
  it('never throws on garbage', () => {
    for (const g of ['garbage', '', 'v1...', 'v2.a.b.c', 'v1.a.b.c', 'v1.%%.%%.%%']) expect(unseal(g, 'u1')).toBeNull();
  });
  it('returns null (not a throw) when the key is missing', () => {
    const sealed = seal('secret', 'u1');
    vi.stubEnv('KROGER_TOKEN_KEY', '');
    expect(unseal(sealed, 'u1')).toBeNull();
  });
  it('is not configured with a 16-byte key, and seal throws KrogerNotConfigured', () => {
    vi.stubEnv('KROGER_TOKEN_KEY', key(16));
    expect(isVaultConfigured()).toBe(false);
    expect(() => seal('secret', 'u1')).toThrow(KrogerNotConfigured);
  });
  it('is configured with a 32-byte key, not when unset', () => {
    expect(isVaultConfigured()).toBe(true);
    vi.stubEnv('KROGER_TOKEN_KEY', '');
    expect(isVaultConfigured()).toBe(false);
  });
});
