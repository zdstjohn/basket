import { describe, expect, it } from "vitest";
import { Pending, skipReason } from "../../proof/pending";

describe("proof: when a test may skip", () => {
  it("skips for a Pending, with its reason", () => {
    expect(skipReason(new Pending("the week's error screen has no trigger yet"))).toBe("the week's error screen has no trigger yet");
  });

  it("never skips for any other error: a finished screen that breaks must fail", () => {
    expect(skipReason(new Error("locator.click: Timeout 8000ms exceeded"))).toBeNull();
    expect(skipReason(new TypeError("x is undefined"))).toBeNull();
    expect(skipReason("a thrown string")).toBeNull();
    expect(skipReason(undefined)).toBeNull();
  });
});
