// A half-finished form survives a reload or a phone call: kept in localStorage for 7 days.
// Every call is wrapped: private mode and a full disk must never break the screen.

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Stored {
  savedAt: number;
  value: unknown;
}

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' || localStorage === null ? null : localStorage;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, value: unknown): void {
  try {
    const s = store();
    if (!s) return;
    const stored: Stored = { savedAt: Date.now(), value };
    s.setItem(key, JSON.stringify(stored));
  } catch {
    // Not saving is fine.
  }
}

export function loadDraft<T>(key: string): T | null {
  try {
    const s = store();
    const raw = s?.getItem(key);
    if (!s || !raw) return null;
    const stored = JSON.parse(raw) as Partial<Stored> | null;
    if (!stored || typeof stored.savedAt !== 'number') return null;
    if (Date.now() - stored.savedAt > MAX_AGE_MS) {
      s.removeItem(key);
      return null;
    }
    return (stored.value ?? null) as T | null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    store()?.removeItem(key);
  } catch {
    // Nothing to do.
  }
}
