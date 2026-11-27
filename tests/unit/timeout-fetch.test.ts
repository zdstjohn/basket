import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timeoutFetch } from "@/lib/db/timeout-fetch";

const rest = (u: string) => u.includes("/rest/v1/");
const REST = "https://x.supabase.co/rest/v1/week_item_state";
const STORAGE = "https://x.supabase.co/storage/v1/object/a";

/** An inner fetch that never answers, but honours its signal like the real one. */
function hang() {
  const seen: { signal?: AbortSignal | null }[] = [];
  const inner = vi.fn((_u: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ signal: init?.signal });
    return new Promise<Response>((_res, rej) => {
      if (init?.signal?.aborted) rej(new DOMException("aborted", "AbortError"));
      init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
    });
  });
  return { inner: inner as unknown as typeof fetch, seen };
}

describe("timeoutFetch", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("rejects a never-answering request at 12 s as a fetch failure", async () => {
    const { inner } = hang();
    const p = timeoutFetch(inner, 12_000, rest)(REST);
    const result = p.then(() => null, (e: unknown) => e);
    await vi.advanceTimersByTimeAsync(11_999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    const err = (await result) as Error;
    expect(err).toBeInstanceOf(TypeError);
    expect(err.message).toMatch(/failed to fetch/i);
    expect(err.message).toBe("Failed to fetch (timeout)");
  });

  it("never aborts a URL it does not apply to", async () => {
    const { inner, seen } = hang();
    const p = timeoutFetch(inner, 12_000, rest)(STORAGE).catch(() => "rejected");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(seen[0].signal).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    void p;
  });

  it("clears the timer when the answer is fast", async () => {
    const inner = vi.fn(async () => new Response("ok")) as unknown as typeof fetch;
    const res = await timeoutFetch(inner, 12_000, rest)(REST);
    expect(await res.text()).toBe("ok");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timer when the request fails", async () => {
    const inner = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    await expect(timeoutFetch(inner, 12_000, rest)(REST)).rejects.toThrow("Failed to fetch");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still aborts when the caller aborts", async () => {
    const { inner } = hang();
    const ctl = new AbortController();
    const p = timeoutFetch(inner, 12_000, rest)(REST, { signal: ctl.signal });
    const result = p.then(() => null, (e: unknown) => e);
    ctl.abort();
    const err = (await result) as Error;
    expect(err.name).toBe("AbortError");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts at once when the caller's signal is already aborted", async () => {
    const { inner } = hang();
    const ctl = new AbortController();
    ctl.abort();
    await expect(timeoutFetch(inner, 12_000, rest)(REST, { signal: ctl.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("accepts a URL object and a Request", async () => {
    const { inner } = hang();
    const f = timeoutFetch(inner, 1_000, rest);
    const a = f(new URL(REST)).catch((e: unknown) => e);
    const b = f(new Request(REST)).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(((await a) as Error).message).toMatch(/timeout/);
    expect(((await b) as Error).message).toMatch(/timeout/);
  });
});
