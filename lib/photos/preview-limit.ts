import 'server-only';

const PER_HOUR = 60;
const HOUR_MS = 3_600_000;
/** Builds per household in the last hour, counted in this server instance's memory (each instance counts its own). */
const builds = new Map<string, number[]>();

/** True and counts one build when the household is under 60 an hour; false when it is not. */
export function takePreviewSlot(householdId: string, now: number = Date.now()): boolean {
  const recent = (builds.get(householdId) ?? []).filter((t) => now - t < HOUR_MS);
  if (recent.length >= PER_HOUR) {
    builds.set(householdId, recent);
    return false;
  }
  recent.push(now);
  builds.set(householdId, recent);
  if (builds.size > 5000) {
    for (const [id, times] of builds) if (times.every((t) => now - t >= HOUR_MS)) builds.delete(id);
  }
  return true;
}

/** Tests only. */
export function resetPreviewLimit(): void {
  builds.clear();
}
