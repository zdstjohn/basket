import { beforeEach, describe, expect, it } from 'vitest';
import { checkCap, monthStartUtc, recordUsage } from '@/lib/ai/usage';

function mockSb(rows: { cost_cents: number }[], household = { ai_cap_cents: 300, time_zone: 'America/Los_Angeles' }) {
  const inserts: unknown[] = [];
  const filters: Record<string, unknown[]> = {};
  const sb = {
    from(table: string) {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = (c: string, v: unknown) => ((filters[`${table}.${c}`] = [v]), b);
      b.gte = (c: string, v: unknown) => ((filters[`${table}.${c}`] = [v]), b);
      b.single = async () => ({ data: household, error: null });
      b.maybeSingle = b.single;
      b.insert = async (row: unknown) => (inserts.push({ table, row }), { error: null });
      b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res);
      return b;
    },
  };
  return { sb: sb as never, inserts, filters };
}

describe('checkCap', () => {
  it('is ok at 299 of 300 and not at 300', async () => {
    const a = await checkCap(mockSb([{ cost_cents: 200 }, { cost_cents: 99 }]).sb, 'h');
    expect(a).toEqual({ ok: true, spentCents: 299, capCents: 300 });
    const b = await checkCap(mockSb([{ cost_cents: 150 }, { cost_cents: 150 }]).sb, 'h');
    expect(b.ok).toBe(false);
    expect(b.spentCents).toBe(300);
  });

  it('only counts rows since the start of the month in the household time zone', async () => {
    const m = mockSb([]);
    await checkCap(m.sb, 'h');
    expect(m.filters['ai_usage.household_id']).toEqual(['h']);
    expect(typeof m.filters['ai_usage.created_at'][0]).toBe('string');
  });
});

describe('monthStartUtc', () => {
  it('is local midnight on the 1st, expressed in UTC', () => {
    expect(monthStartUtc('America/Los_Angeles', new Date('2026-11-26T12:00:00Z')).toISOString()).toBe('2026-11-01T07:00:00.000Z');
    expect(monthStartUtc('America/Los_Angeles', new Date('2026-07-15T12:00:00Z')).toISOString()).toBe('2026-07-01T07:00:00.000Z');
    expect(monthStartUtc('UTC', new Date('2026-11-30T23:59:00Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    // 2026-12-01 03:00Z is still 30 Nov in Los Angeles.
    expect(monthStartUtc('America/Los_Angeles', new Date('2026-12-01T03:00:00Z')).toISOString()).toBe('2026-11-01T07:00:00.000Z');
  });
});

describe('recordUsage', () => {
  beforeEach(() => {
    delete process.env.AI_PRICES_JSON;
    delete process.env.SEARCH_COST_CENTS;
  });

  it('prices tokens from AI_PRICES_JSON', async () => {
    process.env.AI_PRICES_JSON = JSON.stringify({ m1: { in: 100, out: 500 } });
    const m = mockSb([]);
    await recordUsage(m.sb, 'h', 'parse', 'm1', { inputTokens: 10_000, outputTokens: 2_000 });
    expect(m.inserts[0]).toMatchObject({
      table: 'ai_usage',
      row: { household_id: 'h', kind: 'parse', model: 'm1', input_tokens: 10_000, output_tokens: 2_000, cost_cents: 2 },
    });
  });

  it('uses the default haiku price when AI_PRICES_JSON is unset', async () => {
    const m = mockSb([]);
    await recordUsage(m.sb, 'h', 'estimate', 'anthropic/claude-haiku-5.5', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect((m.inserts[0] as { row: { cost_cents: number } }).row.cost_cents).toBe(60);
  });

  it('charges a search SEARCH_COST_CENTS, default 0.5', async () => {
    const m = mockSb([]);
    await recordUsage(m.sb, 'h', 'search', 'brave', { inputTokens: 0, outputTokens: 0 });
    expect((m.inserts[0] as { row: { cost_cents: number } }).row.cost_cents).toBe(0.5);
    process.env.SEARCH_COST_CENTS = '0.8';
    const m2 = mockSb([]);
    await recordUsage(m2.sb, 'h', 'search', 'brave', { inputTokens: 0, outputTokens: 0 });
    expect((m2.inserts[0] as { row: { cost_cents: number } }).row.cost_cents).toBe(0.8);
  });
});
