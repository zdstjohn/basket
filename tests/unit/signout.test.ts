import { describe, expect, it, vi } from "vitest";
import { clearDeviceData, SW_CACHE } from "@/lib/signout";

function storage(keys: string[]) {
  const data = new Map(keys.map((k) => [k, "1"]));
  return {
    data,
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("clearDeviceData", () => {
  it("removes the list, week pointer, queues and half-finished meals; keeps the rest", async () => {
    const s = storage(["list:w1", "list-week", "list-queue:h1", "list-queue:h2", "add-meal:2026-11-22:thu:dinner", "theme", "other-list"]);
    await clearDeviceData({ storage: s, cacheStorage: null, worker: null });
    expect([...s.data.keys()]).toEqual(["theme", "other-list"]);
  });

  it("deletes the saved page and tells the service worker to clear", async () => {
    const del = vi.fn(async () => true);
    const post = vi.fn();
    await clearDeviceData({ storage: storage([]), cacheStorage: { delete: del }, worker: { postMessage: post } });
    expect(del).toHaveBeenCalledWith(SW_CACHE);
    expect(post).toHaveBeenCalledWith({ type: "clear" });
  });

  it("never throws when the browser objects fail", async () => {
    const boom = () => { throw new Error("no"); };
    await expect(
      clearDeviceData({
        storage: { length: 1, key: boom, removeItem: boom },
        cacheStorage: { delete: async () => boom() },
        worker: { postMessage: boom },
      }),
    ).resolves.toBeUndefined();
  });

  it("copes with no browser features at all", async () => {
    await expect(clearDeviceData({ storage: null, cacheStorage: null, worker: null })).resolves.toBeUndefined();
  });
});
