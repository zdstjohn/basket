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

interface LeaveDeps {
  navigate?: (url: string) => void;
  doc?: { cookie: string };
  storage?: Pick<Storage, 'key' | 'length' | 'removeItem'> | null;
}

const AUTH_KEY = /^sb-/;

/**
 * Removes the Supabase session from this browser by hand (auth cookies and any localStorage copy).
 * supabase-js removes it itself on a local sign-out; this is the backstop for when that call fails.
 */
export function clearAuthStorage(deps?: Pick<LeaveDeps, 'doc' | 'storage'>): void {
  try {
    const doc = deps?.doc ?? (typeof document === 'undefined' ? null : document);
    if (doc) {
      for (const part of doc.cookie.split(';')) {
        const name = part.split('=')[0].trim();
        if (AUTH_KEY.test(name)) doc.cookie = `${name}=; Max-Age=0; Path=/`;
      }
    }
  } catch {
    // Nothing more to do.
  }
  try {
    const s = deps?.storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
    if (s) {
      const keys: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && AUTH_KEY.test(k)) keys.push(k);
      }
      for (const k of keys) s.removeItem(k);
    }
  } catch {
    // Same.
  }
}

/**
 * Clears this device, signs out of this phone only (scope local: the other phone stays signed in),
 * makes sure the session is gone even if that call fails or throws, then goes to the login page.
 */
export async function signOutAndLeave(
  sb: { auth: { signOut(opts: { scope: 'local' }): Promise<{ error?: unknown } | unknown> } },
  deps: LeaveDeps = {},
): Promise<void> {
  await clearDeviceData();
  try {
    await sb.auth.signOut({ scope: 'local' }); // a returned { error } is fine: the backstop below runs regardless
  } catch {
    // Same.
  }
  clearAuthStorage(deps);
  const go =
    deps.navigate ??
    ((url: string) => {
      // A full page load on purpose: it drops every in-memory copy of the household's data.
      window.location.assign(url);
    });
  go('/login');
}
