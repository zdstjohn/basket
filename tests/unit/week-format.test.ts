import { describe, expect, it } from "vitest";
import { dayName, formatMinutes, formatWeekRange, previousWeekStart } from "@/lib/week/format";

describe("week formatting", () => {
  it("formats a week range inside a month and across months", () => {
    expect(formatWeekRange("2026-11-22")).toBe("Nov 22 – 28");
    expect(formatWeekRange("2026-11-29")).toBe("Nov 29 – Dec 5");
    expect(formatWeekRange("2026-12-27")).toBe("Dec 27 – Jan 2");
  });
  it("steps back one week", () => {
    expect(previousWeekStart("2026-11-29")).toBe("2026-11-22");
    expect(previousWeekStart("2026-01-04")).toBe("2025-12-28");
  });
  it("names days", () => {
    expect(dayName("thu")).toBe("Thursday");
  });
  it("formats minutes", () => {
    expect(formatMinutes(30)).toBe("30 min");
    expect(formatMinutes(70)).toBe("1 hr 10 min");
    expect(formatMinutes(120)).toBe("2 hr");
  });
});

import { isDay } from "@/lib/week/format";

describe("isDay", () => {
  it("accepts the seven days", () => {
    for (const d of ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]) expect(isDay(d)).toBe(true);
  });
  it("rejects prototype keys and other junk", () => {
    for (const v of ["constructor", "toString", "__proto__", "hasOwnProperty", "Thu", "", 3, null, undefined]) {
      expect(isDay(v)).toBe(false);
    }
  });
});
