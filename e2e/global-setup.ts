// e2e creates users and households, so it may only ever run against the local Supabase.
export default function globalSetup(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let host = "";
  try {
    host = new URL(url ?? "").hostname;
  } catch {
    // handled below
  }
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      "e2e refused: NEXT_PUBLIC_SUPABASE_URL must be set to the local Supabase (127.0.0.1 or localhost). Run scripts/e2e-local.sh.",
    );
  }
}
