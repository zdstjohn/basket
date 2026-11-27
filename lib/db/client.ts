import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";
import { requireSupabaseEnv } from "./env";
import { timeoutFetch } from "./timeout-fetch";

// A data request that has not answered in 12 s fails like a lost connection. Storage, auth and realtime are left alone.
const REST_TIMEOUT_MS = 12_000;

export function createBrowserClient() {
  const { url, key } = requireSupabaseEnv(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  return createSupabaseBrowserClient<Database>(url, key, {
    global: { fetch: timeoutFetch(fetch, REST_TIMEOUT_MS, (u) => u.includes("/rest/v1/")) },
  });
}
