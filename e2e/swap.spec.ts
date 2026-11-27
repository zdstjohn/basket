import { expect, test, type Locator, type Page } from "@playwright/test";
import { createHousehold, joinAsPartner } from "./helpers/household";
import { routeFoodImages } from "./helpers/fixtures";

// Runs against the Kroger fixtures (KROGER_FAKE=1): no call ever leaves the machine.
test.beforeEach(async ({ page }) => {
  await routeFoodImages(page);
});

const row = (page: Page, name: string): Locator => page.getByTestId("list-row").filter({ hasText: name });
const total = (page: Page): Locator => page.getByTestId("list-total");
const cents = (text: string | null): number => {
  // The last amount is the total ("2 × $1.25 · $2.50").
  const all = [...(text ?? "").matchAll(/\$([\d,]+\.\d{2})/g)];
  const m = all[all.length - 1];
  return m ? Math.round(Number(m[1].replace(/,/g, "")) * 100) : NaN;
};

async function chooseStore(page: Page) {
  await page.goto("/household");
  const stores = page.getByRole("region", { name: "Stores and settings" });
  await stores.getByRole("button", { name: "Choose store" }).click();
  await stores.getByLabel("ZIP code").fill("98402");
  await stores.getByRole("button", { name: "Search" }).click();
  await stores.getByRole("button", { name: /Fred Meyer - Tacoma-Stevens/ }).click();
  await expect(stores.getByText("Your Fred Meyer")).toBeVisible();
}

async function addTacos(page: Page) {
  await page.goto("/week/add?day=thu&slot=dinner");
  await page.getByLabel("What's for dinner?").fill("tacos");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Chicken tacos · Allrecipes" }).click();
  await page.getByRole("button", { name: "Add to Thursday" }).click();
  await expect(page).toHaveURL(/\/week$/);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "List" }).click();
  await expect(page.getByRole("heading", { name: "Shopping list" })).toBeVisible();
}

async function openSwap(page: Page): Promise<Locator> {
  await row(page, "Black beans").getByRole("button", { name: "Swap Black beans product" }).click();
  const sheet = page.getByRole("dialog", { name: "Swap black beans" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test("swap: pick another product, keep it, go back, search with your own words", async ({ page, browser }, testInfo) => {
  const shots = `e2e/screenshots/${testInfo.project.name}`;
  await createHousehold(page);
  await chooseStore(page);
  await addTacos(page);

  const beans = row(page, "Black beans");
  await expect(beans.getByTestId("row-count")).toBeVisible();
  const { context: otherContext, page: b } = await joinAsPartner(page, browser);
  await page.goto("/list");
  await expect(beans.getByTestId("row-count")).toBeVisible();
  await b.goto("/list");
  await expect(b.locator('[data-live="on"]')).toBeAttached();
  await expect(row(b, "Black beans").getByTestId("row-count")).toBeVisible();

  // The row holds together on a small phone: no sideways scroll, and Swap is a full-size target.
  const wide = page.viewportSize() ?? { width: 402, height: 874 };
  await page.setViewportSize({ width: 360, height: 800 });
  const swap = beans.getByRole("button", { name: "Swap Black beans product" });
  expect((await swap.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("tab", { name: /^Fred Meyer/ }).click();
  await expect(row(page, "Corn tortillas").getByRole("button", { name: "Find a product for Corn tortillas" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `${shots}/swap-row-360.png` });
  await page.setViewportSize(wide);

  // The sheet lists the products found, with the cheapest tagged.
  const firstName = (await beans.locator(".line-clamp-2").last().innerText()).split(" · ")[0];
  const before = cents(await total(page).innerText());
  const beansBefore = cents(await beans.getByTestId("row-total").innerText());
  let sheet = await openSwap(page);
  const options = sheet.getByTestId("swap-option");
  expect(await options.count()).toBeGreaterThanOrEqual(2);
  await expect(sheet.getByText("Cheapest", { exact: true })).toHaveCount(1);
  await expect(sheet.getByRole("button", { name: "Back to Basket's pick" })).toHaveCount(0);
  await page.screenshot({ path: `${shots}/swap.png` });

  // Choose the other one: the row shows its name and total, the list total moves by the difference.
  const other = options.filter({ hasNotText: firstName }).first();
  const otherName = (await other.locator(".line-clamp-2").innerText()).trim();
  const otherCents = cents(await other.innerText());
  await other.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(beans).toContainText(otherName);
  await expect(beans.getByTestId("row-total")).toHaveText(`$${(otherCents / 100).toFixed(2)}`);
  await expect.poll(async () => cents(await total(page).innerText())).toBe(before + otherCents - beansBefore);

  // The other phone sees it without reloading.
  await expect(row(b, "Black beans")).toContainText(otherName);

  // It is still chosen after a reload, and the sheet says it is the usual.
  await page.reload();
  await expect(row(page, "Black beans")).toContainText(otherName);
  sheet = await openSwap(page);
  await expect(sheet.getByText("Your usual", { exact: true })).toHaveCount(1);
  await expect(sheet.getByTestId("swap-option").filter({ hasText: "Your usual" })).toContainText(otherName);

  // Back to Basket's pick brings the first product back.
  await sheet.getByRole("button", { name: "Back to Basket's pick" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row(page, "Black beans")).toContainText(firstName);
  await expect(row(page, "Black beans")).not.toContainText(otherName);
  await expect.poll(async () => cents(await total(page).innerText())).toBe(before);

  // Search with your own words: the words show, and survive a reload.
  sheet = await openSwap(page);
  await sheet.getByLabel("Search with other words").fill("organic black beans");
  await sheet.getByRole("button", { name: "Search", exact: true }).click();
  await expect(sheet.getByText('Searching for "organic black beans"')).toBeVisible();
  await expect(sheet.getByTestId("swap-option").first()).toBeVisible();
  await page.reload();
  sheet = await openSwap(page);
  await expect(sheet.getByText('Searching for "organic black beans"')).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Back to Basket's pick" })).toBeVisible();

  // Too short.
  await sheet.getByLabel("Search with other words").fill("a");
  await sheet.getByRole("button", { name: "Search", exact: true }).click();
  await expect(sheet.getByText("Use 2 to 80 letters.")).toBeVisible();
  await expect(sheet.getByText('Searching for "organic black beans"')).toBeVisible();

  await otherContext.close();
});
