import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Qty } from "@/components/ui/Qty";
import { curly, portionText, quantityParts, servingsText } from "@/lib/text/typography";
import { toQuantity } from "@/lib/domain/units";
import type { Quantity } from "@/lib/domain/types";

const q = (amount: number, unit: string): Quantity => {
  const r = toQuantity(amount, unit);
  if (!r) throw new Error(`bad unit ${unit}`);
  return r;
};

describe("curly", () => {
  it("curls apostrophes and quotes", () => {
    expect(curly(`Who's eating`)).toBe("Who’s eating");
    expect(curly(`"Mom's pick"`)).toBe("“Mom’s pick”");
  });
  it("uses an en dash in number ranges and one ellipsis character", () => {
    expect(curly("3-4 servings")).toBe("3–4 servings");
    expect(curly("Loading...")).toBe("Loading…");
  });
  it("leaves hyphenated words alone", () => {
    expect(curly("well-done steak")).toBe("well-done steak");
  });
});

describe("quantityParts", () => {
  it("snaps simple fractions", () => {
    expect(quantityParts(q(1.5, "cup"))).toEqual({ lead: "1½", built: null, rest: " cups" });
    expect(quantityParts(q(0.5, "cup"))).toEqual({ lead: "½", built: null, rest: " cup" });
    expect(quantityParts(q(1 / 3, "cup")).lead).toBe("⅓");
    expect(quantityParts(q(2 / 3, "cup")).lead).toBe("⅔");
    expect(quantityParts(q(0.75, "tsp")).lead).toBe("¾");
    expect(quantityParts(q(0.25, "tsp")).lead).toBe("¼");
  });
  it("builds an odd eighth", () => {
    expect(quantityParts(q(2.125, "lb"))).toEqual({ lead: "2 ", built: "1/8", rest: " lb" });
    expect(quantityParts(q(0.375, "lb")).built).toBe(null); // 6 oz, whole number
  });
  it("leaves anything it cannot snap as formatQuantity writes it", () => {
    expect(quantityParts(q(11.2, "oz"))).toEqual({ lead: "11.2", built: null, rest: " oz" });
  });
  it("a bare count is its whole text", () => {
    expect(quantityParts({ amount: 12, kind: "count", base: "each" })).toEqual({ lead: "12", built: null, rest: "" });
    expect(renderToStaticMarkup(createElement(Qty, { q: { amount: 12, kind: "count", base: "each" } }))).toBe("12");
  });
  it("the unit is singular when the amount is 1 or less", () => {
    expect(quantityParts(q(1, "cup")).rest).toBe(" cup");
    expect(quantityParts(q(2, "cup")).rest).toBe(" cups");
    expect(quantityParts({ amount: 1, kind: "count", base: "each", countUnit: "can" }).rest).toBe(" can");
    expect(quantityParts({ amount: 2, kind: "count", base: "each", countUnit: "can" }).rest).toBe(" cans");
  });
  it("snaps from the unrounded amount", () => {
    // 1.49 cups would print "1.5 cups" via num(); the unrounded value is not within 0.02 of a half... 1.49 is.
    expect(quantityParts(q(1.49, "cup")).lead).toBe("1½");
    expect(quantityParts(q(1.44, "cup")).lead).toBe("1.4");
  });
});

describe("Qty", () => {
  it("wraps only the built fraction in .bk-qty", () => {
    const html = renderToStaticMarkup(createElement(Qty, { q: q(2.125, "lb") }));
    expect(html).toBe('2 <span class="bk-qty">1/8</span> lb');
  });
  it("renders a snapped fraction as plain text", () => {
    expect(renderToStaticMarkup(createElement(Qty, { q: q(1.5, "cup") }))).toBe("1½ cups");
  });
});

describe("servingsText and portionText", () => {
  it("pluralizes servings", () => {
    expect(servingsText(1)).toBe("1 serving");
    expect(servingsText(3.8)).toBe("3.8 servings");
    expect(servingsText(0)).toBe("0 servings");
    expect(servingsText(4)).toBe("4 servings");
  });
  it("writes portions", () => {
    expect(portionText(1)).toBe("1 portion");
    expect(portionText(0.7)).toBe("0.7 of a portion");
  });
});
