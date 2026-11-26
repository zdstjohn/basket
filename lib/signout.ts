import { LIST_KEY_PATTERN } from '@/lib/list/offline';

/** The service worker's cache of the list page (see public/sw.js). */
export const SW_CACHE = 'basket-offline-v1';

const OWN_KEYS = [LIST_KEY_PATTERN, /^add-meal:/];

interface Deps {
  storage?: Pick<Storage, 'key' | 'length' | 'removeItem'> | null;
  cacheStorage?: Pick<CacheStorage, 'delete'> | null;
  worker?: { postMessage(message: unknown): void } | null;
}

/**
 * Removes everything this device kept for the signed-in household: the saved list page, the cached
 * list, the offline queue and half-finished meals. Never throws; a missing browser feature is skipped.
 */
export async function clearDeviceData(deps?: Deps): Promise<void> {
  const d = deps ?? {
    storage: typeof localStorage === 'undefined' ? null : localStorage,
    cacheStorage: typeof caches === 'undefined' ? null : caches,
    worker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker.controller : null,
  };
  try {
    const s = d.storage;
    if (s) {
      const keys: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && OWN_KEYS.some((p) => p.test(k))) keys.push(k);
      }
      for (const k of keys) s.removeItem(k);
    }
  } catch {
    // Nothing more to do.
  }
  try {
    d.worker?.postMessage({ type: 'clear' });
  } catch {
    // The page deletes the cache itself below.
  }
  try {
    await d.cacheStorage?.delete(SW_CACHE);
  } catch {
    // Same.
  }
}

/** Clears this device, then signs out and goes to the login page. */
export async function signOutAndLeave(sb: { auth: { signOut(): Promise<unknown> } }): Promise<void> {
  await clearDeviceData();
  try {
    await sb.auth.signOut();
  } catch {
    // Signed out on this phone either way: the local session is removed by the client.
  }
  // A full page load on purpose: it drops every in-memory copy of the household's data.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/login");
}
