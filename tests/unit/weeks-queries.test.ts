import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import type { WeekMeal } from '@/lib/db/rows';
import {
  NightTakenError,
  cookDouble,
  copyWeek,
  moveLeftover,
  removeLeftover,
  setWeekMeal,
  usualAmount,
} from '@/lib/db/queries/weeks';

type Verb = 'select' | 'insert' | 'update' | 'upsert' | 'delete';
type Filter = [string, ...unknown[]];
interface Op {
  table: string;
  verb: Verb;
  payload: unknown;
  filters: Filter[];
}
type Result = { data: unknown; error: { message: string; code?: string } | null };

/** A stand-in for the Supabase builder: records each operation, and answers it from `answer`. */
function stub(answer: (op: Op) => Partial<Result> | undefined = () => undefined) {
  const ops: Op[] = [];
  const sb = {
    from(table: string) {
      const op: Op = { table, verb: 'select', payload: undefined, filters: [] };
      ops.push(op);
      const builder: unknown = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              const r = answer(op);
              const res: Result = { data: null, error: null, ...r };
              return (resolve: (v: unknown) => unknown) => resolve(res);
            }
            return (...args: unknown[]) => {
              if (prop === 'insert' || prop === 'update' || prop === 'upsert') {
                op.verb = prop;
                op.payload = args[0];
              } else if (prop === 'delete') {
                op.verb = 'delete';
              } else {
                op.filters.push([prop, ...args]);
              }
              return builder;
            };
          },
        },
      );
      return builder;
    },
  } as unknown as SupabaseClient<Database>;
  return { sb, ops };
}

const row = (id: string, day: string, o: Partial<WeekMeal> = {}): WeekMeal => ({
  id,
  created_at: '2026-11-26T00:00:00Z',
  household_id: 'h1',
  week_id: 'w1',
  day,
  slot: 'dinner',
  meal_id: 'm-' + id,
  servings_override: null,
  updated_by: null,
  leftover_of: null,
  ...o,
});

const cook = row('cook', 'wed', { servings_override: null });
const brief = (o: Op) => [o.verb, o.payload, o.filters.filter(([f]) => f === 'eq' || f === 'in' || f === 'not')];
const err = (message: string, code?: string) => ({ error: { message, code } });

describe('cookDouble', () => {
  it('doubles, then inserts the leftovers night (never an upsert)', async () => {
    const { sb, ops } = stub();
    await cookDouble(sb, cook, 7.6, 'fri');
    expect(ops.map(brief)).toEqual([
      ['update', { servings_override: 7.6 }, [['eq', 'id', 'cook']]],
      ['select', undefined, [['eq', 'leftover_of', 'cook']]],
      ['insert', { household_id: 'h1', week_id: 'w1', day: 'fri', slot: 'dinner', meal_id: 'm-cook', servings_override: 0, leftover_of: 'cook' }, []],
    ]);
    expect(ops.some((o) => o.verb === 'upsert')).toBe(false);
  });

  const existing = row('left', 'fri', { leftover_of: 'cook', meal_id: 'm-cook', servings_override: 0 });
  const withRow = (op: Op) => (op.verb === 'select' ? { data: existing } : undefined);

  it('moves an existing leftovers night', async () => {
    const { sb, ops } = stub(withRow);
    await cookDouble(sb, cook, 7.6, 'sat');
    expect(ops.slice(2).map(brief)).toEqual([['update', { day: 'sat' }, [['eq', 'id', 'left']]]]);
    expect(ops.some((o) => o.verb === 'insert')).toBe(false);
  });
  it('writes nothing more when the night is unchanged', async () => {
    const { sb, ops } = stub(withRow);
    await cookDouble(sb, cook, 7.6, 'fri');
    expect(ops).toHaveLength(2);
  });
  it('clears the leftovers night with null', async () => {
    const { sb, ops } = stub(withRow);
    await cookDouble(sb, cook, 7.6, null);
    expect(ops.slice(2).map(brief)).toEqual([['delete', undefined, [['eq', 'id', 'left']]]]);
  });
  it('with null and no row, only doubles', async () => {
    const { sb, ops } = stub();
    await cookDouble(sb, cook, 7.6, null);
    expect(ops).toHaveLength(2);
  });
  it('turns a unique violation on insert into NightTakenError, after the double was written', async () => {
    const { sb, ops } = stub((op) => (op.verb === 'insert' ? err('dup', '23505') : undefined));
    await expect(cookDouble(sb, cook, 7.6, 'fri')).rejects.toBeInstanceOf(NightTakenError);
    expect(ops[0].verb).toBe('update');
  });
  it('turns a unique violation on move into NightTakenError', async () => {
    const { sb } = stub((op) => (op.verb === 'select' ? { data: existing } : op.verb === 'update' && (op.payload as { day?: string }).day ? err('dup', '23505') : undefined));
    await expect(cookDouble(sb, cook, 7.6, 'sat')).rejects.toBeInstanceOf(NightTakenError);
  });
  it('stops when the first update fails', async () => {
    const { sb, ops } = stub(() => err('boom'));
    await expect(cookDouble(sb, cook, 7.6, 'fri')).rejects.toThrow('boom');
    expect(ops).toHaveLength(1);
  });
  it('stops when the lookup fails', async () => {
    const { sb, ops } = stub((op) => (op.verb === 'select' ? err('lookup') : undefined));
    await expect(cookDouble(sb, cook, 7.6, 'fri')).rejects.toThrow('lookup');
    expect(ops).toHaveLength(2);
  });
  it('rejects with a plain Error on another insert failure', async () => {
    const { sb } = stub((op) => (op.verb === 'insert' ? err('nope', '42501') : undefined));
    const e = await cookDouble(sb, cook, 7.6, 'fri').catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(NightTakenError);
  });
});

