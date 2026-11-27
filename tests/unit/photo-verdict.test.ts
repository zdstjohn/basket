import { describe, expect, it } from "vitest";
import { photoVerdict } from "@/lib/photos/verdict";

describe("photoVerdict", () => {
  it("trusts a photo whose width is not known yet", () => {
    expect(photoVerdict("tile", null)).toBe("ok");
    expect(photoVerdict("hero", null)).toBe("ok");
    expect(photoVerdict("thumb", null)).toBe("ok");
  });
  it("sends an unreadable photo (width 0) to the fallback in every crop", () => {
    expect(photoVerdict("tile", 0)).toBe("fallback");
    expect(photoVerdict("hero", 0)).toBe("fallback");
    expect(photoVerdict("thumb", 0)).toBe("fallback");
  });
  it("tile: under 300 is the fallback, 300 is fine", () => {
    expect(photoVerdict("tile", 299)).toBe("fallback");
    expect(photoVerdict("tile", 300)).toBe("ok");
  });
  it("hero: under 300 is the fallback, under 600 is demoted to a tile, 600 is fine", () => {
    expect(photoVerdict("hero", 250)).toBe("fallback");
    expect(photoVerdict("hero", 299)).toBe("fallback");
    expect(photoVerdict("hero", 300)).toBe("demote");
    expect(photoVerdict("hero", 599)).toBe("demote");
    expect(photoVerdict("hero", 600)).toBe("ok");
  });
  it("thumb: any readable photo is fine", () => {
    expect(photoVerdict("thumb", 120)).toBe("ok");
    expect(photoVerdict("thumb", 1)).toBe("ok");
  });
});
