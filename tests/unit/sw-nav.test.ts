import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const { offlineStart } = createRequire(import.meta.url)("../../public/sw-nav.js") as {
  offlineStart: (
    match: (p: string) => Promise<unknown>,
    page: string,
    redirect: (to: string, status: number) => unknown,
  ) => Promise<unknown>;
};

const redirect = (to: string, status: number) => ({ to, status });

describe("offlineStart", () => {
  it("redirects to the saved list", async () => {
    expect(await offlineStart(async () => ({}), "/list", redirect)).toEqual({ to: "/list", status: 302 });
  });
  it("does nothing when the list is not saved", async () => {
    expect(await offlineStart(async () => undefined, "/list", redirect)).toBeNull();
  });
});
