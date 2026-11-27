import type { FullConfig } from "@playwright/test";

const LOCAL = new Set(["127.0.0.1", "localhost"]);

// e2e creates users and households, so it may only ever run against the local Supabase. Two checks:
// this process's env, and the server under test (its build may have been made from other settings).
export default async function globalSetup(config: FullConfig): Promise<void> {
  let host = "";
  try {
    host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    // handled below
  }
  if (!LOCAL.has(host)) {
    throw new Error(
      "e2e refused: NEXT_PUBLIC_SUPABASE_URL must be set to the local Supabase (127.0.0.1 or localhost). Run scripts/e2e-local.sh.",
    );
  }
  // The test login route answers 404 unless the server is E2E-enabled AND built for a local database,
  // and 400 to an empty body otherwise. So a 400 proves the server under test is the local one.
  const base = config.projects[0]?.use.baseURL ?? "http://localhost:3000";
  let status = 0;
  try {
    const res = await fetch(`${base}/api/test/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    status = res.status;
  } catch {
    // reported below
  }
  if (status !== 400) {
    throw new Error(
      `e2e refused: the server at ${base} is not an E2E build for the local Supabase (login route answered ${status || "nothing"}). Run scripts/e2e-local.sh.`,
    );
  }
}
