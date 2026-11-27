import { expect, test, type Page } from "@playwright/test";
import { createHousehold } from "./helpers/household";
import { routeFoodImages } from "./helpers/fixtures";

// Requests from a worker-controlled page can skip page.route on WebKit; keep parity with the other add-meal specs.
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await routeFoodImages(page);
});

async function searchFor(page: Page, query: string) {
  await page.getByLabel("What's for dinner?").fill(query);
  await page.getByRole("button", { name: "Search" }).click();
}

/** Plans a Spoonacular fixture dinner (its ingredient lines come from the fixture, not the AI fake). */
async function plan(page: Page, day: string, dayLabel: string, query: string, card: string) {
  await page.goto(`/week/add?day=${day}&slot=dinner`);
  await searchFor(page, query);
  await page.getByRole("button", { name: card }).click();
  await page.getByRole("button", { name: `Add to ${dayLabel}` }).click();
  await expect(page).toHaveURL(/\/week$/);
}

const titles = (page: Page) => page.getByTestId("result-title").allTextContents();

test("fits this week: orders by shared foods, shows what is shared, and fits 360 px", async ({ page }, testInfo) => {
  const shots = `e2e/screenshots/${testInfo.project.name}`;
  await createHousehold(page);
  await plan(page, "mon", "Monday", "lasagna", "Easy lasagna · Spoonacular");
  await plan(page, "tue", "Tuesday", "pot pie", "Easy pot pie · Spoonacular");

  await page.goto("/week/add?day=wed&slot=dinner");
  await searchFor(page, "tacos");
  await expect(page.getByTestId("result-card").first()).toBeVisible();

  const sort = page.getByRole("radiogroup", { name: "Order results by" });
  const loved = sort.getByRole("radio", { name: "Most loved" });
  const fits = sort.getByRole("radio", { name: "Fits this week" });
  await expect(loved).toBeChecked();
  for (const r of [loved, fits]) expect((await r.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // Today's order.
  const before = await titles(page);
  expect(before[0]).toBe("Chicken tacos");
  expect(before).toContain("Easy taco bowls");

  await fits.click();
  await expect(fits).toBeChecked();
  const after = await titles(page);
  expect(after).not.toEqual(before);
  expect(after[0]).toBe("Easy taco bowls");
  const top = page.getByTestId("result-card").first();
  await expect(top.getByTestId("result-shares")).toHaveText("Shares 2 with this week: cooked chicken, ground beef");
  await expect(page.getByRole("button", { name: /Easy taco bowls · Budget Bytes.*Shares 2 with this week: cooked chicken, ground beef/ })).toBeVisible();
  // Cards that share nothing have no line.
  await expect(page.getByTestId("result-shares")).toHaveCount(1);
  await page.screenshot({ path: `${shots}/fits-this-week.png`, fullPage: true });

  // The choice is remembered for the session, and the keyboard works on the group.
  await page.reload();
  await searchFor(page, "tacos");
  await expect(page.getByRole("radio", { name: "Fits this week" })).toBeChecked();
  await page.getByRole("radio", { name: "Fits this week" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: "Most loved" })).toBeChecked();
  expect((await titles(page))[0]).toBe("Chicken tacos");
  await page.getByRole("radio", { name: "Fits this week" }).click();

  // 360 px: the line sits on its own line and is not clipped.
  await page.setViewportSize({ width: 360, height: 800 });
  const card = page.getByTestId("result-card").first();
  const line = card.getByTestId("result-shares");
  await expect(line).toBeVisible();
  const c = (await card.boundingBox())!;
  const l = (await line.boundingBox())!;
  expect(l.x).toBeGreaterThanOrEqual(c.x);
  expect(l.x + l.width).toBeLessThanOrEqual(c.x + c.width);
  expect(await line.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.screenshot({ path: `${shots}/fits-this-week-360.png`, fullPage: true });
});

test("fits this week: with no other dinners it says so and keeps the most-loved order", async ({ page }) => {
  await createHousehold(page);
  await page.goto("/week/add?day=mon&slot=dinner");
  await searchFor(page, "tacos");
  await expect(page.getByTestId("result-card").first()).toBeVisible();
  const before = await titles(page);
  await page.getByRole("radio", { name: "Fits this week" }).click();
  await expect(page.getByText("Add another dinner first to see what fits")).toBeVisible();
  expect(await titles(page)).toEqual(before);
  await expect(page.getByTestId("result-shares")).toHaveCount(0);
});
