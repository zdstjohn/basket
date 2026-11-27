// When a page opens with no signal and the shopping list is saved, send the person to the list.
// `match` looks a path up in the cache; `redirect` builds the redirect response (Response.redirect in the worker).
async function offlineStart(match, page, redirect) {
  const saved = await match(page);
  return saved ? redirect(page, 302) : null;
}

// Serves the network's answer, unless it is slower than `ms` and a saved copy exists: then the saved copy.
// `network` is the page request (already saving its own copy); `saved` looks the saved copy up; `sleep(ms)` is the timer.
// A failed network also falls back to the saved copy. With nothing saved, it keeps waiting for the network.
function raceSaved(network, saved, ms, sleep) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, v) => {
      if (done) return;
      done = true;
      fn(v);
    };
    network.then(
      (res) => finish(resolve, res),
      (err) =>
        saved().then(
          (hit) => (hit ? finish(resolve, hit) : finish(reject, err)),
          () => finish(reject, err),
        ),
    );
    sleep(ms).then(async () => {
      if (done) return;
      const hit = await saved().catch(() => undefined);
      if (hit) finish(resolve, hit);
    });
  });
}

// Keeps one path in the cache. A path already there is left alone (no second request, and the page the
// navigation just stored is not rendered again). A redirect means signed out: never keep a login page.
async function saveOnce(cache, path, fetchPath) {
  if (await cache.match(path)) return;
  const res = await fetchPath(path);
  if (res.ok && !res.redirected) await cache.put(path, res);
}

const SAVED_AT = "x-basket-saved-at";
const PAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// The same response with the time it was saved, so a later visit can tell how old the saved page is.
async function stampSaved(res, now) {
  const headers = new Headers(res.headers);
  headers.set(SAVED_AT, String(now));
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// What a precache message needs done: the assets not yet saved, and whether the page itself is to be saved again
// (it is missing or unstamped, older than a day, or the message names an asset not saved yet, which means a new build).
async function precachePlan(match, page, assets, now) {
  const missing = [];
  for (const a of assets) if (!(await match(a))) missing.push(a);
  const hit = await match(page);
  const at = hit ? Number(hit.headers.get(SAVED_AT)) : NaN;
  const stale = !hit || !Number.isFinite(at) || now - at > PAGE_MAX_AGE_MS;
  return { page: stale || missing.length > 0, assets: missing };
}
if (typeof self !== "undefined") Object.assign(self, { offlineStart, raceSaved, saveOnce, stampSaved, precachePlan });
if (typeof module !== "undefined") module.exports = { offlineStart, raceSaved, saveOnce, stampSaved, precachePlan };
