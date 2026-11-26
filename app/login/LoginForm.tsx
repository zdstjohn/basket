"use client";

import { useState, type FormEvent } from "react";
import { createBrowserClient } from "@/lib/db/client";
import { focusRing, pillButton, primaryButton, textInput } from "@/lib/ui";

type Status = "idle" | "sending" | "sent";

export function LoginForm({
  next,
  linkFailed,
}: {
  next: string;
  linkFailed: boolean;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(
    linkFailed ? "That sign-in link didn't work. Ask for a new one." : null,
  );

  const redirectTo = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const { error } = await createBrowserClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo() },
    });
    if (error) {
      setStatus("idle");
      setError("We couldn't send that link. Check the address and try again.");
      return;
    }
    setStatus("sent");
  }

  async function withGoogle() {
    setError(null);
    const { error } = await createBrowserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (error) setError("Google sign-in didn't start. Try the email link instead.");
  }

  if (status === "sent") {
    return (
      <section
        aria-live="polite"
        className="mt-8 rounded-2xl border border-line bg-white p-5"
      >
        <h2 className="text-xl font-bold text-ink">Check your email</h2>
        <p className="mt-2 text-[15px] text-muted">
          We sent a sign-in link to <strong className="text-ink">{email.trim()}</strong>.
          Open it on this phone to come straight in.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className={`mt-4 ${pillButton}`}
        >
          Use a different email
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={sendLink} className="mt-8 flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={textInput}
        />
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-sale-tint px-3 py-2 text-[14px] text-sale">
          {error}
        </p>
      )}
      <button type="submit" disabled={status === "sending"} className={primaryButton}>
        {status === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
      {process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1" && (
        <button
          type="button"
          onClick={withGoogle}
          className={`h-12 w-full rounded-full border border-[#D5DBD5] bg-white text-[15px] font-semibold text-ink ${focusRing}`}
        >
          Continue with Google
        </button>
      )}
    </form>
  );
}