describe('moveLeftover', () => {
  it('updates the day', async () => {
    const { sb, ops } = stub();
    await moveLeftover(sb, 'left', 'sat');
    expect(ops.map(brief)).toEqual([['update', { day: 'sat' }, [['eq', 'id', 'left']]]]);
  });
  it('maps a unique violation, and rethrows others', async () => {
    await expect(moveLeftover(stub(() => err('dup', '23505')).sb, 'left', 'sat')).rejects.toBeInstanceOf(NightTakenError);
    const e = await moveLeftover(stub(() => err('boom')).sb, 'left', 'sat').catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(NightTakenError);
  });
});

describe('removeLeftover', () => {
  const left = row('left', 'fri', { leftover_of: 'cook' });
  it('deletes the leftovers night, then clears the cooking night', async () => {
    const { sb, ops } = stub();
    await removeLeftover(sb, left);
    expect(ops.map(brief)).toEqual([
      ['delete', undefined, [['eq', 'id', 'left']]],
      ['update', { servings_override: null }, [['eq', 'id', 'cook']]],
    ]);
  });
  it('does not touch the cooking night when the delete fails', async () => {
    const { sb, ops } = stub((op) => (op.verb === 'delete' ? err('boom') : undefined));
    await expect(removeLeftover(sb, left)).rejects.toThrow('boom');
    expect(ops).toHaveLength(1);
  });
  it('refuses a row that is not a leftovers night', async () => {
    const { sb, ops } = stub();
    await expect(removeLeftover(sb, row('x', 'fri'))).rejects.toThrow();
    expect(ops).toHaveLength(0);
  });
});

describe('usualAmount', () => {
  it('removes the leftovers night, then clears the override', async () => {
    const { sb, ops } = stub();
    await usualAmount(sb, cook);
    expect(ops.map(brief)).toEqual([
      ['delete', undefined, [['eq', 'leftover_of', 'cook']]],
      ['update', { servings_override: null }, [['eq', 'id', 'cook']]],
    ]);
  });
});

describe('setWeekMeal', () => {
  it('writes an ordinary dinner', async () => {
    const { sb, ops } = stub((op) =>
      op.table === 'weeks' ? { data: { household_id: 'h1', households: { slots: ['dinner'] } } } : op.verb === 'select' && op.table === 'week_meals' ? { data: null } : op.table === 'meals' ? { data: [] } : undefined,
    );
    await setWeekMeal(sb, 'w1', 'mon', 'dinner', 'm1', 5.8);
    const up = ops.find((o) => o.verb === 'upsert')!;
    expect(up.payload).toEqual({ household_id: 'h1', week_id: 'w1', day: 'mon', slot: 'dinner', meal_id: 'm1', servings_override: 5.8, leftover_of: null });
  });
});

