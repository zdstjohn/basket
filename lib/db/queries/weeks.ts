import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import type { Week, WeekMeal } from '@/lib/db/rows';
import { isDay } from '@/lib/week/format';
import type { Day } from '@/lib/domain/weeks';
import { cookNightOf, cookedNights, isLeftover } from '@/lib/domain/leftovers';

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
      leftover_of: null,
    },
    { onConflict: 'week_id,day,slot' },
  );
  if (error) throw new Error(error.message);
  if (current?.meal_id !== mealId) await bumpTimesPlanned(sb, [mealId]);
}

/** The chosen night got a dinner first (unique violation). */
export class NightTakenError extends Error {
  constructor() {
    super('That night already has a dinner');
    this.name = 'NightTakenError';
  }
}

const fail = (error: { message: string }): never => {
  throw new Error(error.message);
};

/**
 * Doubles the cooking night, then sets, moves or clears its leftovers night. `servings` comes from
 * doubleServings(). The double is written first on purpose: if the second write fails the week says
 * "Cooking double / No leftovers night", which is true and which Change repairs. The reverse order
 * could leave a leftovers night with a single batch.
 */
export async function cookDouble(sb: Sb, cook: WeekMeal, servings: number, leftoverDay: Day | null): Promise<void> {
  const { error: upErr } = await sb.from('week_meals').update({ servings_override: servings }).eq('id', cook.id);
  if (upErr) fail(upErr);

  const { data: row, error: rowErr } = await sb.from('week_meals').select('*').eq('leftover_of', cook.id).maybeSingle();
  if (rowErr) fail(rowErr);

  if (leftoverDay === null) {
    if (!row) return;
    const { error } = await sb.from('week_meals').delete().eq('id', row.id);
    if (error) fail(error);
    return;
  }

  // An insert or an update, never an upsert, so it cannot replace a dinner.
  let error: { message: string; code?: string } | null;
  if (row) {
    if (row.day === leftoverDay) return;
    ({ error } = await sb.from('week_meals').update({ day: leftoverDay }).eq('id', row.id));
  } else {
    ({ error } = await sb.from('week_meals').insert({
      household_id: cook.household_id,
      week_id: cook.week_id,
      day: leftoverDay,
      slot: cook.slot,
      meal_id: cook.meal_id,
      servings_override: 0,
      leftover_of: cook.id,
    }));
  }
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new NightTakenError();
    fail(error);
  }
}

export async function moveLeftover(sb: Sb, leftoverId: string, day: Day): Promise<void> {
  const { error } = await sb.from('week_meals').update({ day }).eq('id', leftoverId);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new NightTakenError();
    fail(error);
  }
}

/** Takes a leftovers night off, then puts its cooking night back to the usual amount. */
export async function removeLeftover(sb: Sb, leftover: WeekMeal): Promise<void> {
  if (!leftover.leftover_of) throw new Error('Not a leftovers night');
  const { error } = await sb.from('week_meals').delete().eq('id', leftover.id);
  if (error) fail(error);
  const { error: upErr } = await sb.from('week_meals').update({ servings_override: null }).eq('id', leftover.leftover_of);
  if (upErr) fail(upErr);
}

/** Back to the usual amount: removes the leftovers night if there is one, then clears the override. */
export async function usualAmount(sb: Sb, cook: WeekMeal): Promise<void> {
  const { error } = await sb.from('week_meals').delete().eq('leftover_of', cook.id);
  if (error) fail(error);
  const { error: upErr } = await sb.from('week_meals').update({ servings_override: null }).eq('id', cook.id);
  if (upErr) fail(upErr);
}

/**
 * Copies one week's dinners into another, replacing what the target had (copies first, then removes the rest).
 * A doubled dinner keeps its leftovers night, linked to the new cooking row.
 */
export async function copyWeek(sb: Sb, fromWeekId: string, toWeekId: string): Promise<void> {
  const [from, to] = await Promise.all([listWeekMeals(sb, fromWeekId), listWeekMeals(sb, toWeekId)]);
  if (from.length === 0) return;
  const householdId = from[0].household_id;
  const key = (m: { day: string; slot: string }): string => `${m.day}/${m.slot}`;

  // The target's leftovers rows are being replaced anyway; clearing them first means no step below
  // can trip the one-leftovers-night-per-cooking-night rule.
  const { error: clearErr } = await sb.from('week_meals').delete().eq('week_id', toWeekId).not('leftover_of', 'is', null);
  if (clearErr) fail(clearErr);

  const cooked = cookedNights(from);
  const ids = new Map<string, string>();
  if (cooked.length > 0) {
    const { data, error } = await sb
      .from('week_meals')
      .upsert(
        cooked.map((m) => ({
          household_id: householdId,
          week_id: toWeekId,
          day: m.day,
          slot: m.slot,
          meal_id: m.meal_id,
          servings_override: m.servings_override,
          leftover_of: null,
        })),
        { onConflict: 'week_id,day,slot' },
      )
      .select('id, day, slot');
    if (error) fail(error);
    for (const r of data ?? []) ids.set(key(r), r.id);
  }

  const leftovers = from
    .filter(isLeftover)
    .map((l) => {
      const cook = cookNightOf(from, l);
      const cookId = cook ? ids.get(key(cook)) : undefined;
      return cookId
        ? {
            household_id: householdId,
            week_id: toWeekId,
            day: l.day,
            slot: l.slot,
            meal_id: l.meal_id,
            servings_override: 0,
            leftover_of: cookId,
          }
        : null;
    })
    .filter((r) => r !== null);
  if (leftovers.length > 0) {
    const { error } = await sb.from('week_meals').upsert(leftovers, { onConflict: 'week_id,day,slot' });
    if (error) fail(error);
  }

  // Only after the copies are in: a failure above leaves the old week's cooked dinners intact.
  const wanted = new Set(from.map(key));
  const stale = to.filter((m) => !isLeftover(m) && !wanted.has(key(m))).map((m) => m.id);
  if (stale.length > 0) {
    const { error } = await sb.from('week_meals').delete().in('id', stale);
    if (error) fail(error);
  }

  const had = new Map(to.map((m) => [key(m), m.meal_id]));
  await bumpTimesPlanned(
    sb,
    cooked.filter((m) => had.get(key(m)) !== m.meal_id).map((m) => m.meal_id),
  );
}
