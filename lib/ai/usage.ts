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

/** What ai_gate (migration 0008) answers. Only 'ok' lets the paid call go ahead. */
export type GateResult = 'ok' | 'cap' | 'slow' | 'busy' | 'not_member';
const GATE_RESULTS: readonly string[] = ['ok', 'cap', 'slow', 'busy', 'not_member'];

/**
 * What each paid route reserves up front, in cents (about a call's worst case; the real cost is
 * recorded afterwards and the hold ages out after 90 seconds). A draft is up to two model calls plus a
 * photo search; identify is a vision call plus up to two searches; a search is up to two Brave calls.
 */
const HOLD_CENTS = { draft: 2, search: 1, identify: 3, estimate: 1 } as const;

export function holdCents(kind: keyof typeof HOLD_CENTS): number {
  // With the model faked nothing costs money, so nothing is reserved (the rate limits still apply).
  return process.env.AI_FAKE === '1' ? 0 : HOLD_CENTS[kind];
}

/**
 * The one check before any paid call: not a member, over the monthly cap, too fast, or the shared pool
 * for households nobody vouched for is used up. 'ok' has also reserved `hold` cents in one step, so a
 * burst of parallel calls cannot all pass. An answer this does not recognise is an error, not a pass.
 */
export async function aiGate(sb: Sb, householdId: string, hold: number): Promise<GateResult> {
  const { data, error } = await sb.rpc('ai_gate', { h: householdId, hold_cents: hold });
  if (error) throw new Error(error.message);
  if (typeof data !== 'string' || !GATE_RESULTS.includes(data)) throw new Error('ai_gate answered something unexpected');
  return data as GateResult;
}

export async function recordUsage(
  sb: Sb,
  householdId: string,
  kind: 'parse' | 'estimate' | 'search' | 'identify',
  model: string,
  usage: { inputTokens: number; outputTokens: number; assumed?: boolean },
): Promise<void> {
  let cost: number;
  if (kind === 'search') {
    // Brave bills per request; Spoonacular's cost is nominal (its free plan has a shared daily quota,
    // so each request still counts toward the spend guard).
    const env = model === 'spoonacular' ? process.env.SPOONACULAR_COST_CENTS : process.env.SEARCH_COST_CENTS;
    const configured = Number(env);
    cost = env && Number.isFinite(configured) ? configured : 0.5;
  } else if (model === 'fake') {
    cost = 0;
  } else {
    // `assumed`: the model reported no token counts, so the usage is the output limit at the high rate.
    const p = (usage.assumed ? undefined : prices()[model]) ?? UNKNOWN_MODEL_PRICE;
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
