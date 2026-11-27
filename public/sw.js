// Keeps the shopping list page and its scripts so it opens with no signal.
// The list's data comes from localStorage (see lib/list/offline.ts); this file only serves the page itself.
const CACHE = "basket-offline-v1";
const PAGE = "/list";
const MAX_STATIC = 150;
importScripts("/sw-trim.js", "/sw-nav.js");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

const SLOW_MS = 4000; // the list waits this long for the network before opening from the saved page

const save = (cache, path) => self.saveOnce(cache, path, (p) => fetch(p, { credentials: "same-origin" }));

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data && data.type === "clear") {
    event.waitUntil(caches.delete(CACHE));
    return;
  }
  if (!data || data.type !== "precache") return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const paths = [data.page, ...(data.assets || [])].filter((p) => typeof p === "string" && p.startsWith("/"));
      await Promise.all(paths.map((p) => save(cache, p).catch(() => {})));
      await trimStatic(cache, MAX_STATIC).catch(() => {});
      if (event.source) event.source.postMessage({ type: "precached" });
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    // File names carry a hash, so a saved copy never goes stale.
    event.respondWith(
      caches.match(url.pathname).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              event.waitUntil(
                caches.open(CACHE).then(async (c) => {
                  await c.put(url.pathname, copy);
                  await trimStatic(c, MAX_STATIC);
                }),
              );
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate" && url.pathname === PAGE) {
    const network = fetch(req).then((res) => {
      if (res.ok && !res.redirected) {
        const copy = res.clone();
        // Keep the worker alive until the copy is saved, even if the page was already served from the saved one.
        event.waitUntil(caches.open(CACHE).then((c) => c.put(PAGE, copy)).catch(() => {}));
      }
      return res;
    });
    // Only the list goes on a timer: on weak signal it opens from the saved page after SLOW_MS instead of waiting.
    event.respondWith(
      self
        .raceSaved(network, () => caches.match(PAGE), SLOW_MS, (ms) => new Promise((r) => setTimeout(r, ms)))
        .catch(() => Response.error()),
    );
    // The page keeps loading after the timer; let it finish so the saved copy is refreshed.
    event.waitUntil(network.catch(() => {}));
    return;
  }

  // Any other page: only step in when the network is down (a cold start from the Home Screen at /week).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(
        async () =>
          (await self.offlineStart((p) => caches.match(p), PAGE, (to, status) => Response.redirect(to, status))) ||
          Response.error(),
      ),
    );
  }
});
