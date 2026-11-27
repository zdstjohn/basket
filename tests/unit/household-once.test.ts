import { beforeEach, describe, expect, it, vi } from "vitest";

// React's cache() only remembers inside a request render, so stand in a cache that remembers until `endRender`.
const memo = vi.hoisted(() => new Map<unknown, unknown>());
vi.mock("react", () => ({
  cache: <A extends unknown[], R>(fn: (...a: A) => R) => {
    return (...a: A): R => {
      if (!memo.has(fn)) memo.set(fn, fn(...a));
      return memo.get(fn) as R;
    };
  },
}));
const query = vi.hoisted(() => vi.fn(async () => ({ id: "h1" })));
vi.mock("@/lib/db/queries/household", () => ({ getMyHousehold: query }));
vi.mock("@/lib/db/server", () => ({ createServerClient: async () => ({}) }));

import { getMyHouseholdOnce } from "@/lib/db/queries/household-server";

describe("getMyHouseholdOnce", () => {
  beforeEach(() => {
    memo.clear();
    query.mockClear();
  });
  it("two calls in one render make one query", async () => {
    const [a, b] = [await getMyHouseholdOnce(), await getMyHouseholdOnce()];
    expect(a).toBe(b);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("a new render asks again", async () => {
    await getMyHouseholdOnce();
    memo.clear();
    await getMyHouseholdOnce();
    expect(query).toHaveBeenCalledTimes(2);
  });
});
