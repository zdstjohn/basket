// When a page opens with no signal and the shopping list is saved, send the person to the list.
// `match` looks a path up in the cache; `redirect` builds the redirect response (Response.redirect in the worker).
async function offlineStart(match, page, redirect) {
  const saved = await match(page);
  return saved ? redirect(page, 302) : null;
}
if (typeof self !== "undefined") self.offlineStart = offlineStart;
if (typeof module !== "undefined") module.exports = { offlineStart };
