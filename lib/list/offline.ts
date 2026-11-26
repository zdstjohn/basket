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
}

/** Keys this module owns in localStorage; signing out removes them (see lib/signout.ts). */
export const LIST_KEY_PATTERN = /^(list:|list-week$|list-queue)/;

const queueKey = (householdId: string): string => `list-queue:${householdId}`;
const cacheKey = (weekId: string): string => `list:${weekId}`;

let counter = 0;
export const newEntryId = (): string => `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const NETWORK_MESSAGE = /failed to fetch|networkerror|load failed|network request failed|fetch failed/i;

/**
 * True when the network is down: the phone says so, or the error's message is a fetch failure
 * (setItemState throws `new Error(message)`, and a plain `{ message }` object counts too).
 * Everything else, including a TypeError from a bug, is a refusal.
 */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg =
    e instanceof Error ? e.message : typeof e === 'object' && e !== null && typeof (e as { message?: unknown }).message === 'string'
      ? (e as { message: string }).message
      : null;
  return msg !== null && NETWORK_MESSAGE.test(msg);
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

const inflight = new Map<string, Promise<number>>();

/**
 * Sends the queued changes in order, one flush at a time per household (a second call joins the first).
 * After each send the queue is read again and only the entry that was sent is removed, so changes
 * made while sending are kept. A change the server refuses (not a network failure) is dropped so it
 * can't block the ones behind it. Stops at the first network failure. Resolves to how many are left.
 */
export function flushQueue(
  householdId: string,
  apply: (entry: QueuedPatch) => Promise<void>,
  networkError: (e: unknown) => boolean = isNetworkError,
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
        if (networkError(e)) return loadQueue(householdId).length;
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
