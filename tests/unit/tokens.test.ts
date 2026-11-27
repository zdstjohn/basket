import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, parseAutoTokens, parseTokens } from "@/lib/design/contrast";

const css = readFileSync("app/globals.css", "utf8");
const t = parseTokens(css);

const PAIRS = [
  ["ink", "ground"], ["ink", "surface"], ["ink", "raised"], ["ink", "sunk"],
  ["ink", "error-tint"], ["ink", "sale-tint"],
  ["ink-soft", "ground"], ["ink-soft", "surface"], ["ink-soft", "raised"], ["ink-soft", "sunk"],
  ["on-accent", "accent"], ["on-accent", "accent-press"],
  ["accent", "ground"], ["accent", "surface"],
  ["ground", "ink"],
  ["sale", "ground"], ["sale", "surface"], ["sale", "sale-tint"],
  ["error", "ground"], ["error", "surface"], ["error", "raised"], ["error", "error-tint"],
  ["price", "ground"], ["price", "surface"],
  ["estimate", "ground"], ["estimate", "surface"],
];

describe("contrast of the design values", () => {
  for (const look of ["light", "dark"] as const)
    for (const [fg, bg] of PAIRS)
      it(`${look}: ${fg} on ${bg} is at least 4.5`, () =>
        expect(contrastRatio(t[look][fg], t[look][bg])).toBeGreaterThanOrEqual(4.5));

  it("line-strong and error are at least 3 against ground and surface in both looks (control and box edges, audit C10)", () => {
    for (const look of ["light", "dark"] as const)
      for (const fg of ["line-strong", "error"])
        for (const bg of ["ground", "surface"])
          expect(contrastRatio(t[look][fg], t[look][bg]), `${look} ${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
  });

  it("ink on ground is 13.67 in Butter and 15.44 in Cast Iron", () => {
    expect(contrastRatio(t.light.ink, t.light.ground)).toBeCloseTo(13.67, 1);
    expect(contrastRatio(t.dark.ink, t.dark.ground)).toBeCloseTo(15.44, 1);
  });

  it("contrastRatio reads hex and rgb()", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("rgb(0 0 0)", "rgb(255, 255, 255)")).toBeCloseTo(21, 5);
  });
});

describe("globals.css structure", () => {
  it('[data-look="dark"] and the auto media block hold the same values', () => {
    const auto = parseAutoTokens(css);
    expect(Object.keys(auto).length).toBeGreaterThan(20);
    expect(auto).toEqual(t.dark);
  });

  it("there is a fallback for browsers without linear()", () => {
    expect(css).toMatch(/@supports not \(transition-timing-function: linear\(0, 1\)\)/);
  });

  it(".bk-press and the html and body rules each appear once", () => {
    const count = (re: RegExp) => (css.match(re) ?? []).length;
    expect(count(/^\.bk-press\s*\{/gm)).toBe(1);
    expect(count(/^html\s*\{/gm)).toBe(1);
    expect(count(/^body\s*\{/gm)).toBe(1);
  });

  it("names the fonts through next/font variables and keeps the legacy aliases marked", () => {
    expect(css).toContain("var(--font-gloock)");
    expect(css).toContain("var(--font-figtree)");
    expect(css).toContain("LEGACY ALIASES: deleted in Task C2");
    expect(css).toMatch(/--bk-nav-h:\s*calc\(3rem \+ var\(--bk-safe-bottom\)\)/);
  });
});
