import { describe, expect, it } from 'vitest';
import nextConfig from '@/next.config';

describe('security headers', () => {
  it('sends the four plain headers on every path, and no script CSP', async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toHaveLength(1);
    expect(rules?.[0].source).toBe('/:path*');
    const h = Object.fromEntries((rules?.[0].headers ?? []).map(({ key, value }) => [key, value]));
    expect(h).toEqual({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
  });
});
