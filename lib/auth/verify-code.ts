import { safeNext } from "@/lib/auth/safe-next";

export const BAD_CODE_MESSAGE =
  "That code didn't work. Check the newest email, or send a new one.";

type OtpClient = {
  auth: {
    verifyOtp: (args: {
      email: string;
      token: string;
      type: "email";
    }) => Promise<{ error: unknown }>;
  };
};

/** Signs in with the 6-digit code from the email. Returns where to go next, or a friendly error. */
export async function verifyEmailCode(
  client: OtpClient,
  email: string,
  code: string,
  next: string,
): Promise<{ ok: true; next: string } | { ok: false; message: string }> {
  const token = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) return { ok: false, message: BAD_CODE_MESSAGE };
  try {
    const { error } = await client.auth.verifyOtp({ email: email.trim(), token, type: "email" });
    if (error) return { ok: false, message: BAD_CODE_MESSAGE };
  } catch {
    return { ok: false, message: BAD_CODE_MESSAGE };
  }
  return { ok: true, next: safeNext(next) };
}
