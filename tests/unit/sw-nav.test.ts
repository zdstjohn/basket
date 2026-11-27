import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const { offlineStart, raceSaved, saveOnce } = createRequire(import.meta.url)("../../public/sw-nav.js") as {
  saveOnce: (
    cache: { match: (p: string) => Promise<unknown>; put: (p: string, r: unknown) => Promise<void> },
    path: string,
    fetchPath: (p: string) => Promise<{ ok: boolean; redirected: boolean }>,
  ) => Promise<void>;
  raceSaved: (
    network: Promise<unknown>,
    saved: () => Promise<unknown>,
    ms: number,
    sleep: (ms: number) => Promise<void>,
  ) => Promise<unknown>;
  offlineStart: (
    match: (p: string) => Promise<unknown>,
    page: string,
    redirect: (to: string, status: number) => unknown,
  ) => Promise<unknown>;
};

const redirect = (to: string, status: number) => ({ to, status });

describe("offlineStart", () => {
  it("redirects to the saved list", async () => {
    expect(await offlineStart(async () => ({}), "/list", redirect)).toEqual({ to: "/list", status: 302 });
  });
  it("does nothing when the list is not saved", async () => {
    expect(await offlineStart(async () => undefined, "/list", redirect)).toBeNull();
  });
});

describe("raceSaved", () => {
  const never = new Promise<never>(() => {});
  const instant = () => Promise.resolve();
  it("serves the network when it answers before the timer", async () => {
    expect(await raceSaved(Promise.resolve("net"), async () => "saved", 4000, () => never)).toBe("net");
  });
  it("serves the saved page when the timer fires first", async () => {
    expect(await raceSaved(never, async () => "saved", 4000, instant)).toBe("saved");
  });
  it("keeps waiting for the network when the timer fires and nothing is saved", async () => {
    let answer!: (v: string) => void;
    const net = new Promise<string>((r) => (answer = r));
    const out = raceSaved(net, async () => undefined, 4000, instant);
    answer("late");
    expect(await out).toBe("late");
  });
  it("falls back to the saved page when the network fails", async () => {
    expect(await raceSaved(Promise.reject(new Error("offline")), async () => "saved", 4000, () => never)).toBe("saved");
  });
  it("passes the failure on when the network fails and nothing is saved", async () => {
    await expect(raceSaved(Promise.reject(new Error("offline")), async () => undefined, 4000, () => never)).rejects.toThrow("offline");
  });
  it("hands the timer the wait in milliseconds", async () => {
    const waits: number[] = [];
    await raceSaved(Promise.resolve("net"), async () => "saved", 4000, (ms) => (waits.push(ms), never));
    expect(waits).toEqual([4000]);
  });
});

describe("saveOnce", () => {
  const setup = (have: string[]) => {
    const put: string[] = [];
    const fetched: string[] = [];
    const cache = { match: async (p: string) => (have.includes(p) ? {} : undefined), put: async (p: string) => void put.push(p) };
    const fetchPath = (ok = true, redirected = false) => async (p: string) => (fetched.push(p), { ok, redirected });
    return { cache, put, fetched, fetchPath };
  };
  it("skips a path already saved, with no request", async () => {
    const t = setup(["/list", "/_next/static/a.js"]);
    await saveOnce(t.cache, "/list", t.fetchPath());
    await saveOnce(t.cache, "/_next/static/a.js", t.fetchPath());
    expect(t.fetched).toEqual([]);
    expect(t.put).toEqual([]);
  });
  it("fetches and saves a path that is missing", async () => {
    const t = setup([]);
    await saveOnce(t.cache, "/_next/static/b.js", t.fetchPath());
    expect(t.fetched).toEqual(["/_next/static/b.js"]);
    expect(t.put).toEqual(["/_next/static/b.js"]);
  });
  it("never saves a redirect or an error", async () => {
    const t = setup([]);
    await saveOnce(t.cache, "/list", t.fetchPath(true, true));
    await saveOnce(t.cache, "/x", t.fetchPath(false));
    expect(t.put).toEqual([]);
  });
});
