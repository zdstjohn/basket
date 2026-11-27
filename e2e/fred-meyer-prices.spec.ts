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
  await expect(chicken.getByText("Heritage Farm Boneless Skinless Chicken Thighs")).toBeVisible();
  // Sold by the pound: the whole pound is what you buy, so $3.99, not the 11.2 oz used.
  await expect(chicken.getByTestId("row-total")).toHaveText("about $3.99");
  await expect(chicken.getByTestId("row-count")).toHaveText("1 lb");
  // The photo may not load where www.kroger.com is blocked, so check it is on the row rather than painted.
  const photo = chicken.locator("img");
  await expect(photo).toBeAttached();
  await expect(photo).toHaveAttribute("src", /^https:\/\/www\.kroger\.com\/product\/images\/small\/front\//);
  await expect(photo).toHaveAttribute("alt", "Heritage Farm Boneless Skinless Chicken Thighs");
  await expect(photo).toHaveAttribute("loading", "lazy");
  await expect(photo).toHaveAttribute("referrerpolicy", "no-referrer");

  const beans = row(page, "Black beans");
  await expect(beans.getByTestId("row-count")).toBeVisible();
  await expect(beans.getByTestId("row-total")).toContainText("$");
  await expect(beans.getByText("Simple Truth Organic Black Beans")).toBeVisible();
  await expect(beans.locator("img")).toHaveCount(0); // the fixture product has no photo
  // Foods with no Fred Meyer product say so, and never guess.
  await expect(row(page, "Corn tortillas")).toContainText("No Fred Meyer match yet");
  await expect(row(page, "Corn tortillas").getByTestId("row-total")).toHaveText("—");
  await expect(page.getByTestId("list-row").getByText("estimate")).toHaveCount(0);
  await expect(page.getByText("Choose your Fred Meyer")).toHaveCount(0);
  await expect(page.getByText("This week's total")).toBeVisible();

  // The total is the sum of the package prices on every tab.
  const dollars = (t: string | null): number => {
    const m = /\$([\d,]+(?:\.\d{2})?)/.exec(t ?? "");
    return m ? Math.round(Number(m[1].replace(/,/g, "")) * 100) : 0;
  };
  async function visibleSum(): Promise<number> {
    let sum = 0;
    for (const name of [/^Fred Meyer/, /^Amazon/, /^Costco/]) {
      await page.getByRole("tab", { name }).click();
      for (const t of await page.getByTestId("row-total").allTextContents()) sum += dollars(t);
    }
    return sum;
  }
  await expect.poll(async () => (await visibleSum()) > 0).toBe(true);
  const sum = await visibleSum();
  await page.getByRole("tab", { name: /^Fred Meyer/ }).click();
  expect(dollars(await page.getByTestId("list-total").textContent())).toBe(sum);

  // The Week screen's budget meter follows the same number.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Week" }).click();
  await expect(page.getByRole("meter", { name: "Weekly budget" })).toHaveAttribute("aria-valuenow", String(sum));
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "List" }).click();
  await expect(page.getByRole("heading", { name: "Shopping list" })).toBeVisible();

  // Moving a food to Amazon drops its guess: only a price you type counts there.
  const sheetButton = row(page, "Corn tortillas").getByRole("button", { name: /Corn tortillas/ });
  await sheetButton.click();
  await page.getByRole("dialog", { name: "Corn tortillas" }).getByRole("button", { name: "Move to Amazon" }).click();
  await page.getByRole("tab", { name: /^Amazon/ }).click();
  await expect(row(page, "Corn tortillas").getByText("no price yet", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: /^Fred Meyer/ }).click();
  await page.screenshot({ path: `${shots}/fred-meyer-products.png`, fullPage: true });
});
