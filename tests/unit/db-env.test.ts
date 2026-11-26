import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

import { createBrowserClient } from "@/lib/db/client";
import { createServerClient } from "@/lib/db/server";

const URL_VAR = "NEXT_PUBLIC_SUPABASE_URL";
const KEY_VAR = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

describe("db client env checks", () => {
  beforeEach(() => {
    vi.stubEnv(URL_VAR, "http://localhost:54321");
    vi.stubEnv(KEY_VAR, "sb_publishable_test");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("builds clients when both variables are set", async () => {
    expect(() => createBrowserClient()).not.toThrow();
    await expect(createServerClient()).resolves.toBeDefined();
  });

  for (const name of [URL_VAR, KEY_VAR]) {
    it(`browser client names ${name} when it is missing`, () => {
      vi.stubEnv(name, "");
      expect(() => createBrowserClient()).toThrow(name);
    });
    it(`server client names ${name} when it is missing`, async () => {
      vi.stubEnv(name, "");
      await expect(createServerClient()).rejects.toThrow(name);
    });
  }
});
