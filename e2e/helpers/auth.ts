import { expect, type Page } from "@playwright/test";

/** A fresh, unique email for one test. */
export function uniqueEmail(label: string): string {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `e2e-${label}-${stamp}@example.test`;
}

/**
 * Signs the page's browser context in through the test-only login route.
 * The route exists only when E2E=1 and the app is not on Vercel.
 */
export async function signInAs(page: Page, email: string): Promise<void> {
  const res = await page.request.post("/api/test/login", { data: { email } });
  expect(res.status(), "POST /api/test/login").toBe(204);
}
