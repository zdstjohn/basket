import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Household, MealRow, VerdictRow } from "@/lib/db/rows";
import {
  listDinnerDates,
  listVerdicts,
  saveVerdict,
  skipVerdict,
  toVerdict,
} from "@/lib/db/queries/verdicts";
import { loadAsk } from "@/components/verdicts/useDinnerToAsk";

const getMeals = vi.fn();
const mealPhotoSrcs = vi.fn();
vi.mock("@/lib/db/queries/meals", () => ({
  getMeals: (...a: unknown[]) => getMeals(...a),
  mealPhotoSrcs: (...a: unknown[]) => mealPhotoSrcs(...a),
}));

type Result = { data: unknown; error: unknown };
const upsert = vi.fn();
const insert = vi.fn();
const order = vi.fn();
const gte = vi.fn();
const limit = vi.fn();
const eq = vi.fn();
const inFn = vi.fn();

// A chainable stand-in for the Supabase query builder: filters record their call and return the builder;
// awaiting it resolves to the table's canned result.
function stub(tables: Record<string, Result | (() => Promise<Result>)>) {
  const from = (table: string) => {
    const result = tables[table] ?? { data: [], error: null };
    const builder: Record<string, unknown> = {
      select: () => builder,
      order: (...a: unknown[]) => (order(...a), builder),
      gte: (...a: unknown[]) => (gte(...a), builder),
      limit: (...a: unknown[]) => (limit(...a), builder),
      eq: (...a: unknown[]) => (eq(...a), builder),
      in: (...a: unknown[]) => (inFn(...a), builder),
      upsert: (...a: unknown[]) => upsert(...a),
      insert: (...a: unknown[]) => insert(...a),
      then: (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) =>
        (typeof result === "function" ? result() : Promise.resolve(result)).then(resolve, reject),
    };
    return builder;
  };
  return { from } as unknown as SupabaseClient<Database>;
}

const row: VerdictRow = {
  id: "v",
  created_at: "2026-11-26T00:00:00Z",
  household_id: "h",
  meal_id: "m",
  eaten_on: "2026-11-25",
  status: "answered",
  votes: { a: "up" },
  updated_at: "2026-11-26T00:00:00Z",
  updated_by: null,
};

const D = { mealId: "m", date: "2026-11-25" };

beforeEach(() => {
  for (const f of [upsert, insert, order, gte, limit, eq, inFn, getMeals, mealPhotoSrcs]) f.mockReset();
  upsert.mockResolvedValue({ error: null });
  insert.mockResolvedValue({ error: null });
});

describe("saving and skipping", () => {
  it("saves an answer as one row per dinner", async () => {
    await saveVerdict(stub({}), "h", D, { a: "up" });
    expect(upsert).toHaveBeenCalledWith(
      { household_id: "h", meal_id: "m", eaten_on: "2026-11-25", status: "answered", votes: { a: "up" } },
      { onConflict: "meal_id,eaten_on" },
    );
  });
  it("throws when the save fails", async () => {
    upsert.mockResolvedValueOnce({ error: { code: "42501", message: "denied" } });
    await expect(saveVerdict(stub({}), "h", D, { a: "up" })).rejects.toThrow();
  });
  it('treats "someone already answered" as a successful skip', async () => {
    insert.mockResolvedValueOnce({ error: { code: "23505", message: "duplicate" } });
    await expect(skipVerdict(stub({}), "h", D)).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalledWith({ household_id: "h", meal_id: "m", eaten_on: "2026-11-25", status: "skipped" });
  });
  it("throws on any other failure", async () => {
    insert.mockResolvedValueOnce({ error: { code: "42501", message: "denied" } });
    await expect(skipVerdict(stub({}), "h", D)).rejects.toThrow();
  });
});

describe("reading verdicts", () => {
  it("reads rows into verdicts and ignores junk votes", () => {
    expect(toVerdict({ ...row, votes: { a: "up", b: "maybe", c: 5 } }).votes).toEqual({ a: "up" });
    expect(toVerdict({ ...row, votes: [1] }).votes).toEqual({});
    expect(toVerdict(row)).toEqual({ mealId: "m", eatenOn: "2026-11-25", status: "answered", votes: { a: "up" } });
  });
  it("asks for the newest first, and only since a date when told", async () => {
    await listVerdicts(stub({ meal_verdicts: { data: [row], error: null } }), "h", { since: "2026-11-12" });
    expect(order).toHaveBeenCalledWith("eaten_on", { ascending: false });
    expect(limit).toHaveBeenCalledWith(1000);
    expect(gte).toHaveBeenCalledWith("eaten_on", "2026-11-12");
  });
  it("asks for one meal when told, and not for a date otherwise", async () => {
    await listVerdicts(stub({}), "h", { mealId: "m" });
    expect(eq).toHaveBeenCalledWith("meal_id", "m");
    expect(gte).not.toHaveBeenCalled();
  });
  it("throws when the read fails", async () => {
    await expect(listVerdicts(stub({ meal_verdicts: { data: null, error: { message: "x" } } }), "h")).rejects.toThrow();
  });
});

