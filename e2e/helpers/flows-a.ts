import { expect, type Locator, type Page } from "@playwright/test";
import { dayName } from "../../lib/week/format";
import { weekStartFor, type Day } from "../../lib/domain/weeks";
import { getMyHousehold } from "../../lib/db/queries/household";
import { getOrCreateWeek, setWeekMeal } from "../../lib/db/queries/weeks";
import { clientFor } from "./db";

// Stream A owns the week, add-a-meal and favorites screens. Specs of other streams drive those screens only through these helpers.

/** Opens the "Where to look" sheet from "Looking on: …" and picks a source; choosing closes the sheet. */
export async function chooseSource(page: Page, source: "Big sites" | "Spoonacular"): Promise<void> {
  await page.getByRole("button", { name: /Looking on/ }).click();
  const sheet = page.getByRole("dialog", { name: "Where to look" });
  await sheet.getByRole("radio", { name: source }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: `Looking on: ${source}` })).toBeVisible();
}

/** Plans a dinner: search, pick the card with this name, add it to the day. Lands back on /week. */
export async function addFromSearch(
  page: Page,
  { day, query, pick, source }: { day: Day; query: string; pick: string; source?: "Big sites" | "Spoonacular" },
): Promise<void> {
  await page.goto(`/week/add?day=${day}&slot=dinner`);
  if (source) await chooseSource(page, source);
  await page.getByLabel(/What.s for dinner\?/).fill(query);
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: pick }).click();
  const add = page.getByRole("button", { name: `Add to ${dayName(day)}` });
  await expect(add).toBeVisible();
  await add.click();
  await expect(page).toHaveURL(/\/week$/);
}

/** The budget as it reads on the page you are on (the week screen): the total in cents and the whole section's words. */
export async function readWeekBudget(page: Page): Promise<{ totalCents: number; text: string }> {
  const budget = page.getByRole("region", { name: "Budget" });
  await expect(budget).toBeVisible();
  const total = (await budget.getByTestId("week-total").textContent()) ?? "";
  // The rolling digits are aria-hidden copies of the total; the words are what a reader hears.
  const text = await budget.evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
  });
  return { totalCents: Math.round(Number(total.replace(/[$,]/g, "")) * 100), text };
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

/** Opens Favorites, taps a filter (such as "Under $15") and returns the rows it keeps; assert with toHaveCount so it retries. */
export async function favoritesKept(page: Page, filter: string): Promise<Locator> {
  await page.goto("/favorites");
  await page.getByRole("button", { name: filter }).click();
  return page.getByTestId("favorite-row");
}

/**
 * Puts a dinner on a day of this week straight in the database (no search), with a photo link, its known width
 * (null while unknown) and a credit. Reload the week to see it.
 */
export async function seedDinnerOnDay(
  email: string,
  day: Day,
  meal: { name: string; photoUrl?: string | null; width?: number | null; credit?: string | null },
) {
  const sb = await clientFor(email);
  const household = (await getMyHousehold(sb))!;
  const { data, error } = await sb
    .from("meals")
    .insert({
      household_id: household.id,
      name: meal.name,
      base_servings: 4,
      photo_url: meal.photoUrl ?? null,
      photo_width: meal.width ?? null,
      photo_credit: meal.credit ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const week = await getOrCreateWeek(sb, household.id, weekStartFor(new Date(), household.week_start as Day, household.time_zone));
  await setWeekMeal(sb, week.id, day, "dinner", data.id);
  return { sb, household, mealId: data.id };
}
