import { afterEach, describe, expect, it, vi } from "vitest";
import { requestEstimates } from "@/lib/list/estimates-client";

const mass = { canonical: "chicken", qty: { kind: "mass", amount: 500 } } as never;
const count = { canonical: "chicken", qty: { kind: "count", amount: 2 } } as never;
const milk = { canonical: "milk", qty: { kind: "volume", amount: 1000 } } as never;

function mockFetch(prices: number[]) {
  let i = 0;
  const f = vi.fn(async (_u: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { items: { canonical: string }[] };
    const cents = prices[i++];
    return new Response(JSON.stringify({ prices: Object.fromEntries(body.items.map((x) => [x.canonical, cents])) }));
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const bodies = (f: ReturnType<typeof mockFetch>) => f.mock.calls.map((c) => JSON.parse(String(c[1]?.body)));

describe("requestEstimates", () => {
  afterEach(() => void vi.unstubAllGlobals());

  it("asks once per kind when one food appears as mass and as count", async () => {
    const f = mockFetch([7, 90]);
    const rows = await requestEstimates([mass, count], "costco");
    expect(f).toHaveBeenCalledTimes(2);
    const b = bodies(f);
    expect(b[0].items).toEqual([mass]);
    expect(b[1].items).toEqual([count]);
    expect(rows.map((r) => [r.canonical, r.kind, r.centsPerBase])).toEqual([
      ["chicken", "mass", 7],
      ["chicken", "count", 90],
    ]);
  });

  it("sends different foods of different kinds in one request", async () => {
    const f = mockFetch([3]);
    await requestEstimates([mass, milk], "costco");
    expect(f).toHaveBeenCalledTimes(1);
    expect(bodies(f)[0]).toEqual({ items: [mass, milk], store: "costco" });
  });

  it("sends clash-free items in one request with the same body as today", async () => {
    const f = mockFetch([5]);
    await requestEstimates([mass], "fred_meyer");
    expect(f).toHaveBeenCalledTimes(1);
    expect(bodies(f)[0]).toEqual({ items: [mass], store: "fred_meyer" });
  });
});