describe("dinner dates", () => {
  it("turns week rows into dated dinners", async () => {
    const sb = stub({
      weeks: { data: [{ id: "w", week_start: "2026-11-22" }], error: null },
      week_meals: { data: [{ week_id: "w", day: "wed", meal_id: "m", slot: "dinner" }], error: null },
    });
    expect(await listDinnerDates(sb, "h")).toEqual([{ mealId: "m", date: "2026-11-25" }]);
  });
  it("lists a dinner once when two week rows cover the same date", async () => {
    const sb = stub({
      weeks: {
        data: [
          { id: "w1", week_start: "2026-11-22" },
          { id: "w2", week_start: "2026-11-23" },
        ],
        error: null,
      },
      week_meals: {
        data: [
          { week_id: "w1", day: "wed", meal_id: "m", slot: "dinner" },
          { week_id: "w2", day: "wed", meal_id: "m", slot: "dinner" },
        ],
        error: null,
      },
    });
    expect(await listDinnerDates(sb, "h")).toEqual([{ mealId: "m", date: "2026-11-25" }]);
  });
  it("lists the same meal on two nights as two dinners, newest first", async () => {
    const sb = stub({
      weeks: { data: [{ id: "w", week_start: "2026-11-22" }], error: null },
      week_meals: {
        data: [
          { week_id: "w", day: "mon", meal_id: "m", slot: "dinner" },
          { week_id: "w", day: "thu", meal_id: "m", slot: "dinner" },
        ],
        error: null,
      },
    });
    expect(await listDinnerDates(sb, "h")).toEqual([
      { mealId: "m", date: "2026-11-26" },
      { mealId: "m", date: "2026-11-23" },
    ]);
  });
  it("keeps only the slot asked for, and only dates on or after `since`", async () => {
    const sb = stub({
      weeks: { data: [{ id: "w", week_start: "2026-11-22" }], error: null },
      week_meals: {
        data: [
          { week_id: "w", day: "mon", meal_id: "m1", slot: "dinner" },
          { week_id: "w", day: "wed", meal_id: "m2", slot: "lunch" },
          { week_id: "w", day: "fri", meal_id: "m3", slot: "dinner" },
        ],
        error: null,
      },
    });
    expect(await listDinnerDates(sb, "h", { since: "2026-11-24" })).toEqual([{ mealId: "m3", date: "2026-11-27" }]);
    expect(await listDinnerDates(sb, "h", { slot: "lunch" })).toEqual([{ mealId: "m2", date: "2026-11-25" }]);
  });
  it("reads no week meals when there are no weeks", async () => {
    expect(await listDinnerDates(stub({}), "h")).toEqual([]);
  });
});

describe("loadAsk", () => {
  const household = { id: "h", slots: ["dinner"], time_zone: "America/Los_Angeles" } as unknown as Household;
  const meal = { id: "m", name: "Soup" } as MealRow;

  it("never throws: a verdict query that rejects gives null", async () => {
    const sb = stub({ meal_verdicts: () => Promise.reject(new Error("offline")) });
    await expect(loadAsk(sb, household, "2026-11-29")).resolves.toBeNull();
  });
  it("asks about last week's dinner on the first day of this week, with its own meal and photo", async () => {
    getMeals.mockResolvedValue([meal]);
    mealPhotoSrcs.mockResolvedValue({ m: "https://img/soup.jpg" });
    const sb = stub({
      weeks: { data: [{ id: "w", week_start: "2026-11-22" }], error: null },
      week_meals: { data: [{ week_id: "w", day: "sat", meal_id: "m", slot: "dinner" }], error: null },
    });
    const ask = await loadAsk(sb, household, "2026-11-29");
    expect(getMeals).toHaveBeenCalledWith(sb, ["m"]);
    expect(ask).toEqual({ dinner: { mealId: "m", date: "2026-11-28" }, meal, photo: "https://img/soup.jpg" });
    expect(gte).toHaveBeenCalledWith("eaten_on", "2026-11-15");
  });
  it("gives null when the meal no longer exists", async () => {
    getMeals.mockResolvedValue([]);
    const sb = stub({
      weeks: { data: [{ id: "w", week_start: "2026-11-22" }], error: null },
      week_meals: { data: [{ week_id: "w", day: "sat", meal_id: "m", slot: "dinner" }], error: null },
    });
    await expect(loadAsk(sb, household, "2026-11-29")).resolves.toBeNull();
  });
  it("gives null when the meal or photo lookup fails", async () => {
    getMeals.mockRejectedValue(new Error("boom"));
    const sb = stub({
      weeks: { data: [{ id: "w", week_start: "2026-11-22" }], error: null },
      week_meals: { data: [{ week_id: "w", day: "sat", meal_id: "m", slot: "dinner" }], error: null },
    });
    await expect(loadAsk(sb, household, "2026-11-29")).resolves.toBeNull();
  });
  it("does not ask again about a dinner that has a verdict, and skips the meal lookup", async () => {
    const sb = stub({
      meal_verdicts: { data: [{ ...row, meal_id: "m", eaten_on: "2026-11-28", status: "skipped", votes: {} }], error: null },
      weeks: { data: [{ id: "w", week_start: "2026-11-22" }], error: null },
      week_meals: { data: [{ week_id: "w", day: "sat", meal_id: "m", slot: "dinner" }], error: null },
    });
    await expect(loadAsk(sb, household, "2026-11-29")).resolves.toBeNull();
    expect(getMeals).not.toHaveBeenCalled();
  });
});
