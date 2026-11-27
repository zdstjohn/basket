import { expect, type Page } from "@playwright/test";
import { dayName } from "../../lib/week/format";
import type { Day } from "../../lib/domain/weeks";

// Stream A owns the week, add-a-meal and favorites screens. Specs of other streams drive those screens only through these helpers.

/** Plans a dinner: search, pick the card with this name, add it to the day. Lands back on /week. */
export async function addFromSearch(
  page: Page,
  { day, query, pick, source }: { day: Day; query: string; pick: string; source?: "Big sites" | "Spoonacular" },
): Promise<void> {
  await page.goto(`/week/add?day=${day}&slot=dinner`);
  if (source) await page.getByRole("radio", { name: source }).click();
  await page.getByLabel(/What.s for dinner\?/).fill(query);
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: pick }).click();
  const add = page.getByRole("button", { name: `Add to ${dayName(day)}` });
  await expect(add).toBeVisible();
  await add.click();
  await expect(page).toHaveURL(/\/week$/);
}

/** The budget as it reads on the page you are on (the week screen): the meter's value in cents and the whole section's words. */
export async function readWeekBudget(page: Page): Promise<{ totalCents: number; text: string }> {
  const budget = page.getByRole("region", { name: "Budget" });
  await expect(budget).toBeVisible();
  const meter = page.getByRole("meter", { name: "Weekly budget" });
  const now = await meter.getAttribute("aria-valuenow");
  return { totalCents: Number(now), text: await budget.innerText() };
}

/** Opens the week from the tab bar and reads its budget. */
export async function weekBudget(page: Page): Promise<{ totalCents: number; text: string }> {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "This week" }).click();
  await expect(page).toHaveURL(/\/week$/);
  return readWeekBudget(page);
}

/** Puts a favorite on a day from the Favorites tab of the add-a-meal screen. Lands back on /week. */
export async function addFavoriteToDay(page: Page, { day, name }: { day: Day; name: string }): Promise<void> {
  await page.goto(`/week/add?day=${day}&slot=dinner`);
  await page.getByRole("tab", { name: "Favorites" }).click();
  await page.getByRole("button", { name: `Add ${name} to ${dayName(day)}` }).click();
  await expect(page).toHaveURL(/\/week$/);
}

/** Opens Favorites, taps a filter (such as "Under $15") and returns how many favorites it keeps. */
export async function favoritesKept(page: Page, filter: string): Promise<number> {
  await page.goto("/favorites");
  await page.getByRole("button", { name: filter }).click();
  return page.getByTestId("favorite-row").count();
}
