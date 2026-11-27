import { afterEach, describe, expect, it, vi } from 'vitest';
import { listCartSends } from '@/lib/db/queries/kroger';

const good = { key: 'k', canonical: 'milk', upc: '0001111041700', name: 'Milk', quantity: 1, cents: 350 };
const sb = (items: unknown) =>
  ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({
            data: [{ id: 's1', created_at: '2026-11-26T10:00:00Z', user_id: 'u1', profile_id: null, modality: 'PICKUP', status: 'sent', items, total_cents: 350 }],
            error: null,
          }),
        }),
      }),
    }),
  }) as never;
afterEach(() => vi.restoreAllMocks());

describe('listCartSends', () => {
  it('keeps readable lines quietly', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await listCartSends(sb([good]), 'w'))[0].items).toEqual([good]);
    expect(err).not.toHaveBeenCalled();
  });
  it('drops an unreadable line and says so, with fixed text', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await listCartSends(sb([good, { upc: 5 }]), 'w'))[0].items).toEqual([good]);
    expect(err).toHaveBeenCalledWith('cart send has unreadable lines');
  });
});
