import { loadDraft, saveDraft } from '@/lib/drafts';

// The last list for each week, and the check-offs made while offline, live in localStorage.
// Every call goes through drafts.ts, which never throws (private mode, full disk).

export interface ItemPatch {
  have_it?: boolean;
  checked?: boolean;
  outside_budget?: boolean;
}

export interface QueuedPatch {
  /** Changes whenever the entry is rewritten, so a send can tell "the one I sent" from "a newer one". */
  id: string;
  weekId: string;
  itemKey: string;
  patch: ItemPatch;
  /** Failed sends so far. Entries stored before this field existed read as 0. */
  attempts?: number;
  /** When the first send failed (ms since epoch). Entries stored before this field existed read as "now". */
  firstTriedAt?: number;
}

/** A queued change that has failed this many times, or is this old past its first try, is given up on. */
export const MAX_ATTEMPTS = 10;
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Keys this module owns in localStorage; signing out removes them (see lib/signout.ts). */
export const LIST_KEY_PATTERN = /^(list:|list-week$|list-queue)/;

const queueKey = (householdId: string): string => `list-queue:${householdId}`;
const cacheKey = (weekId: string): string => `list:${weekId}`;

let counter = 0;
export const newEntryId = (): string => `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const REFUSAL_STATUS = new Set([400, 403, 404, 406, 409, 413, 422]);

/**
 * True only when the server clearly refused the change, so sending it again can never work:
 * a Postgres error class 22 (bad data), 23 (constraint) or 42 (permission or syntax), or an HTTP
 * 400, 403, 404, 406, 409, 413 or 422, or a 5xx that carries a Postgres-style code (five letters or
 * digits, not PGRST...: a trigger or function raising an error, class P0 or XX). setItemState attaches `code` and `status` to what it throws.
 * Never true while the phone says it is offline, and never for an expired or missing sign-in
 * (status 401, PostgREST PGRST301 to PGRST303): those pass once the session is refreshed.
 * A permanent error that carries no code or status is not recognised here; flushQueue gives up on
 * it after MAX_ATTEMPTS failures or MAX_AGE_MS so it can't block the queue forever.
 */
export function isRefusal(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (typeof e !== 'object' || e === null) return false;
  const { code, status } = e as { code?: unknown; status?: unknown };
  if (typeof code === 'string' && /^PGRST30[1-3]$/.test(code)) return false;
  if (status === 401) return false;
  if (typeof code === 'string' && /^(22|23|42)/.test(code)) return true;
  if (typeof status !== 'number') return false;
  if (REFUSAL_STATUS.has(status)) return true;
  return status >= 500 && status <= 599 && typeof code === 'string' && /^[A-Za-z0-9]{5}$/.test(code) && !code.startsWith('PGRST');
}

/**
 * True when a failed send should stay in the queue and be tried again: everything except a clear
 * refusal (see isRefusal). That covers a dropped connection, a timeout, a gateway error, an
 * expired sign-in and anything unrecognised. The name is kept for lib/useWeekList.ts.
 */
export function isNetworkError(e: unknown): boolean {
  return !isRefusal(e);
}

/** Adds a change to the queue. A newer change to the same item wins field by field. */
export function mergePatch(queue: QueuedPatch[], entry: QueuedPatch): QueuedPatch[] {
  const at = queue.findIndex((q) => q.weekId === entry.weekId && q.itemKey === entry.itemKey);
  if (at === -1) return [...queue, entry];
  const next = [...queue];
  next[at] = { ...entry, patch: { ...queue[at].patch, ...entry.patch } };
  return next;
}

export function loadQueue(householdId: string): QueuedPatch[] {
  const q = loadDraft<QueuedPatch[]>(queueKey(householdId));
  return Array.isArray(q) ? q : [];
}

export function saveQueue(householdId: string, queue: QueuedPatch[]): void {
  saveDraft(queueKey(householdId), queue);
}

export function enqueuePatch(householdId: string, entry: Omit<QueuedPatch, 'id'>): void {
  saveQueue(householdId, mergePatch(loadQueue(householdId), { ...entry, id: newEntryId() }));
}

/** Adds many changes with one read and one write of the queue: still one entry per item, in the given order. */
export function enqueuePatches(householdId: string, entries: Omit<QueuedPatch, 'id'>[]): void {
  if (entries.length === 0) return;
  let queue = loadQueue(householdId);
  for (const e of entries) queue = mergePatch(queue, { ...e, id: newEntryId() });
  saveQueue(householdId, queue);
}

/**
 * Counts one failed send of `head` in the stored queue. Returns true when the entry should now be
 * dropped (MAX_ATTEMPTS failures, or more than MAX_AGE_MS since the first). Offline failures are not counted.
 */
function recordFailure(householdId: string, head: QueuedPatch): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const now = Date.now();
  const attempts = (head.attempts ?? 0) + 1;
  const firstTriedAt = head.firstTriedAt ?? now;
  if (attempts >= MAX_ATTEMPTS || now - firstTriedAt > MAX_AGE_MS) return true;
  // Only the entry that was sent is updated; if it was rewritten meanwhile it has a new id and starts fresh.
  saveQueue(
    householdId,
    loadQueue(householdId).map((q) => (q.id === head.id ? { ...q, attempts, firstTriedAt } : q)),
  );
  return false;
}

const inflight = new Map<string, Promise<number>>();

/**
 * Sends the queued changes in order, one flush at a time per household (a second call joins the first).
 * After each send the queue is read again and only the entry that was sent is removed, so changes
 * made while sending are kept. A change the server clearly refuses (see isRefusal) is dropped so it
 * can't block the ones behind it. A change that keeps failing without a clear refusal is counted
 * (attempts, firstTriedAt) and dropped after MAX_ATTEMPTS failures or once it is more than MAX_AGE_MS
 * past its first try. Failures while the phone says it is offline are not counted. onDrop is told about
 * every dropped change, whatever the reason. Stops at the first network failure that is kept.
 * Resolves to how many are left.
 */
export function flushQueue(
  householdId: string,
  apply: (entry: QueuedPatch) => Promise<void>,
  networkError: (e: unknown) => boolean = isNetworkError,
  onDrop?: (entry: QueuedPatch, e: unknown) => void,
): Promise<number> {
  const running = inflight.get(householdId);
  if (running) return running;
  const run = (async () => {
    for (;;) {
      const [head] = loadQueue(householdId);
      if (!head) return 0;
      try {
        await apply(head);
      } catch (e) {
        if (networkError(e) && !recordFailure(householdId, head)) return loadQueue(householdId).length;
        onDrop?.(head, e);
      }
      saveQueue(
        householdId,
        loadQueue(householdId).filter((q) => q.id !== head.id),
      );
    }
  })().finally(() => inflight.delete(householdId));
  inflight.set(householdId, run);
  return run;
}

export function saveListCache(weekId: string, value: unknown): void {
  saveDraft(cacheKey(weekId), value);
}

export function loadListCache<T = unknown>(weekId: string): T | null {
  return loadDraft<T>(cacheKey(weekId));
}
