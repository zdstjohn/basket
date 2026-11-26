import { describe, expect, it } from "vitest";
import { parseSavedAddMeal } from "@/lib/add-meal-saved";
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
      "We couldn't read that page. Try pasting the recipe text instead.",
    );
  });
});
