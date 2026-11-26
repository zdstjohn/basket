import { describe, expect, it, vi } from "vitest";
import { clearAuthStorage, clearDeviceData, signOutAndLeave, SW_CACHE } from "@/lib/signout";

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

function jar(initial: string[]) {
  const cookies = new Map(initial.map((c) => [c.split("=")[0], c]));
  return {
    names: () => [...cookies.keys()],
    get cookie() { return [...cookies.values()].join("; "); },
    set cookie(v: string) {
      const [pair, ...attrs] = v.split(";").map((x) => x.trim());
      const name = pair.split("=")[0];
      if (attrs.includes("Max-Age=0")) cookies.delete(name);
      else cookies.set(name, pair);
    },
  };
}

describe("signing out when the call fails", () => {
  it("asks for a local sign-out only", async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    await signOutAndLeave({ auth: { signOut } }, { navigate: () => {}, doc: jar([]), storage: storage([]) });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("clears the session cookies and storage and lands on /login when signOut returns an error", async () => {
    const doc = jar(["sb-127-auth-token.0=abc", "sb-127-auth-token.1=def", "theme=dark"]);
    const s = storage(["sb-127-auth-token", "list:w1", "keep"]);
    const navigate = vi.fn();
    await signOutAndLeave(
      { auth: { signOut: async () => ({ error: new Error("TypeError: Failed to fetch") }) } },
      { navigate, doc, storage: s },
    );
    expect(doc.names()).toEqual(["theme"]);
    expect([...s.data.keys()]).toEqual(["list:w1", "keep"]) // only the auth key goes here; list data is cleared by clearDeviceData;
    expect(navigate).toHaveBeenCalledWith("/login");
  });

  it("does the same when signOut throws", async () => {
    const doc = jar(["sb-x-auth-token=abc"]);
    const navigate = vi.fn();
    await signOutAndLeave({ auth: { signOut: async () => { throw new Error("boom"); } } }, { navigate, doc, storage: storage([]) });
    expect(doc.names()).toEqual([]);
    expect(navigate).toHaveBeenCalledWith("/login");
  });
});

describe("clearAuthStorage", () => {
  it("never throws", () => {
    const bad = { get cookie(): string { throw new Error("no"); }, set cookie(_v: string) {} };
    expect(() => clearAuthStorage({ doc: bad, storage: null })).not.toThrow();
  });
});
