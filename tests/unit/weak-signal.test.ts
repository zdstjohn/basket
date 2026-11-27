import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Candidate } from "@/lib/domain/packages";
import { setItemState, setItemStates, type ItemState } from "@/lib/db/queries/list";
import { flushQueue, loadQueue, saveQueue, type QueuedPatch } from "@/lib/list/offline";
import { overlayQueue } from "@/lib/list/state";
import { buildList, listView, rawForWeek, weekChanged, type ListInputs } from "@/lib/useWeekList";

function fakeStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

type Upsert = { rows: unknown; opts: unknown };
function fakeClient(opts: { fail?: (rows: unknown) => { message: string; code?: string } | null } = {}) {
  const upserts: Upsert[] = [];
  const sb = {
    from: (table: string) => {
      if (table !== "week_item_state") throw new Error(`unexpected table ${table}`);
      return {
        upsert: async (rows: unknown, o: unknown) => {
          upserts.push({ rows, opts: o });
          const error = opts.fail?.(rows) ?? null;
          return error ? { error, status: error.code ? 400 : 500 } : { error: null, status: 201 };
        },
      };
    },
  };
  return { sb: sb as never, upserts };
}

const flags = { have_it: false, checked: true, outside_budget: false };
const entry = (itemKey: string, patch: QueuedPatch["patch"] = flags, weekId = "w1"): QueuedPatch => ({ id: `id-${itemKey}`, weekId, itemKey, patch });

describe("setItemStates", () => {
  it("writes many rows with one upsert, each carrying the household and week", async () => {
    const { sb, upserts } = fakeClient();
    await setItemStates(sb, "h1", [entry("a"), entry("b")]);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].opts).toEqual({ onConflict: "week_id,item_key" });
    expect(upserts[0].rows).toEqual([
      { household_id: "h1", week_id: "w1", item_key: "a", ...flags },
      { household_id: "h1", week_id: "w1", item_key: "b", ...flags },
    ]);
  });
  it("throws what the server said, with its code and status, like setItemState", async () => {
    const { sb } = fakeClient({ fail: () => ({ message: "denied", code: "42501" }) });
    await expect(setItemStates(sb, "h1", [entry("a"), entry("b")])).rejects.toMatchObject({ code: "42501", status: 400 });
    await expect(setItemState(sb, "w1", "a", flags, "h1")).rejects.toMatchObject({ code: "42501" });
  });
});

describe("Check off all (40): requests on the tapping phone", () => {
  beforeEach(() => void vi.stubGlobal("localStorage", fakeStorage()));
  afterEach(() => void vi.unstubAllGlobals());

  it("makes one write request for 40 check-offs", async () => {
    const { sb, upserts } = fakeClient();
    saveQueue("h1", Array.from({ length: 40 }, (_, i) => entry(`k${i}`)));
    const left = await flushQueue(
      "h1",
      (x) => setItemState(sb, x.weekId, x.itemKey, x.patch, "h1"),
      undefined,
      undefined,
      (b) => setItemStates(sb, "h1", b),
    );
    expect(left).toBe(0);
    expect(upserts.length).toBeLessThanOrEqual(2);
    expect(upserts).toHaveLength(1);
  });

  it("when the batch is refused, retries one by one: one bad row drops only itself", async () => {
    const { sb, upserts } = fakeClient({
      fail: (rows) => {
        const list = Array.isArray(rows) ? rows : [rows];
        return list.some((r: { item_key: string }) => r.item_key === "k3") ? { message: "bad", code: "23514" } : null;
      },
    });
    saveQueue("h1", Array.from({ length: 5 }, (_, i) => entry(`k${i}`)));
    const dropped: string[] = [];
    const left = await flushQueue(
      "h1",
      (x) => setItemState(sb, x.weekId, x.itemKey, x.patch, "h1"),
      undefined,
      (x) => void dropped.push(x.itemKey),
      (b) => setItemStates(sb, "h1", b),
    );
    expect(left).toBe(0);
    expect(dropped).toEqual(["k3"]);
    expect(upserts).toHaveLength(1 + 5);
    expect(loadQueue("h1")).toEqual([]);
  });
});

