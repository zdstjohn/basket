import { describe, expect, it, vi } from 'vitest';
import { clearChoice, setChoice } from '@/lib/db/queries/kroger';

/** A Supabase stand-in that records upserts and deletes on item_product_choice. */
function choiceSb(error: string | null = null) {
  const calls = {
    upserts: [] as { table: string; row: Record<string, unknown>; opts: unknown }[],
    deletes: [] as { table: string; eq: [string, unknown][] }[],
  };
  const sb = {
    from: (table: string) => ({
      upsert: async (row: Record<string, unknown>, opts: unknown) => {
        calls.upserts.push({ table, row, opts });
        return { error: error ? { message: error } : null };
      },
      delete: () => {
        const eq: [string, unknown][] = [];
        const b = {
          eq: (c: string, v: unknown) => (eq.push([c, v]), b),
          then: (res: (v: unknown) => unknown) => {
            calls.deletes.push({ table, eq });
            return Promise.resolve({ error: error ? { message: error } : null }).then(res);
          },
        };
        return b;
      },
    }),
  };
  return { sb: sb as never, calls };
}

describe('setChoice', () => {
  it('upserts on household and food and stamps updated_at', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-26T10:00:00Z'));
    const { sb, calls } = choiceSb();
    await setChoice(sb, 'h1', 'black beans', { upc: '0001111000002' });
    vi.useRealTimers();
    expect(calls.upserts).toHaveLength(1);
    expect(calls.upserts[0].table).toBe('item_product_choice');
    expect(calls.upserts[0].opts).toEqual({ onConflict: 'household_id,canonical' });
    expect(calls.upserts[0].row).toEqual({
      household_id: 'h1',
      canonical: 'black beans',
      upc: '0001111000002',
      updated_at: '2026-11-26T10:00:00.000Z',
    });
  });

  it('sends search_term and upc only for the keys given', async () => {
    const { sb, calls } = choiceSb();
    await setChoice(sb, 'h1', 'black beans', { searchTerm: 'organic black beans' });
    await setChoice(sb, 'h1', 'black beans', { searchTerm: 'organic black beans', upc: null });
    expect('upc' in calls.upserts[0].row).toBe(false);
    expect(calls.upserts[0].row.search_term).toBe('organic black beans');
    expect(calls.upserts[1].row.upc).toBeNull();
    expect(calls.upserts[1].row.search_term).toBe('organic black beans');
  });

  it('throws the database message when the save fails', async () => {
    const { sb } = choiceSb('nope');
    await expect(setChoice(sb, 'h1', 'x', { upc: null })).rejects.toThrow('nope');
  });
});

describe('clearChoice', () => {
  it('deletes the choice by household and food', async () => {
    const { sb, calls } = choiceSb();
    await clearChoice(sb, 'h1', 'black beans');
    expect(calls.deletes).toEqual([
      { table: 'item_product_choice', eq: [['household_id', 'h1'], ['canonical', 'black beans']] },
    ]);
  });
});
