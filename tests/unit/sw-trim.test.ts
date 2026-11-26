import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const { trimStatic } = createRequire(import.meta.url)("../../public/sw-trim.js") as {
  trimStatic: (cache: FakeCache, max: number) => Promise<void>;
};

class FakeCache {
  entries: string[];
  constructor(urls: string[]) {
    this.entries = urls;
  }
  async keys() {
    return this.entries.map((url) => ({ url }));
  }
  async delete(req: { url: string }) {
    this.entries = this.entries.filter((u) => u !== req.url);
    return true;
  }
}

const o = "https://basket.test";

describe("trimStatic", () => {
  it("drops the oldest static files beyond the limit and never the saved page", async () => {
    const cache = new FakeCache([`${o}/_next/static/a.js`, `${o}/list`, `${o}/_next/static/b.js`, `${o}/_next/static/c.js`, `${o}/_next/static/d.js`]);
    await trimStatic(cache, 2);
    expect(cache.entries).toEqual([`${o}/list`, `${o}/_next/static/c.js`, `${o}/_next/static/d.js`]);
  });
  it("does nothing under the limit", async () => {
    const cache = new FakeCache([`${o}/list`, `${o}/_next/static/a.js`]);
    await trimStatic(cache, 5);
    expect(cache.entries).toHaveLength(2);
  });
});
