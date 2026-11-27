import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { saveOnboarding } from "@/lib/onboarding/save";

type Rec = { op: string; table?: string; args: unknown[] };

// Stateful fake: tracks people rows so a repeated save can be checked for duplicates.
function fake(opts: { existingPeople?: number; failInsertOnce?: boolean } = {}) {
  const log: Rec[] = [];
  let people = opts.existingPeople ?? 0;
  let failInsert = opts.failInsertOnce ?? false;
  const sb = {
    rpc: async (name: string, args: unknown) => {
      log.push({ op: `rpc:${name}`, args: [args] });
      return { data: "h1", error: null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: async () => ({ count: people, error: null }),
      }),
      insert: async (rows: unknown[]) => {
        log.push({ op: "insert", table, args: [rows] });
        if (failInsert) {
          failInsert = false;
          return { error: { message: "boom" } };
        }
        people += rows.length;
        return { error: null };
      },
      update: (patch: unknown) => ({
        eq: async (col: string, val: string) => {
          log.push({ op: "update", table, args: [patch, col, val] });
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient<Database>;
  return { sb, log, peopleCount: () => people };
}

const person = (name: string, age: number) => ({
  name, age, diet: "none" as const, appetite: 1, dislikes: [],
});
const input = {
  name: "The Smiths",
  people: [person("Dad", 38), person("Mom", 39), person("Son", 8), person("Daughter", 6), person("Daughter", 4)],
  budgetCents: 20000,
  cushionCents: 2500,
};
const count = (log: Rec[], op: string) => log.filter((r) => r.op === op).length;

describe("saveOnboarding", () => {
  it("creates the household once and inserts all five people in one call", async () => {
    const { sb, log } = fake();
    expect(await saveOnboarding(sb, input, null)).toBe("h1");
    expect(count(log, "rpc:create_household")).toBe(1);
    expect(count(log, "insert")).toBe(1);
    const rows = log.find((r) => r.op === "insert")!.args[0] as { sort: number; household_id: string }[];
    expect(rows.map((r) => r.sort)).toEqual([0, 1, 2, 3, 4]);
    expect(rows.every((r) => r.household_id === "h1")).toBe(true);
    expect(log.find((r) => r.op === "update")!.args[0]).toEqual({
      budget_cents: 20000,
      cushion_cents: 2500,
    });
  });

  it("saves each person's allergies, none by default", async () => {
    const { sb, log } = fake();
    await saveOnboarding(sb, input, null);
    const rows = log.find((r) => r.op === "insert")!.args[0] as { allergies: string[] }[];
    expect(rows.map((r) => r.allergies)).toEqual([[], [], [], [], []]);
    const b = fake();
    const people = [{ ...person("Mom", 39), allergies: ["sesame"] }, ...input.people.slice(1)];
    await saveOnboarding(b.sb, { ...input, people }, null);
    const sent = b.log.find((r) => r.op === "insert")!.args[0] as { allergies: string[] }[];
    expect(sent[0].allergies).toEqual(["sesame"]);
  });

  it("on retry with an empty existing household, skips create and inserts once", async () => {
    const { sb, log } = fake();
    await saveOnboarding(sb, input, "h1");
    expect(count(log, "rpc:create_household")).toBe(0);
    expect(count(log, "insert")).toBe(1);
  });

  it("with people already saved, inserts nothing and only updates the budget", async () => {
    const { sb, log } = fake({ existingPeople: 5 });
    await saveOnboarding(sb, input, "h1");
    expect(count(log, "insert")).toBe(0);
    expect(count(log, "update")).toBe(1);
  });

  it("a failed people insert throws, and the second call does not duplicate", async () => {
    const { sb, log, peopleCount } = fake({ failInsertOnce: true });
    await expect(saveOnboarding(sb, input, null)).rejects.toThrow("boom");
    expect(peopleCount()).toBe(0);
    await saveOnboarding(sb, input, "h1");
    expect(peopleCount()).toBe(5);
    await saveOnboarding(sb, input, "h1");
    expect(peopleCount()).toBe(5);
    expect(count(log, "rpc:create_household")).toBe(1);
  });
});
