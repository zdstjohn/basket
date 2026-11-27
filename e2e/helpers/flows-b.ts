import { expect, type Locator, type Page } from "@playwright/test";

// Stream B owns the list, review, household and onboarding screens. Specs of other streams drive those screens only through these helpers.

/** Finds a Fred Meyer by ZIP code and chooses it, on the household screen. */
export async function chooseStore(page: Page, zip = "98402"): Promise<void> {
  await page.goto("/household");
  const stores = page.getByRole("region", { name: "Stores and settings" });
  await stores.getByRole("button", { name: "Choose store" }).click();
  await stores.getByLabel("ZIP code").fill(zip);
  await stores.getByRole("button", { name: "Search" }).click();
  await stores.getByRole("button", { name: /Fred Meyer - Tacoma-Stevens/ }).click();
  await expect(stores.getByText("Your Fred Meyer")).toBeVisible();
  await expect(stores.getByText("Fred Meyer - Tacoma-Stevens")).toBeVisible();
  await expect(stores.getByRole("button", { name: "Choose store" })).toHaveCount(0);
}

/** Sets the weekly budget target and/or the wiggle room in whole dollars, and waits until each is saved. Each must differ from what is saved now. */
export async function setBudget(page: Page, { target, wiggle }: { target?: number; wiggle?: number }): Promise<void> {
  await page.goto("/household");
  const saved = () => page.waitForResponse((r) => r.url().includes("/rest/v1/households") && r.request().method() === "PATCH");
  for (const [label, value] of [
    ["Target", target],
    ["Wiggle room", wiggle],
  ] as const) {
    if (value === undefined) continue;
    const field = page.getByLabel(label);
    // Nothing is saved when the value is unchanged, so there would be no response to wait for.
    if ((await field.inputValue()) === String(value)) continue;
    await field.fill(String(value));
    await Promise.all([saved(), field.press("Tab")]);
  }
}

/** Opens the shopping list from the tab bar. */
export async function openList(page: Page): Promise<void> {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "List" }).click();
  await expect(page).toHaveURL(/\/list$/);
  await expect(page.getByRole("heading", { name: "Shopping list" })).toBeVisible();
}

/** The list's total line. */
export const listTotal = (page: Page): Locator => page.getByTestId("list-total");

/** Opens the sheet of one list row and returns it. */
export async function openItemSheet(page: Page, name: string): Promise<Locator> {
  const row = page.getByTestId("list-row").filter({ hasText: name });
  await row.getByRole("button", { name: new RegExp(name) }).click();
  const sheet = page.getByRole("dialog", { name });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** The owner makes an invite and gets its link. */
export async function inviteLink(owner: Page): Promise<string> {
  await owner.goto("/household");
  await owner.getByRole("button", { name: "Invite" }).click();
  const link = owner.getByLabel("Invite link");
  await expect(link).toHaveValue(/\/invite\/[0-9a-f]{64}$/);
  return link.inputValue();
}
