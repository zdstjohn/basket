import { loadDraft, saveDraft } from '@/lib/drafts';

// The last list for each week, and the check-offs made while offline, live in localStorage.
// Every call goes through drafts.ts, which never throws (private mode, full disk).

export interface ItemPatch {
  have_it?: boolean;
  checked?: boolean;
  outside_budget?: boolean;
}

export interface QueuedPatch {
  weekId: string;
  itemKey: string;
  patch: ItemPatch;
}

const QUEUE_KEY = 'list-queue';
const cacheKey = (weekId: string): string => `list:${weekId}`;

/** Adds a change to the queue. A newer change to the same item wins field by field. */
export function mergePatch(queue: QueuedPatch[], entry: QueuedPatch): QueuedPatch[] {
  const at = queue.findIndex((q) => q.weekId === entry.weekId && q.itemKey === entry.itemKey);
  if (at === -1) return [...queue, entry];
  const next = [...queue];
  next[at] = { ...entry, patch: { ...queue[at].patch, ...entry.patch } };
  return next;
}

export function loadQueue(): QueuedPatch[] {
  const q = loadDraft<QueuedPatch[]>(QUEUE_KEY);
  return Array.isArray(q) ? q : [];
}

export function saveQueue(queue: QueuedPatch[]): void {
  saveDraft(QUEUE_KEY, queue);
}

export function enqueuePatch(entry: QueuedPatch): void {
  saveQueue(mergePatch(loadQueue(), entry));
}

/** Sends each queued change in order; whatever could not be sent (and everything after it) stays. */
export async function flushQueue(
  queue: QueuedPatch[],
  apply: (entry: QueuedPatch) => Promise<void>,
): Promise<QueuedPatch[]> {
  for (let i = 0; i < queue.length; i++) {
    try {
      await apply(queue[i]);
    } catch {
      return queue.slice(i);
    }
  }
  return [];
}

export function saveListCache(weekId: string, value: unknown): void {
  saveDraft(cacheKey(weekId), value);
}

export function loadListCache<T = unknown>(weekId: string): T | null {
  return loadDraft<T>(cacheKey(weekId));
}
