import { expect, test, type Page } from "@playwright/test";
import { uniqueEmail } from "./helpers/auth";

const MAILPIT = "http://127.0.0.1:54324";

/** Waits for the sign-in email in the local mail inbox and returns its 6-digit code. */
async function codeFromInbox(page: Page, email: string): Promise<string> {
  let code = "";
  await expect
    .poll(
      async () => {
        const list = await page.request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${email}` } });
        const { messages } = (await list.json()) as { messages?: { ID: string }[] };
        if (!messages?.length) return "";
        const msg = await page.request.get(`${MAILPIT}/api/v1/message/${messages[0].ID}`);
        const text = ((await msg.json()) as { Text?: string }).Text ?? "";
        code = /\b(\d{6})\b/.exec(text)?.[1] ?? "";
        return code;
      },
      { timeout: 15_000 },
    )
    .toMatch(/^\d{6}$/);
  return code;
}

async function askForCode(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("We sent a link and a 6-digit code to")).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
}

test("signing in with the 6-digit code from the email", async ({ page }) => {
  const email = uniqueEmail("code");
  await page.goto("/login");
  await askForCode(page, email);

  const field = page.getByLabel("6-digit code");
  await expect(field).toHaveAttribute("autocomplete", "one-time-code");
  await expect(field).toHaveAttribute("inputmode", "numeric");
  await field.fill("000000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That code didn’t work. Check the newest email, or send a new one.")).toBeVisible();

  await field.fill(await codeFromInbox(page, email));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/onboarding$/); // a brand-new person has no household yet
});

test("a signed-out invite visitor signs in with a code and returns to the invite", async ({ page }) => {
  const email = uniqueEmail("invite-code");
  await page.goto("/invite/abc");
  await expect(page).toHaveURL(/\/login\?next=%2Finvite%2Fabc$/);
  await askForCode(page, email);
  await page.getByLabel("6-digit code").fill(await codeFromInbox(page, email));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/invite\/abc$/);
});
