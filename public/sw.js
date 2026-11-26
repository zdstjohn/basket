// Keeps the shopping list page and its scripts so it opens with no signal.
// The list's data comes from localStorage (see lib/list/offline.ts); this file only serves the page itself.
const CACHE = "basket-offline-v1";
const PAGE = "/list";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

async function save(cache, path) {
  const res = await fetch(path, { credentials: "same-origin" });
  // A redirect means signed out: never keep a login page as the list.
  if (res.ok && !res.redirected) await cache.put(path, res);
}

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
              caches.open(CACHE).then((c) => c.put(url.pathname, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate" && url.pathname === PAGE) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(PAGE, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(PAGE)) || Response.error()),
    );
  }
});