describe("overlayQueue", () => {
  const server: Record<string, ItemState> = {
    milk: { have_it: false, checked: false, outside_budget: false, pack_count: 2 },
    eggs: { have_it: false, checked: true, outside_budget: false },
  };
  it("shows queued changes on top of what the server sent, keeping the package count it did not name", () => {
    const out = overlayQueue(server, [entry("milk"), entry("rice", { have_it: true, checked: false, outside_budget: false })], "w1");
    expect(out.milk).toEqual({ have_it: false, checked: true, outside_budget: false, pack_count: 2 });
    expect(out.rice).toMatchObject({ have_it: true });
    expect(out.eggs).toBe(server.eggs);
  });
  it("applies a queued package count, and ignores other weeks", () => {
    const out = overlayQueue(server, [entry("milk", { ...flags, pack_count: 5 }), entry("eggs", { checked: false }, "w2")], "w1");
    expect(out.milk.pack_count).toBe(5);
    expect(out.eggs.checked).toBe(true);
  });
  it("leaves the server's object alone", () => {
    overlayQueue(server, [entry("milk")], "w1");
    expect(server.milk.checked).toBe(false);
  });
});

describe("weekChanged", () => {
  const h = { week_start: "mon", time_zone: "America/Los_Angeles" } as never;
  it("is false in the same week, true after the week turns over, true with nothing seen", () => {
    expect(weekChanged("2026-11-23", new Date("2026-11-27T20:00:00Z"), h)).toBe(false);
    expect(weekChanged("2026-11-23", new Date("2026-11-30T09:00:00Z"), h)).toBe(true);
    expect(weekChanged(null, new Date("2026-11-27T20:00:00Z"), h)).toBe(true);
  });
  it("goes by the household's own clock", () => {
    // 2026-11-30 03:00 UTC is still Sunday evening in Los Angeles.
    expect(weekChanged("2026-11-23", new Date("2026-11-30T03:00:00Z"), h)).toBe(false);
  });
});

describe("listView", () => {
  it("picks an error card, not an endless skeleton, when the week id failed with nothing cached", () => {
    expect(listView({ weekFailed: true, error: false, loading: true, itemCount: 0 })).toBe("error");
  });
  it("picks error, skeleton, empty or list", () => {
    expect(listView({ weekFailed: false, error: true, loading: false, itemCount: 0 })).toBe("error");
    expect(listView({ weekFailed: false, error: true, loading: false, itemCount: 3 })).toBe("list");
    expect(listView({ weekFailed: false, error: false, loading: true, itemCount: 0 })).toBe("skeleton");
    expect(listView({ weekFailed: false, error: false, loading: false, itemCount: 0 })).toBe("empty");
    expect(listView({ weekFailed: false, error: false, loading: false, itemCount: 2 })).toBe("list");
  });
});

describe("buildList with a malformed search row", () => {
  it("treats that food as having no row instead of throwing", () => {
    const bad = [null, { upc: "1" }] as unknown as Candidate[];
    const raw: ListInputs = {
      entries: [], people: [], alwaysHave: [], itemState: {}, itemStores: [], categoryStore: {}, prices: [],
      staples: [{ canonical: "olive oil", amount: 1.9, unit: "tbsp", role: "pantry" }],
      matches: [{ canonical: "olive oil", locationId: "L1", term: "olive oil", candidates: bad, fetchedAt: new Date().toISOString() }],
      choices: [], locationId: "L1",
    };
    expect(() => buildList(raw)).not.toThrow();
    expect(buildList(raw).items).toHaveLength(1);
  });
});

describe("rawForWeek: last week's list is never used under this week's id", () => {
  const raw = (weekId: string): ListInputs => ({
    entries: [], people: [], alwaysHave: [], itemState: {}, itemStores: [], categoryStore: {}, prices: [],
    staples: [{ canonical: "olive oil", amount: 1, unit: "tbsp", role: "pantry" }], weekId,
  });
  it("shows a list only for the week it was fetched for", () => {
    const old = raw("w-old");
    expect(rawForWeek(old, "w-old")).toBe(old);
    expect(rawForWeek(old, "w-new")).toBeNull(); // slow or failed new load: nothing shown, cached or tapped
    expect(rawForWeek(old, null)).toBeNull();
    expect(rawForWeek(null, "w-new")).toBeNull();
  });
});
