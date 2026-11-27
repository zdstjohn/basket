import type { Page } from "@playwright/test";
import { dinnerDate, weekStartFor, type Day } from "../../lib/domain/weeks";

const ZONE = "America/Los_Angeles";

/** The instant that is 12:00 on the given calendar date (YYYY-MM-DD) in Los Angeles, whichever side of the clock change it falls. */
export function noonLosAngeles(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  for (const offset of [7, 8]) {
    const at = new Date(Date.UTC(y, m - 1, d, 12 + offset));
    const hour = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", hourCycle: "h23" }).format(at);
    if (Number(hour) === 12) return at;
  }
  throw new Error(`No noon in Los Angeles on ${date}`);
}

/** Makes the page believe it is noon, Los Angeles time, on that weekday of the current week (Sunday starts the week). */
export async function pinToday(page: Page, day: Day): Promise<void> {
  const weekStart = weekStartFor(new Date(), "sun", ZONE);
  await page.clock.setFixedTime(noonLosAngeles(dinnerDate(weekStart, day)));
}
