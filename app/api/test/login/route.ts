import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/server";

// Test-only sign-in for e2e runs. It does not exist unless E2E=1, and never on Vercel.
// It also refuses to run unless the database is local, so a test run can never create users elsewhere.
const localDatabase = (): boolean => {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
};

const enabled = () =>
  process.env.E2E === "1" && process.env.VERCEL !== "1" && localDatabase();

const notFound = () => new NextResponse(null, { status: 404 });

export async function POST(request: Request) {
  if (!enabled()) return notFound();

  const password = process.env.E2E_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: "E2E_PASSWORD is not set" }, { status: 500 });
  }
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const sb = await createServerClient();
  let { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    // First visit for this email: create it (confirmations are off locally), then sign in.
    const signUp = await sb.auth.signUp({ email, password });
    if (signUp.error) {
      return NextResponse.json({ error: signUp.error.message }, { status: 500 });
    }
    if (!signUp.data.session) {
      ({ error } = await sb.auth.signInWithPassword({ email, password }));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return new NextResponse(null, { status: 204 });
}

export const GET = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
