import { expect, type Page } from "@playwright/test";

/** Picks the Tacoma Fred Meyer from the fixtures (KROGER_FAKE=1) in Household. */
export async function chooseStore(page: Page): Promise<void> {
  await page.goto("/household");
  const stores = page.getByRole("region", { name: "Stores and settings" });
  await stores.getByRole("button", { name: "Choose store" }).click();
  await stores.getByLabel("ZIP code").fill("98402");
  await stores.getByRole("button", { name: "Search" }).click();
  await stores.getByRole("button", { name: /Fred Meyer - Tacoma-Stevens/ }).click();
  await expect(stores.getByText("Your Fred Meyer")).toBeVisible();
  await expect(stores.getByRole("button", { name: "Choose store" })).toHaveCount(0);
}

/** Puts chicken tacos on Thursday's dinner. */
export async function planTacos(page: Page): Promise<void> {
  await page.goto("/week/add?day=thu&slot=dinner");
  await page.getByLabel("What's for dinner?").fill("tacos");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Chicken tacos · Allrecipes" }).click();
  await page.getByRole("button", { name: "Add to Thursday" }).click();
  await expect(page).toHaveURL(/\/week$/);
}

/** Opens the review screen from the list's own link, once the products are found. */
export async function openReview(page: Page): Promise<void> {
  await page.goto("/list");
  await page.getByRole("link", { name: "Review and send to Fred Meyer" }).click();
  await expect(page.getByRole("heading", { name: "Review your Fred Meyer cart" })).toBeVisible();
}

export const dollarsToCents = (t: string | null): number => {
  const m = /\$([\d,]+(?:\.\d{2})?)/.exec(t ?? "");
  return m ? Math.round(Number(m[1].replace(/,/g, "")) * 100) : 0;
};
