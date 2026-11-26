import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import {
  createInviteLink,
  deletePerson,
  listPeople,
  updateHousehold,
  upsertPerson,
} from "@/lib/db/queries/household";

type Call = [string, unknown[]];

// A chainable stand-in for the Supabase query builder: every method records
// its call and returns the builder; awaiting it resolves to `result`.
function mockClient(result: { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const builder: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: unknown) => unknown) => resolve(result);
        }
        return (...args: unknown[]) => {
          calls.push([String(prop), args]);
          return builder;
        };
      },
    },
  );
  const sb = {
    from: (table: string) => {
      calls.push(["from", [table]]);
      return builder;
    },
    rpc: (name: string, ...rest: unknown[]) => {
      calls.push(["rpc", [name, ...rest]]);
      return builder;
    },
  } as unknown as SupabaseClient<Database>;
  return { sb, calls };
}

const find = (calls: Call[], name: string) =>
  calls.find(([n]) => n === name)?.[1];

const row = {
  id: "p1",
  created_at: "2026-11-26T00:00:00Z",
  household_id: "h1",
  name: "Mom",
  age: 39,
  diet: "vegetarian",
  appetite: 1,
  dislikes: ["mushrooms"],
  sort: 1,
};

afterEach(() => vi.unstubAllGlobals());

describe("listPeople", () => {
  it("maps rows to Person, turning a null age into 0", async () => {
    const { sb, calls } = mockClient({
      data: [row, { ...row, id: "p2", name: "Baby", age: null, appetite: "0.5" }],
      error: null,
    });
    const people = await listPeople(sb, "h1");
    expect(people).toEqual([
      {
        id: "p1",
        name: "Mom",
        age: 39,
        diet: "vegetarian",
        appetite: 1,
        dislikes: ["mushrooms"],
      },
      { id: "p2", name: "Baby", age: 0, diet: "vegetarian", appetite: 0.5, dislikes: ["mushrooms"] },
    ]);
    expect(find(calls, "from")).toEqual(["people"]);
    expect(find(calls, "eq")).toEqual(["household_id", "h1"]);
  });

  it("throws when the query fails", async () => {
    const { sb } = mockClient({ data: null, error: { message: "nope" } });
    await expect(listPeople(sb, "h1")).rejects.toThrow("nope");
  });
});

describe("upsertPerson", () => {
  const person = {
    name: "Mom",
    age: 39,
    diet: "vegetarian" as const,
    appetite: 1,
    dislikes: [],
  };

  it("inserts with the household id and sort when there is no id", async () => {
    const { sb, calls } = mockClient({ data: row, error: null });
    const saved = await upsertPerson(sb, "h1", person, 3);
    expect(find(calls, "insert")).toEqual([
      { household_id: "h1", ...person, sort: 3 },
    ]);
    expect(find(calls, "update")).toBeUndefined();
    expect(saved.id).toBe("p1");
    expect(saved.age).toBe(39);
  });

  it("updates by id when an id is given, without touching the household", async () => {
    const { sb, calls } = mockClient({ data: row, error: null });
    await upsertPerson(sb, "h1", { ...person, id: "p1" });
    expect(find(calls, "update")).toEqual([person]);
    expect(find(calls, "eq")).toEqual(["id", "p1"]);
    expect(find(calls, "insert")).toBeUndefined();
  });
});

describe("deletePerson", () => {
  it("deletes by id", async () => {
    const { sb, calls } = mockClient({ data: null, error: null });
    await deletePerson(sb, "p1");
    expect(find(calls, "from")).toEqual(["people"]);
    expect(calls.some(([n]) => n === "delete")).toBe(true);
    expect(find(calls, "eq")).toEqual(["id", "p1"]);
  });
});

describe("updateHousehold", () => {
  it("sends only the patched columns", async () => {
    const { sb, calls } = mockClient({ data: null, error: null });
    await updateHousehold(sb, "h1", { budget_cents: 22000 });
    expect(find(calls, "from")).toEqual(["households"]);
    expect(find(calls, "update")).toEqual([{ budget_cents: 22000 }]);
    expect(find(calls, "eq")).toEqual(["id", "h1"]);
  });
});

describe("createInviteLink", () => {
  it("builds an absolute URL from the token and the given origin", async () => {
    const { sb, calls } = mockClient({ data: "abc123", error: null });
    const link = await createInviteLink(sb, "https://basket.test");
    expect(find(calls, "rpc")).toEqual(["create_invite"]);
    expect(link).toBe("https://basket.test/invite/abc123");
  });

  it("defaults to the browser origin", async () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
    const { sb } = mockClient({ data: "tok", error: null });
    expect(await createInviteLink(sb)).toBe("http://localhost:3000/invite/tok");
  });
});
