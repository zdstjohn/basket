import { beforeEach, describe, expect, it, vi } from "vitest";

const exchange = vi.fn();
vi.mock("@/lib/db/server", () => ({
  createServerClient: async () => ({ auth: { exchangeCodeForSession: exchange } }),
}));

import { GET } from "@/app/auth/callback/route";

const call = async (qs: string) => {
  const res = await GET(new Request(`https://basket.test/auth/callback${qs}`));
  return res.headers.get("location");
};

describe("auth callback", () => {
  beforeEach(() => exchange.mockReset());

  it("keeps the invite when there is no code", async () => {
    expect(await call("?next=/invite/abc")).toBe("https://basket.test/login?error=link&next=%2Finvite%2Fabc");
    expect(exchange).not.toHaveBeenCalled();
  });
  it("keeps the invite when the exchange fails", async () => {
    exchange.mockResolvedValue({ error: { message: "bad" } });
    expect(await call("?code=x&next=/invite/abc")).toBe("https://basket.test/login?error=link&next=%2Finvite%2Fabc");
  });
  it("sends an unsafe next to /week", async () => {
    expect(await call("?next=//evil.test")).toBe("https://basket.test/login?error=link&next=%2Fweek");
  });
  it("goes to next on a good code", async () => {
    exchange.mockResolvedValue({ error: null });
    expect(await call("?code=x&next=/invite/abc")).toBe("https://basket.test/invite/abc");
  });
});
