import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import { readBusy, setBusyChoice } from '@/lib/db/queries/busy';

type Verb = 'select' | 'update';
interface Op {
  table: string;
  verb: Verb;
  payload: unknown;
  filters: unknown[][];
}
type Result = { data: unknown; error: { message: string } | null };

/** A stand-in for the Supabase builder: records each operation; reads answer from the two lists. */
function stub(lists: { every?: unknown; week?: unknown }, failUpdate?: number) {
  const ops: Op[] = [];
  let updates = 0;
  const sb = {
    from(table: string) {
      const op: Op = { table, verb: 'select', payload: undefined, filters: [] };
      ops.push(op);
      const builder: unknown = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              const res: Result = { data: null, error: null };
              if (op.verb === 'select') res.data = { busy_days: table === 'households' ? (lists.every ?? null) : (lists.week ?? null) };
              else if (failUpdate === ++updates) res.error = { message: 'boom' };
              return (resolve: (v: unknown) => unknown) => resolve(res);
            }
            return (...args: unknown[]) => {
              if (prop === 'update') {
                op.verb = 'update';
                op.payload = args[0];
              } else op.filters.push([prop, ...args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  } as unknown as SupabaseClient<Database>;
  return { sb, writes: () => ops.filter((o) => o.verb === 'update') };
}

describe('readBusy', () => {
  it('cleans both lists', async () => {
    const { sb } = stub({ every: ['tue', 'junk'], week: null });
    expect(await readBusy(sb, 'h1', 'w1')).toEqual({ every: ['tue'], thisWeek: [] });
  });
});

describe('setBusyChoice', () => {
  it('writes only the week list when only it changed', async () => {
    const { sb, writes } = stub({ every: ['tue'], week: [] });
    const r = await setBusyChoice(sb, 'h1', 'w1', 'thu', 'week');
    expect(writes().map((o) => [o.table, o.payload])).toEqual([['weeks', { busy_days: ['thu'] }]]);
    expect(r).toEqual({ every: ['tue'], thisWeek: ['thu'] });
  });
  it('writes only the household list when only it changed', async () => {
    const { sb, writes } = stub({ every: ['tue'], week: [] });
    await setBusyChoice(sb, 'h1', 'w1', 'tue', 'no');
    expect(writes().map((o) => [o.table, o.payload])).toEqual([['households', { busy_days: [] }]]);
  });
  it('week to every writes the gaining list (households) first', async () => {
    const { sb, writes } = stub({ every: ['tue'], week: ['thu'] });
    await setBusyChoice(sb, 'h1', 'w1', 'thu', 'every');
    expect(writes().map((o) => [o.table, o.payload])).toEqual([
      ['households', { busy_days: ['tue', 'thu'] }],
      ['weeks', { busy_days: [] }],
    ]);
  });
  it('every to week writes the gaining list (weeks) first', async () => {
    const { sb, writes } = stub({ every: ['tue'], week: [] });
    await setBusyChoice(sb, 'h1', 'w1', 'tue', 'week');
    expect(writes().map((o) => [o.table, o.payload])).toEqual([
      ['weeks', { busy_days: ['tue'] }],
      ['households', { busy_days: [] }],
    ]);
  });
  it('writes nothing when the choice changes nothing', async () => {
    const { sb, writes } = stub({ every: ['tue'], week: [] });
    const r = await setBusyChoice(sb, 'h1', 'w1', 'sat', 'no');
    expect(writes()).toHaveLength(0);
    expect(r).toEqual({ every: ['tue'], thisWeek: [] });
  });
  it('starts from the database, not from the caller', async () => {
    const { sb, writes } = stub({ every: ['mon'], week: [] });
    await setBusyChoice(sb, 'h1', 'w1', 'thu', 'every');
    expect(writes().map((o) => o.payload)).toEqual([{ busy_days: ['mon', 'thu'] }]);
  });
  it('rejects when the first update fails and makes no second', async () => {
    const { sb, writes } = stub({ every: ['tue'], week: ['thu'] }, 1);
    await expect(setBusyChoice(sb, 'h1', 'w1', 'thu', 'every')).rejects.toThrow('boom');
    expect(writes()).toHaveLength(1);
  });
});
