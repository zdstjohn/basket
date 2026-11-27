import { describe, expect, it } from "vitest";
import { formatMoney, parseMoneyToCents } from "@/lib/domain/money-input";

describe("formatMoney", () => {
  it("never writes a minus in front of zero", () => {
    expect(formatMoney(-0.4)).toBe("$0.00");
    expect(formatMoney(-150)).toBe("-$1.50");
  });
  it("always shows cents by default", () => {
    expect(formatMoney(300)).toBe("$3.00");
    expect(formatMoney(300, { zero: "keep" })).toBe("$3.00");
    expect(formatMoney(5)).toBe("$0.05");
    expect(formatMoney(0)).toBe("$0.00");
  });
  it("drops .00 only when asked", () => {
    expect(formatMoney(20000, { zero: "drop" })).toBe("$200");
    expect(formatMoney(20050, { zero: "drop" })).toBe("$200.50");
  });
  it("puts a thousands separator in", () => {
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(120000, { zero: "drop" })).toBe("$1,200");
  });
});

describe("parseMoneyToCents, more shapes", () => {
  it("accepts .99, 3. and 1,200", () => {
    expect(parseMoneyToCents(".99")).toBe(99);
    expect(parseMoneyToCents("3.")).toBe(300);
    expect(parseMoneyToCents("1,200")).toBe(120000);
    expect(parseMoneyToCents("$1,200.50")).toBe(120050);
  });
  it("still fails on words and empty", () => {
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents(".")).toBeNull();
  });
});
