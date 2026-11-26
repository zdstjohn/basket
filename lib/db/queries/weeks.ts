import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import type { Week, WeekMeal } from '@/lib/db/rows';
import { isDay } from '@/lib/week/format';
import type { Day } from '@/lib/domain/weeks';

type Sb = SupabaseClient<Database>;

const UNIQUE_VIOLATION = '23505';

/** The week row if it exists; never creates one. */
export async function findWeek(sb: Sb, householdId: string, weekStart: string): Promise<Week | null> {
  const { data, error } = await sb
    .from('weeks')
    .select('*')
    .eq('household_id', householdId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** The week row, created on first use. Two phones opening a new week at once both get the same row. */
export async function getOrCreateWeek(sb: Sb, householdId: string, weekStart: string): Promise<Week> {
  const existing = await findWeek(sb, householdId, weekStart);
  if (existing) return existing;
  const { data, error } = await sb
    .from('weeks')
    .insert({ household_id: householdId, week_start: weekStart })
    .select()
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      const again = await findWeek(sb, householdId, weekStart);
      if (again) return again;
    }
    throw new Error(error.message);
  }
  return data;
}

export async function listWeekMeals(sb: Sb, weekId: string): Promise<WeekMeal[]> {
  const { data, error } = await sb.from('week_meals').select('*').eq('week_id', weekId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Adds one to each meal's made-count. Not atomic, and a slightly-off count is harmless. */
async function bumpTimesPlanned(sb: Sb, mealIds: string[]): Promise<void> {
  const counts = new Map<string, number>();
  for (const id of mealIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  if (counts.size === 0) return;
  const { data, error } = await sb.from('meals').select('id, times_planned').in('id', [...counts.keys()]);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const { error: upErr } = await sb
      .from('meals')
      .update({ times_planned: row.times_planned + (counts.get(row.id) ?? 0) })
      .eq('id', row.id);
    if (upErr) throw new Error(upErr.message);
  }
}

/**
 * Puts a meal on a day (or takes it off with a null meal). Setting the same
 * (week, day, slot) twice keeps one row: the last write wins on every phone.
 */
export async function setWeekMeal(
  sb: Sb,
  weekId: string,
  day: Day,
  slot: string,
  mealId: string | null,
  servingsOverride: number | null = null,
): Promise<void> {
  if (!isDay(day)) throw new Error('Unknown day');

  const { data: week, error: weekErr } = await sb
    .from('weeks')
    .select('household_id, households!inner(slots)')
    .eq('id', weekId)
    .single();
  if (weekErr) throw new Error(weekErr.message);
  const slots = (week.households as unknown as { slots: string[] }).slots;
  if (!slots.includes(slot)) throw new Error('Unknown meal slot');

  if (mealId === null) {
    const { error } = await sb.from('week_meals').delete().eq('week_id', weekId).eq('day', day).eq('slot', slot);
    if (error) throw new Error(error.message);
    return;
  }

  const { data: current, error: curErr } = await sb
    .from('week_meals')
    .select('meal_id')
    .eq('week_id', weekId)
    .eq('day', day)
    .eq('slot', slot)
    .maybeSingle();
  if (curErr) throw new Error(curErr.message);

  const { error } = await sb.from('week_meals').upsert(
    {
      household_id: week.household_id,
      week_id: weekId,
      day,
      slot,
      meal_id: mealId,
      servings_override: servingsOverride,
    },
    { onConflict: 'week_id,day,slot' },
  );
  if (error) throw new Error(error.message);
  if (current?.meal_id !== mealId) await bumpTimesPlanned(sb, [mealId]);
}

/** Copies one week's dinners into another, replacing what the target had (copies first, then removes the rest). */
export async function copyWeek(sb: Sb, fromWeekId: string, toWeekId: string): Promise<void> {
  const [from, to] = await Promise.all([listWeekMeals(sb, fromWeekId), listWeekMeals(sb, toWeekId)]);
  if (from.length === 0) return;
  const householdId = from[0].household_id;

  const { error } = await sb.from('week_meals').upsert(
    from.map((m) => ({
      household_id: householdId,
      week_id: toWeekId,
      day: m.day,
      slot: m.slot,
      meal_id: m.meal_id,
      servings_override: m.servings_override,
    })),
    { onConflict: 'week_id,day,slot' },
  );
  if (error) throw new Error(error.message);

  // Only after the copies are in: a failure above leaves the old week intact.
  const wanted = new Set(from.map((m) => `${m.day}/${m.slot}`));
  const stale = to.filter((m) => !wanted.has(`${m.day}/${m.slot}`)).map((m) => m.id);
  if (stale.length > 0) {
    const { error } = await sb.from('week_meals').delete().in('id', stale);
    if (error) throw new Error(error.message);
  }


  const had = new Map(to.map((m) => [`${m.day}/${m.slot}`, m.meal_id]));
  await bumpTimesPlanned(
    sb,
    from.filter((m) => had.get(`${m.day}/${m.slot}`) !== m.meal_id).map((m) => m.meal_id),
  );
}
