import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/db/types";

/** A Supabase client signed in as a test user (the same password the test login route uses). */
export async function clientFor(email: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const password = process.env.E2E_PASSWORD;
  if (!url || !key || !password) throw new Error("Supabase env and E2E_PASSWORD are needed for DB seeding");
  const sb = createClient<Database>(url, key, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return sb;
}
