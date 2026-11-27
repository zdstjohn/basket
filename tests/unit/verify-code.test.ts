import { describe, expect, it, vi } from "vitest";
import { BAD_CODE_MESSAGE, verifyEmailCode } from "@/lib/auth/verify-code";

const client = (error: unknown = null) => ({ auth: { verifyOtp: vi.fn(async () => ({ error })) } });

describe("verifyEmailCode", () => {
  it("signs in and goes to next", async () => {
    const c = client();
    const r = await verifyEmailCode(c, " a@b.test ", "123 456", "/invite/tok");
    expect(c.auth.verifyOtp).toHaveBeenCalledWith({ email: "a@b.test", token: "123456", type: "email" });
    expect(r).toEqual({ ok: true, next: "/invite/tok" });
  });
  it("keeps the open-redirect guard", async () => {
    const r = await verifyEmailCode(client(), "a@b.test", "123456", "//evil.test");
    expect(r).toEqual({ ok: true, next: "/week" });
  });
  it("shows a friendly message for a wrong or expired code", async () => {
    const r = await verifyEmailCode(client({ message: "Token has expired" }), "a@b.test", "123456", "/week");
    expect(r).toEqual({ ok: false, message: BAD_CODE_MESSAGE });
  });
  it("rejects a malformed code without calling Supabase", async () => {
    const c = client();
    const r = await verifyEmailCode(c, "a@b.test", "12ab", "/week");
    expect(r.ok).toBe(false);
    expect(c.auth.verifyOtp).not.toHaveBeenCalled();
  });
  it("treats a thrown error as a bad code", async () => {
    const c = { auth: { verifyOtp: vi.fn(async () => { throw new Error("net"); }) } };
    expect(await verifyEmailCode(c, "a@b.test", "123456", "/week")).toEqual({ ok: false, message: BAD_CODE_MESSAGE });
  });
});
