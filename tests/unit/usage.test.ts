import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiGate, holdCents, recordUsage } from '@/lib/ai/usage';

function mockSb(rpcResult: { data: unknown; error: { message: string } | null } = { data: 'ok', error: null }) {
  const inserts: unknown[] = [];
  const rpcCalls: { fn: string; args: unknown }[] = [];
  const sb = {
    rpc: async (fn: string, args: unknown) => (rpcCalls.push({ fn, args }), rpcResult),
    from(table: string) {
      return { insert: async (row: unknown) => (inserts.push({ table, row }), { error: null }) };
    },
  };
  return { sb: sb as never, inserts, rpcCalls };
}

describe('aiGate', () => {
  it('asks the database to check and hold, with the household and the hold', async () => {
    const m = mockSb();
    expect(await aiGate(m.sb, 'h1', 2)).toBe('ok');
    expect(m.rpcCalls).toEqual([{ fn: 'ai_gate', args: { h: 'h1', hold_cents: 2 } }]);
  });

  it.each(['ok', 'cap', 'slow', 'busy', 'not_member'] as const)('passes %s through', async (r) => {
    expect(await aiGate(mockSb({ data: r, error: null }).sb, 'h', 1)).toBe(r);
  });

  it('throws when the database errors, and on an answer it does not know (never lets a call through)', async () => {
    await expect(aiGate(mockSb({ data: null, error: { message: 'boom' } }).sb, 'h', 1)).rejects.toThrow('boom');
    await expect(aiGate(mockSb({ data: 'sure', error: null }).sb, 'h', 1)).rejects.toThrow();
    await expect(aiGate(mockSb({ data: null, error: null }).sb, 'h', 1)).rejects.toThrow();
  });
});

describe('holdCents', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reserves a positive amount for each paid route', () => {
    vi.stubEnv('AI_FAKE', '');
    for (const k of ['draft', 'search', 'identify', 'estimate'] as const) expect(holdCents(k)).toBeGreaterThan(0);
  });

  it('reserves nothing when the model is faked, since nothing costs money then', () => {
    vi.stubEnv('AI_FAKE', '1');
    expect(holdCents('identify')).toBe(0);
  });
});

describe('recordUsage', () => {
  beforeEach(() => {
    delete process.env.AI_PRICES_JSON;
    delete process.env.SEARCH_COST_CENTS;
  });

  it('prices tokens from AI_PRICES_JSON', async () => {
    process.env.AI_PRICES_JSON = JSON.stringify({ m1: { in: 100, out: 500 } });
    const m = mockSb();
    await recordUsage(m.sb, 'h', 'parse', 'm1', { inputTokens: 10_000, outputTokens: 2_000 });
    expect(m.inserts[0]).toMatchObject({
      table: 'ai_usage',
      row: { household_id: 'h', kind: 'parse', model: 'm1', input_tokens: 10_000, output_tokens: 2_000, cost_cents: 2 },
    });
  });

  it('uses the default haiku price when AI_PRICES_JSON is unset', async () => {
    const m = mockSb();
    await recordUsage(m.sb, 'h', 'estimate', 'anthropic/claude-haiku-5.5', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect((m.inserts[0] as { row: { cost_cents: number } }).row.cost_cents).toBe(60);
  });

  it('charges a search SEARCH_COST_CENTS, default 0.5', async () => {
    const m = mockSb();
    await recordUsage(m.sb, 'h', 'search', 'brave', { inputTokens: 0, outputTokens: 0 });
    expect((m.inserts[0] as { row: { cost_cents: number } }).row.cost_cents).toBe(0.5);
    process.env.SEARCH_COST_CENTS = '0.8';
    const m2 = mockSb();
    await recordUsage(m2.sb, 'h', 'search', 'brave', { inputTokens: 0, outputTokens: 0 });
    expect((m2.inserts[0] as { row: { cost_cents: number } }).row.cost_cents).toBe(0.8);
  });

  it('charges an answer with no token counts at the unknown-model rate times the output limit', async () => {
    const m = mockSb();
    await recordUsage(m.sb, 'h', 'estimate', 'anthropic/claude-haiku-5.5', { inputTokens: 0, outputTokens: 4000, assumed: true });
    // 4000 output tokens at 1500 per million = 6 cents, not the 0.2 the Haiku price would give.
    expect((m.inserts[0] as { row: { cost_cents: number } }).row.cost_cents).toBe(6);
  });

  it('charges a Spoonacular request SPOONACULAR_COST_CENTS, default 1', async () => {
    const m = mockSb();
    await recordUsage(m.sb, 'h', 'search', 'spoonacular', { inputTokens: 0, outputTokens: 0 });
    expect((m.inserts[0] as { row: { cost_cents: number } }).row.cost_cents).toBe(1);
    process.env.SPOONACULAR_COST_CENTS = '0.2';
    const m2 = mockSb();
    await recordUsage(m2.sb, 'h', 'search', 'spoonacular', { inputTokens: 0, outputTokens: 0 });
    expect((m2.inserts[0] as { row: { cost_cents: number } }).row.cost_cents).toBe(0.2);
    delete process.env.SPOONACULAR_COST_CENTS;
  });
});
