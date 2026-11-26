import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';

type Sb = SupabaseClient<Database>;
type Prices = Record<string, { in: number; out: number }>;

const DEFAULT_PRICES: Prices = { 'anthropic/claude-haiku-5.5': { in: 10, out: 50 } };
// A model nobody priced is charged at a deliberately high rate so the cap still bites.
const UNKNOWN_MODEL_PRICE = { in: 300, out: 1500 };

function prices(): Prices {
  const raw = process.env.AI_PRICES_JSON;
  if (!raw) return DEFAULT_PRICES;
  try {
    return JSON.parse(raw) as Prices;
  } catch {
    return DEFAULT_PRICES;
  }
}

/** The instant the current calendar month began in `timeZone`, as a UTC Date. */
export function monthStartUtc(timeZone: string, now: Date = new Date()): Date {
  const parts = (d: Date) => {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(d);
    const get = (t: string) => Number(f.find((p) => p.type === t)?.value);
    return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
  };
  // Offset of the zone from UTC at instant `d`, in ms.
  const offset = (d: Date) => {
    const p = parts(d);
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(d.getTime() / 1000) * 1000;
  };
  const { y, mo } = parts(now);
  const naive = Date.UTC(y, mo - 1, 1);
  // Two passes so a daylight-saving change between the guess and the answer cannot skew it.
  const first = naive - offset(new Date(naive));
  return new Date(naive - offset(new Date(first)));
}

export async function checkCap(
  sb: Sb,
  householdId: string,
): Promise<{ ok: boolean; spentCents: number; capCents: number }> {
  const { data: household, error: hErr } = await sb
    .from('households')
    .select('ai_cap_cents, time_zone')
    .eq('id', householdId)
    .single();
  if (hErr) throw new Error(hErr.message);
  const since = monthStartUtc(household.time_zone).toISOString();
  const { data, error } = await sb
    .from('ai_usage')
    .select('cost_cents')
    .eq('household_id', householdId)
    .gte('created_at', since);
  if (error) throw new Error(error.message);
  const spentCents = (data ?? []).reduce((sum, r) => sum + Number(r.cost_cents), 0);
  const capCents = household.ai_cap_cents;
  return { ok: spentCents < capCents, spentCents, capCents };
}

export async function recordUsage(
  sb: Sb,
  householdId: string,
  kind: 'parse' | 'estimate' | 'search',
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): Promise<void> {
  let cost: number;
  if (kind === 'search') {
    const configured = Number(process.env.SEARCH_COST_CENTS);
    cost = process.env.SEARCH_COST_CENTS && Number.isFinite(configured) ? configured : 0.5;
  } else if (model === 'fake') {
    cost = 0;
  } else {
    const p = prices()[model] ?? UNKNOWN_MODEL_PRICE;
    cost = (usage.inputTokens * p.in + usage.outputTokens * p.out) / 1_000_000;
  }
  const { error } = await sb.from('ai_usage').insert({
    household_id: householdId,
    kind,
    model,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cost_cents: cost,
  });
  if (error) throw new Error(error.message);
}
