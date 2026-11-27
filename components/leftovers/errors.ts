import { DinnerChangedError, DinnerGoneError, NightTakenError } from "@/lib/db/queries/weeks";
import type { Day } from "@/lib/domain/weeks";
import { dayName } from "@/lib/week/format";

/** What to tell the person when a leftovers write fails. `day` is the night they picked. */
export function leftoverFailure(e: unknown, day: Day | null, fallback: string): string {
  if (e instanceof NightTakenError) return day ? `${dayName(day)} was just taken. Pick another night.` : fallback;
  if (e instanceof DinnerChangedError || e instanceof DinnerGoneError) return e.message;
  return fallback;
}
