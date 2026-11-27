export const SETTLE_KEY = "basket:settle";

function store(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** Remember which day just got a meal, so the next screen can play the settle. */
export function markSettle(day: string, storage?: Storage | null, now: number = Date.now()): void {
  try {
    store(storage)?.setItem(SETTLE_KEY, JSON.stringify({ day, at: now }));
  } catch {
    /* private mode: no settle, no harm */
  }
}

/** The marked day if it was marked under 10 s ago; always clears the mark. */
export function takeSettle(storage?: Storage | null, now: number = Date.now()): string | null {
  try {
    const s = store(storage);
    const raw = s?.getItem(SETTLE_KEY);
    if (!s || !raw) return null;
    s.removeItem(SETTLE_KEY);
    const v = JSON.parse(raw) as { day?: unknown; at?: unknown };
    if (typeof v.day !== "string" || typeof v.at !== "number") return null;
    return now - v.at < 10_000 ? v.day : null;
  } catch {
    return null;
  }
}

/** Days in `next` that were empty in `prev`. A first load (prev null) settles nothing. */
export function newlyFilled(prev: string[] | null, next: string[]): string[] {
  if (!prev) return [];
  const had = new Set(prev);
  return next.filter((d) => !had.has(d));
}
