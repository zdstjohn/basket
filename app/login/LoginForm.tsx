"use client";

import { useState, type FormEvent } from "react";
import { createBrowserClient } from "@/lib/db/client";
import { verifyEmailCode } from "@/lib/auth/verify-code";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { ErrorBanner } from "@/components/ui/states";

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
    linkFailed ? "That link didn’t open here. Ask for a new email, then type its 6-digit code." : null,
  );

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

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
      setError("We couldn’t send that link. Check the address and try again.");
      return;
    }
    setStatus("sent");
  }

  async function signInWithCode(e: FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setError(null);
    const r = await verifyEmailCode(createBrowserClient(), email, code, next);
    if (r.ok) {
      window.location.assign(r.next);
      return;
    }
    setVerifying(false);
    setError(r.message);
  }

  async function withGoogle() {
    setError(null);
    const { error } = await createBrowserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (error) setError("Google sign-in didn’t start. Try the email link instead.");
  }

  if (status === "sent") {
    return (
      <section aria-live="polite" className="bk-gutter mt-6 flex flex-col gap-3">
        <h2 className="text-heading text-ink">Check your email</h2>
        <p className="text-body text-ink">
          We sent a link and a 6-digit code to <strong className="font-semibold">{email.trim()}</strong>.
          Tap the link, or type the code here.
        </p>
        <form onSubmit={signInWithCode} className="flex flex-col gap-3">
          <TextField
            label="6-digit code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {error && <ErrorBanner message={error} />}
          <Button type="submit" variant="main" busy={verifying} busyLabel="Signing in…">
            Sign in
          </Button>
        </form>
        <Button
          variant="ghost"
          className="self-start"
          onClick={() => {
            setStatus("idle");
            setCode("");
            setError(null);
          }}
        >
          Use a different email
        </Button>
      </section>
    );
  }

  return (
    <form onSubmit={sendLink} className="bk-gutter mt-6 flex flex-col gap-3">
      <TextField
        label="Email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {error && <ErrorBanner message={error} />}
      <Button type="submit" variant="main" busy={status === "sending"} busyLabel="Sending…">
        Email me a sign-in link
      </Button>
      {process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1" && (
        <Button variant="ghost" className="w-full" onClick={withGoogle}>
          Continue with Google
        </Button>
      )}
    </form>
  );
}
