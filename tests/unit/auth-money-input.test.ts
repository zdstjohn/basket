import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/safe-next";
import {
  formatDollars,
  formatExtra,
  parseMoneyToCents,
} from "@/lib/domain/money-input";

describe("safeNext", () => {
  it("keeps same-origin paths", () => {
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
    expect(safeNext("/household?x=1")).toBe("/household?x=1");
  });
  it("sends everything else to /week", () => {
    for (const bad of [null, undefined, "", "https://evil.test", "//evil.test", "/\\evil.test", "week"]) {
      expect(safeNext(bad)).toBe("/week");
    }
  });
});

describe("money input", () => {
  it("parses dollars into cents", () => {
    expect(parseMoneyToCents("$200")).toBe(20000);
    expect(parseMoneyToCents("+$25")).toBe(2500);
    expect(parseMoneyToCents(" 12.50 ")).toBe(1250);
  });
  it("rejects things that aren't an amount", () => {
    for (const bad of ["", "abc", "-5", "$1.234", "1,00", "12,34"]) {
      expect(parseMoneyToCents(bad)).toBeNull();
    }
  });
  it("formats cents back", () => {
    expect(formatDollars(20000)).toBe("$200");
    expect(formatDollars(1250)).toBe("$12.50");
    expect(formatExtra(2500)).toBe("+$25");
  });
});
