import { expect, test, type Locator, type Page } from "@playwright/test";
import { createHousehold } from "./helpers/household";
import { routeFoodImages } from "./helpers/fixtures";

// Runs against the Kroger fixtures (KROGER_FAKE=1): no call ever leaves the machine.
test.beforeEach(async ({ page }) => {
  await routeFoodImages(page);
});

const row = (page: Page, name: string): Locator => page.getByTestId("list-row").filter({ hasText: name });

async function chooseStore(page: Page) {
  await page.goto("/household");
  const stores = page.getByRole("region", { name: "Stores and settings" });
  await stores.getByRole("button", { name: "Choose store" }).click();
  await stores.getByLabel("ZIP code").fill("98402");
  await stores.getByRole("button", { name: "Search" }).click();
  await stores.getByRole("button", { name: /Fred Meyer - Tacoma-Stevens/ }).click();
  await expect(stores.getByText("Your Fred Meyer")).toBeVisible();
  await expect(stores.getByText("Fred Meyer - Tacoma-Stevens")).toBeVisible();
  await expect(stores.getByRole("button", { name: "Choose store" })).toHaveCount(0);
}

test("Fred Meyer prices: choose a store, then the list shows real shelf prices", async ({ page }, testInfo) => {
  const shots = `e2e/screenshots/${testInfo.project.name}`;
  await createHousehold(page);
  await chooseStore(page);

  // The choice is saved for the household.
  await page.reload();
  await expect(page.getByText("Fred Meyer - Tacoma-Stevens")).toBeVisible();

  await page.goto("/week/add?day=thu&slot=dinner");
  await page.getByLabel("What's for dinner?").fill("tacos");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Chicken tacos · Allrecipes" }).click();
  await page.getByRole("button", { name: "Add to Thursday" }).click();
  await expect(page).toHaveURL(/\/week$/);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "List" }).click();
  await expect(page.getByRole("heading", { name: "Shopping list" })).toBeVisible();

  const chicken = row(page, "Boneless chicken thighs");
  await expect(chicken.getByText("Fred Meyer price", { exact: true })).toBeVisible();
  await expect(chicken.getByText("Heritage Farm Boneless Skinless Chicken Thighs")).toBeVisible();
  // 11.2 oz at $3.99 a pound is $2.79.
  await expect(chicken).toContainText("$2.79");
  // The photo may not load where www.kroger.com is blocked, so check it is on the row rather than painted.
  const photo = chicken.locator("img");
  await expect(photo).toBeAttached();
  await expect(photo).toHaveAttribute("src", /^https:\/\/www\.kroger\.com\/product\/images\/small\/front\//);
  await expect(photo).toHaveAttribute("alt", "Heritage Farm Boneless Skinless Chicken Thighs");
  await expect(photo).toHaveAttribute("loading", "lazy");
  await expect(photo).toHaveAttribute("referrerpolicy", "no-referrer");

  // Items Kroger has no match for keep the model's estimate, and so does another store.
  await expect(row(page, "Black beans").getByText("estimate", { exact: true })).toBeVisible();
  await expect(row(page, "Black beans").locator("img")).toHaveCount(0);

  const sheetButton = row(page, "Corn tortillas").getByRole("button", { name: /Corn tortillas/ });
  await sheetButton.click();
  await page.getByRole("dialog", { name: "Corn tortillas" }).getByRole("button", { name: "Move to Amazon" }).click();
  await page.getByRole("tab", { name: /^Amazon/ }).click();
  await expect(row(page, "Corn tortillas").getByText("estimate", { exact: true })).toBeVisible();
  await expect(row(page, "Corn tortillas").getByText("Fred Meyer price")).toHaveCount(0);

  await page.getByRole("tab", { name: /^Fred Meyer/ }).click();
  await page.screenshot({ path: `${shots}/fred-meyer-prices.png`, fullPage: true });
});
