// Keeps the offline cache small: only the newest `max` saved script/style files stay; the saved page (/list) is never touched.
// A Cache lists its entries oldest first, so the oldest files (from earlier deploys) go first.
async function trimStatic(cache, max) {
  const statics = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith("/_next/static/"));
  await Promise.all(statics.slice(0, Math.max(0, statics.length - max)).map((r) => cache.delete(r)));
}
if (typeof self !== "undefined") self.trimStatic = trimStatic;
if (typeof module !== "undefined") module.exports = { trimStatic };
