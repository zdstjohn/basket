import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDraft, loadDraft, saveDraft } from "@/lib/drafts";

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

const DAY = 24 * 60 * 60 * 1000;

describe("drafts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));
    vi.stubGlobal("localStorage", fakeStorage());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("round-trips a value", () => {
    saveDraft("add-meal:2026-11-22:thu:dinner", { query: "tacos", n: 2 });
    expect(loadDraft("add-meal:2026-11-22:thu:dinner")).toEqual({ query: "tacos", n: 2 });
  });

  it("returns null for a key that was never saved", () => {
    expect(loadDraft("nope")).toBeNull();
  });

  it("still returns a draft just under 7 days old", () => {
    saveDraft("k", { a: 1 });
    vi.setSystemTime(Date.now() + 7 * DAY - 1000);
    expect(loadDraft("k")).toEqual({ a: 1 });
  });

  it("returns null after 7 days, and forgets it", () => {
    saveDraft("k", { a: 1 });
    vi.setSystemTime(Date.now() + 7 * DAY + 1000);
    expect(loadDraft("k")).toBeNull();
    expect((localStorage as unknown as ReturnType<typeof fakeStorage>).data.has("k")).toBe(false);
  });

  it("returns null for garbage in storage", () => {
    localStorage.setItem("k", "{not json");
    expect(loadDraft("k")).toBeNull();
  });

  it("survives localStorage.setItem throwing (quota, private mode)", () => {
    vi.stubGlobal("localStorage", {
      ...fakeStorage(),
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    });
    expect(() => saveDraft("k", { a: 1 })).not.toThrow();
    expect(loadDraft("k")).toBeNull();
  });

  it("survives localStorage being unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => saveDraft("k", 1)).not.toThrow();
    expect(loadDraft("k")).toBeNull();
    expect(() => clearDraft("k")).not.toThrow();
  });

  it("clearDraft removes it", () => {
    saveDraft("k", { a: 1 });
    clearDraft("k");
    expect(loadDraft("k")).toBeNull();
  });
});
