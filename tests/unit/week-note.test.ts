import { describe, expect, it } from "vitest";
import { familyOfFive } from "@/lib/fixtures/household";
import { tacos } from "@/lib/fixtures/tacos";
import type { Meal } from "@/lib/domain/types";
import { dayNote, mealTag } from "@/lib/week/note";

const veg: Meal = {
  ...tacos,
  id: "veg",
  name: "Mac and cheese",
  ingredients: [{ canonical: "macaroni", amount: 1, unit: "lb", role: "pantry" }],
  vegSwap: null,
};

describe("dayNote", () => {
  it("names who gets the swap", () => {
    expect(dayNote(tacos, familyOfFive, null)).toBe("Mom: black beans instead");
  });

  it("lists several people, once each", () => {
    const people = [
      ...familyOfFive,
      { ...familyOfFive[1], id: "x", name: "Aunt" },
      { ...familyOfFive[1], id: "y", name: "Mom" },
    ];
    expect(dayNote(tacos, people, null)).toBe("Mom and Aunt: black beans instead");
  });

  it("says everyone vegetarian when there is no meat or fish", () => {
    expect(dayNote(veg, familyOfFive, null)).toBe("Everyone vegetarian");
  });

  it("says everyone vegetarian when the meal is flagged so", () => {
    expect(dayNote({ ...tacos, everyoneVegetarian: true }, familyOfFive, null)).toBe(
      "Everyone vegetarian",
    );
  });

  it("adds leftovers only when servings exceed the household's", () => {
    expect(dayNote(veg, familyOfFive, 5.8)).toBe("Everyone vegetarian · +2 for leftovers");
    expect(dayNote(veg, familyOfFive, 3.8)).toBe("Everyone vegetarian");
    expect(dayNote(veg, familyOfFive, 3)).toBe("Everyone vegetarian");
    expect(dayNote(tacos, familyOfFive, 5.3)).toBe(
      "Mom: black beans instead · +1.5 for leftovers",
    );
  });

  it("says plainly when someone has no swap", () => {
    expect(dayNote({ ...tacos, vegSwap: null }, familyOfFive, null)).toBe("Mom: no swap yet");
  });

  it("says everyone eats it when nobody skips the meat", () => {
    expect(dayNote(tacos, [familyOfFive[0], familyOfFive[2]], null)).toBe("Everyone eats this");
  });
});

describe("mealTag", () => {
  it("is Vegetarian with no meat or fish", () => {
    expect(mealTag(veg)).toBe("vegetarian");
    expect(mealTag({ ...tacos, everyoneVegetarian: true })).toBe("vegetarian");
  });
  it("is swap when meat comes with a swap", () => {
    expect(mealTag(tacos)).toBe("swap");
  });
  it("is null for meat with no swap", () => {
    expect(mealTag({ ...tacos, vegSwap: null })).toBeNull();
  });

  it("says cooking double", () => {
    expect(dayNote(veg, familyOfFive, 7.6)).toBe("Everyone vegetarian · cooking double");
    expect(dayNote(veg, familyOfFive, 5.8, true)).toBe("Everyone vegetarian · cooking double");
    expect(dayNote(veg, familyOfFive, null, true)).toBe("Everyone vegetarian · cooking double");
    expect(dayNote(veg, familyOfFive, 5.8)).toBe("Everyone vegetarian · +2 for leftovers");
  });
});
