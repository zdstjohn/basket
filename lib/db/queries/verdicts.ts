import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import type { VerdictRow } from '@/lib/db/rows';
import type { Dinner, Verdict, Vote } from '@/lib/domain/verdicts';
import { dinnerDate, type Day } from '@/lib/domain/weeks';
import { addDays, isDay } from '@/lib/week/format';

type Sb = SupabaseClient<Database>;

const UNIQUE_VIOLATION = '23505';
const LIMIT = 1000;
const VOTES: readonly string[] = ['up', 'down', 'skip'];

/** A row as a verdict; vote values other than up, down and skip are dropped. */
export function toVerdict(row: VerdictRow): Verdict {
  const votes: Record<string, Vote> = {};
  if (row.votes && typeof row.votes === 'object' && !Array.isArray(row.votes)) {
    for (const [id, v] of Object.entries(row.votes)) {
      if (typeof v === 'string' && VOTES.includes(v)) votes[id] = v as Vote;
    }
  }
  return {
    mealId: row.meal_id,
    eatenOn: row.eaten_on,
    status: row.status === 'answered' ? 'answered' : 'skipped',
    votes,
  };
}

/** The household's verdicts, newest dinner first. */
export async function listVerdicts(
  sb: Sb,
  householdId: string,
  opts: { since?: string; mealId?: string } = {},
): Promise<Verdict[]> {
  let q = sb.from('meal_verdicts').select('*').eq('household_id', householdId);
  if (opts.mealId) q = q.eq('meal_id', opts.mealId);
  if (opts.since) q = q.gte('eaten_on', opts.since);
  const { data, error } = await q.order('eaten_on', { ascending: false }).limit(LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toVerdict);
}

/**
 * Every dinner the household planned, as a date, newest first. One entry per (meal, date), even when two
 * week rows cover the same date. `since` keeps only dates on or after it.
 */
export async function listDinnerDates(
  sb: Sb,
  householdId: string,
  opts: { since?: string; slot?: string } = {},
): Promise<Dinner[]> {
  const slot = opts.slot ?? 'dinner';
  let wq = sb.from('weeks').select('id, week_start').eq('household_id', householdId);
  // A week covers seven days from its start, so an earlier start than since - 6 cannot hold a date on or after since.
  if (opts.since) wq = wq.gte('week_start', addDays(opts.since, -6));
  const { data: weeks, error: weeksError } = await wq.order('week_start', { ascending: false }).limit(LIMIT);
  if (weeksError) throw new Error(weeksError.message);
  if (!weeks || weeks.length === 0) return [];

  let mq = sb.from('week_meals').select('week_id, day, meal_id, slot').eq('household_id', householdId).eq('slot', slot);
  if (opts.since) mq = mq.in('week_id', weeks.map((w) => w.id));
  const { data: meals, error: mealsError } = await mq;
  if (mealsError) throw new Error(mealsError.message);

  const start = new Map(weeks.map((w) => [w.id, w.week_start]));
  const seen = new Set<string>();
  const out: Dinner[] = [];
  for (const m of meals ?? []) {
    const weekStart = start.get(m.week_id);
    if (!weekStart || m.slot !== slot || !isDay(m.day)) continue;
    const date = dinnerDate(weekStart, m.day as Day);
    if (opts.since && date < opts.since) continue;
    const key = `${m.meal_id}|${date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ mealId: m.meal_id, date });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Writes the answer for a dinner. The last write wins, so two phones answering never fail. */
export async function saveVerdict(sb: Sb, householdId: string, d: Dinner, votes: Record<string, Vote>): Promise<void> {
  const { error } = await sb.from('meal_verdicts').upsert(
    { household_id: householdId, meal_id: d.mealId, eaten_on: d.date, status: 'answered', votes },
    { onConflict: 'meal_id,eaten_on' },
  );
  if (error) throw new Error(error.message);
}

/** Records a skip. If somebody already answered (or skipped) this dinner, that is as good as done. */
export async function skipVerdict(sb: Sb, householdId: string, d: Dinner): Promise<void> {
  const { error } = await sb
    .from('meal_verdicts')
    .insert({ household_id: householdId, meal_id: d.mealId, eaten_on: d.date, status: 'skipped' });
  if (error && error.code !== UNIQUE_VIOLATION) throw new Error(error.message);
}
