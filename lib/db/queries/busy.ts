import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import { cleanDays, withChoice, type BusyChoice } from '@/lib/domain/busy';
import type { Day } from '@/lib/domain/weeks';

type Sb = SupabaseClient<Database>;
export interface BusyLists {
  every: Day[];
  thisWeek: Day[];
}

/** Both lists, read fresh and cleaned. */
export async function readBusy(sb: Sb, householdId: string, weekId: string): Promise<BusyLists> {
  const [h, w] = await Promise.all([
    sb.from('households').select('busy_days').eq('id', householdId).single(),
    sb.from('weeks').select('busy_days').eq('id', weekId).single(),
  ]);
  if (h.error) throw new Error(h.error.message);
  if (w.error) throw new Error(w.error.message);
  return { every: cleanDays(h.data?.busy_days), thisWeek: cleanDays(w.data?.busy_days) };
}

const same = (a: Day[], b: Day[]): boolean => a.length === b.length && a.every((d, i) => d === b[i]);

/**
 * Reads both lists fresh, applies the choice, writes only the list that changed, and returns the result.
 * When both change, the list that gains the day is written first, so a failure between the two leaves the night busy.
 */
export async function setBusyChoice(sb: Sb, householdId: string, weekId: string, day: Day, choice: BusyChoice): Promise<BusyLists> {
  const before = await readBusy(sb, householdId, weekId);
  const after = withChoice(before.every, before.thisWeek, day, choice);
  const writes: { gains: boolean; run: () => PromiseLike<{ error: { message: string } | null }> }[] = [];
  if (!same(before.every, after.every)) {
    writes.push({
      gains: after.every.includes(day),
      run: () => sb.from('households').update({ busy_days: after.every }).eq('id', householdId),
    });
  }
  if (!same(before.thisWeek, after.thisWeek)) {
    writes.push({
      gains: after.thisWeek.includes(day),
      run: () => sb.from('weeks').update({ busy_days: after.thisWeek }).eq('id', weekId),
    });
  }
  writes.sort((a, b) => Number(b.gains) - Number(a.gains));
  for (const w of writes) {
    const { error } = await w.run();
    if (error) throw new Error(error.message);
  }
  return after;
}
