// Values must be read as literal `process.env.NEXT_PUBLIC_*` at the call site
// so Next can inline them into the browser bundle; this only validates them.
export function requireSupabaseEnv(
  url: string | undefined,
  key: string | undefined,
): { url: string; key: string } {
  if (!url) {
    throw new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!key) {
    throw new Error(
      "Missing environment variable NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }
  return { url, key };
}
