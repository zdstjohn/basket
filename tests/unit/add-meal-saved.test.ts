import { describe, expect, it } from "vitest";
import { matchedWords, parseSavedAddMeal } from "@/lib/add-meal-saved";
import { familyOfFive } from "@/lib/fixtures/household";
import { failureForStatus, loginUrl, messageFor, ApiFailure } from "@/components/add-meal/api";

const draft = {
  name: "Chicken tacos",
  baseServings: 4,
  ingredients: [{ canonical: "corn tortillas", amount: 12, unit: "each", role: "bakery" }],
  vegSwap: null,
  sourceUrl: null,
  photo: null,
};
const ok = { tab: "search", query: "tacos", paste: "", draft, saveFavorite: true };

describe("parseSavedAddMeal", () => {
  it("accepts a good saved state, with or without a draft", () => {
    expect(parseSavedAddMeal(ok)?.draft?.name).toBe("Chicken tacos");
    expect(parseSavedAddMeal({ ...ok, draft: null })?.draft).toBeNull();
  });
  it("drops malformed values instead of crashing", () => {
    for (const bad of [
      null, 5, "x", [], {},
      { ...ok, tab: "nope" },
      { ...ok, query: 3 },
      { ...ok, saveFavorite: "yes" },
      { ...ok, draft: { name: "x" } },
      { ...ok, draft: { ...draft, ingredients: [] } },
      { ...ok, draft: { ...draft, sourceUrl: "javascript:alert(1)" } },
    ]) {
      expect(parseSavedAddMeal(bad)).toBeNull();
    }
  });
});

describe("the matched food words kept beside a draft", () => {
  it("keeps only the words that matched, never the recipe's lines", () => {
    const people = familyOfFive.map((p) => (p.id === "son" ? { ...p, allergies: ["tree nuts"] } : p));
    const lines = ["1 cup sliced almonds", "2 cups quinoa", "olive oil"];
    expect(matchedWords(lines, people)).toEqual(["almonds"]);
    expect(matchedWords(lines, familyOfFive)).toEqual([]);
  });
  it("reads them back, drops anything that is not a short word, and defaults to none", () => {
    expect(parseSavedAddMeal({ ...ok, matched: ["almonds"] })?.matched).toEqual(["almonds"]);
    expect(parseSavedAddMeal({ ...ok, matched: ["almonds", 4, "x".repeat(200)] })?.matched).toEqual(["almonds"]);
    expect(parseSavedAddMeal({ ...ok, matched: "almonds" })?.matched).toEqual([]);
    expect(parseSavedAddMeal(ok)?.matched).toEqual([]);
  });
});

describe("api failures", () => {
  it("maps statuses", () => {
    expect(failureForStatus(401)).toBe("unauthorized");
    expect(failureForStatus(402)).toBe("cap");
    expect(failureForStatus(429)).toBe("source_limit");
    expect(failureForStatus(422)).toBe("unreadable");
    expect(failureForStatus(500)).toBe("other");
  });
  it("builds a login link that comes back to the page", () => {
    expect(loginUrl("/week/add?day=thu&slot=dinner")).toBe("/login?next=%2Fweek%2Fadd%3Fday%3Dthu%26slot%3Ddinner");
  });
  it("words an unreadable pasted link", () => {
    expect(messageFor(new ApiFailure("unreadable"), true)).toBe(
      "We couldn’t read that page. Try pasting the recipe text instead.",
    );
  });
});

describe('spend guard messages', () => {
  it('slow says wait a minute; busy says try again in an hour', () => {
    expect(messageFor(new ApiFailure("slow"))).toBe("Too many tries just now. Wait a minute and try again.");
    expect(messageFor(new ApiFailure("busy"))).toBe("Lots of people are searching right now. Try again in an hour.");
  });
});