describe('copyWeek', () => {
  const srcWed = row('s-wed', 'wed', { week_id: 'src', meal_id: 'mA', servings_override: 7.6 });
  const srcFri = row('s-fri', 'fri', { week_id: 'src', meal_id: 'mA', servings_override: 0, leftover_of: 's-wed' });
  const srcMon = row('s-mon', 'mon', { week_id: 'src', meal_id: 'mB' });
  const dstMon = row('d-mon', 'mon', { week_id: 'dst', meal_id: 'mOther' });
  const dstTue = row('d-tue', 'tue', { week_id: 'dst', meal_id: 'mOther', leftover_of: 'd-mon', servings_override: 0 });
  const dstSat = row('d-sat', 'sat', { week_id: 'dst', meal_id: 'mC' });

  function run(source: WeekMeal[], target: WeekMeal[]) {
    return stub((op) => {
      const wk = op.filters.find(([f, c]) => f === 'eq' && c === 'week_id')?.[2];
      if (op.table === 'week_meals' && op.verb === 'select') return { data: wk === 'src' ? source : target };
      if (op.table === 'week_meals' && op.verb === 'upsert' && op.filters.some(([f]) => f === 'select')) {
        return { data: (op.payload as { day: string; slot: string }[]).map((r) => ({ id: 'new-' + r.day, day: r.day, slot: r.slot })) };
      }
      if (op.table === 'meals' && op.verb === 'select') return { data: [{ id: 'mA', times_planned: 1 }, { id: 'mB', times_planned: 1 }] };
      return undefined;
    });
  }

  it('keeps the link: clears target leftovers, upserts cooked rows, then relinks leftovers', async () => {
    const { sb, ops } = run([srcWed, srcFri, srcMon], [dstMon, dstTue, dstSat]);
    await copyWeek(sb, 'src', 'dst');
    const writes = ops.filter((o) => o.table === 'week_meals' && o.verb !== 'select');
    expect(writes[0].verb).toBe('delete');
    expect(writes[0].filters).toEqual([['eq', 'week_id', 'dst'], ['not', 'leftover_of', 'is', null]]);

    const cooked = writes[1].payload as Record<string, unknown>[];
    expect(writes[1].verb).toBe('upsert');
    expect(cooked).toHaveLength(2);
    expect(cooked.every((r) => r.leftover_of === null)).toBe(true);
    expect(cooked.find((r) => r.day === 'wed')?.servings_override).toBe(7.6);

    expect(writes[2].verb).toBe('upsert');
    expect(writes[2].payload).toEqual([
      { household_id: 'h1', week_id: 'dst', day: 'fri', slot: 'dinner', meal_id: 'mA', servings_override: 0, leftover_of: 'new-wed' },
    ]);

    expect(writes[3].verb).toBe('delete');
    expect(writes[3].filters).toEqual([['in', 'id', ['d-sat']]]);

    const bumped = ops.filter((o) => o.table === 'meals' && o.verb === 'update').length;
    expect(bumped).toBe(2); // Mon's changed meal and Wed's, never the leftovers row's
    const meals = ops.find((o) => o.table === 'meals' && o.verb === 'select')!;
    expect(meals.filters.find(([f]) => f === 'in')?.[2]).toEqual(['mA', 'mB']);
  });

  it('skips a leftovers row whose cooking row is missing', async () => {
    const { sb, ops } = run([srcFri, srcMon], [dstSat]);
    await expect(copyWeek(sb, 'src', 'dst')).resolves.toBeUndefined();
    const upserts = ops.filter((o) => o.verb === 'upsert');
    expect(upserts).toHaveLength(1);
    expect((upserts[0].payload as unknown[]).length).toBe(1);
  });

  it('does nothing for an empty source', async () => {
    const { sb, ops } = run([], [dstMon]);
    await copyWeek(sb, 'src', 'dst');
    expect(ops.every((o) => o.verb === 'select')).toBe(true);
  });
});
