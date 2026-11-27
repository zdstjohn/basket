import { expect, test, type Locator, type Page } from "@playwright/test";
import { createHousehold, joinAsPartner } from "./helpers/household";
import { routeFoodImages } from "./helpers/fixtures";
import { addFromSearch } from "./helpers/flows-a";
import { chooseStore, openItemSheet, openList } from "./helpers/flows-b";

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

async function addTacos(page: Page) {
  await addFromSearch(page, { day: "thu", query: "tacos", pick: "Chicken tacos · Allrecipes" });
  await openList(page);
}

/** Opens the row's sheet, then its first action, Swap. The item sheet closes before the swap sheet opens. */
async function openSwap(page: Page): Promise<Locator> {
  const item = await openItemSheet(page, "Black beans");
  await item.getByRole("button", { name: "Swap Black beans product" }).click();
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

  // The row holds together on a small phone: no sideways scroll. Swap is not on the row; it is the first action in the item sheet, a full-size target.
  const wide = page.viewportSize() ?? { width: 402, height: 874 };
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(beans.getByRole("button", { name: "Swap Black beans product" })).toHaveCount(0);
  const itemSheet = await openItemSheet(page, "Black beans");
  const swap = itemSheet.getByRole("button", { name: "Swap Black beans product" });
  expect((await swap.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(await itemSheet.locator('button:not([aria-label="Close"])').first().getAttribute("aria-label")).toBe("Swap Black beans product"); // the first action
  await itemSheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("tab", { name: /^Fred Meyer/ }).click();
  const find = row(page, "Corn tortillas").getByRole("button", { name: "Find a product for Corn tortillas" });
  await expect(find).toBeVisible();
  expect((await find.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `${shots}/swap-row-360.png` });
  await page.setViewportSize(wide);

  // The sheet lists the products found, with the cheapest tagged.
  const firstName = (await beans.locator(".line-clamp-1").innerText()).split(" · ")[0];
  const before = cents(await total(page).innerText());
  const beansBefore = cents(await beans.getByTestId("row-total").innerText());
  let sheet = await openSwap(page);
  const options = sheet.getByTestId("swap-option");
  expect(await options.count()).toBeGreaterThanOrEqual(2);
  await expect(sheet.getByText("Cheapest", { exact: true })).toHaveCount(1);
  await expect(sheet.getByRole("button", { name: "Back to Basket’s pick" })).toHaveCount(0);
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

  // Back to Basket’s pick brings the first product back.
  await sheet.getByRole("button", { name: "Back to Basket’s pick" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row(page, "Black beans")).toContainText(firstName);
  await expect(row(page, "Black beans")).not.toContainText(otherName);
  await expect.poll(async () => cents(await total(page).innerText())).toBe(before);

  // Search with your own words: the words show, and survive a reload.
  sheet = await openSwap(page);
  await sheet.getByLabel("Search with other words").fill("organic black beans");
  await sheet.getByRole("button", { name: "Search", exact: true }).click();
  await expect(sheet.getByText('Searching for “organic black beans”')).toBeVisible();
  await expect(sheet.getByTestId("swap-option").first()).toBeVisible();
  await page.reload();
  sheet = await openSwap(page);
  await expect(sheet.getByText('Searching for “organic black beans”')).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Back to Basket’s pick" })).toBeVisible();

  // Too short.
  await sheet.getByLabel("Search with other words").fill("a");
  await sheet.getByRole("button", { name: "Search", exact: true }).click();
  await expect(sheet.getByText("Use 2 to 80 letters.")).toBeVisible();
  await expect(sheet.getByText('Searching for “organic black beans”')).toBeVisible();

  await otherContext.close();
});

test("the item sheet has a Close button", async ({ page }) => {
  await createHousehold(page);
  await addTacos(page);
  const sheet = await openItemSheet(page, "Black beans");
  await expect(sheet.getByRole("heading", { name: "Black beans" })).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The exit has played and focus is back on the row that opened it.
  await expect(row(page, "Black beans").getByRole("button", { name: /Black beans/ })).toBeFocused();
});

test("a long product name does not push the price off the row at 360 px", async ({ page }) => {
  await createHousehold(page);
  await chooseStore(page);
  await addTacos(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(row(page, "Black beans").getByTestId("row-count")).toBeVisible();
  const sheet = await openSwap(page);
  const first = sheet.getByTestId("swap-option").first();
  await expect(first).toBeVisible();

  // A name far longer than the row can hold, with its line limit off so it really takes four lines or more.
  await first.evaluate((btn) => {
    const name = btn.querySelector(".line-clamp-2") as HTMLElement;
    name.classList.remove("line-clamp-2");
    name.textContent = "Simple Truth Organic Reduced Sodium Slow Cooked Black Beans With Roasted Garlic And Smoked Paprika, Family Size Value Pack, 6 Count Case";
  });
  expect((await first.boundingBox())!.height).toBeGreaterThanOrEqual(4 * 20);
  const options = sheet.getByTestId("swap-option");
  const n = await options.count();
  for (let i = 0; i < n; i++) {
    const rowBox = (await options.nth(i).boundingBox())!;
    const price = (await options.nth(i).getByTestId("swap-price").boundingBox())!;
    expect(price.height, `option ${i} price wrapped`).toBeLessThanOrEqual(17);
    expect(price.x + price.width, `option ${i} price ran off the row`).toBeLessThanOrEqual(rowBox.x + rowBox.width + 0.5);
    expect(price.x, `option ${i} price is squeezed under the name`).toBeGreaterThan(rowBox.x + rowBox.width / 2);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("typing .99 saves 99 cents", async ({ page }) => {
  await createHousehold(page);
  await addTacos(page);
  const sheet = await openItemSheet(page, "Corn tortillas");
  await sheet.getByRole("button", { name: "Set price" }).click();
  await sheet.getByLabel("Price").fill("abc");
  await sheet.getByRole("button", { name: "Save price" }).click();
  await expect(sheet.getByText("Enter an amount like $3.00.")).toBeVisible();
  await sheet.getByLabel("Price").fill(".99");
  await sheet.getByRole("button", { name: "Save price" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The list paints its offline copy first, so wait for the fresh value.
  await expect(row(page, "Corn tortillas").getByTestId("row-total")).toHaveText("$0.99");
});

test("the choice is saved at the tap, a second tap during the exit does nothing, and focus returns to the row", async ({ page }) => {
  await createHousehold(page);
  await chooseStore(page);
  await addTacos(page);
  const beans = row(page, "Black beans");
  await expect(beans.getByTestId("row-count")).toBeVisible();
  const firstName = (await beans.locator(".line-clamp-1").innerText()).split(" · ")[0];
  const sheet = await openSwap(page);
  const options = sheet.getByTestId("swap-option").filter({ hasNotText: firstName });
  expect(await options.count()).toBeGreaterThanOrEqual(1);
  const pick = options.first();
  const pickName = (await pick.locator(".line-clamp-2").innerText()).trim();
  const others = sheet.getByTestId("swap-option").filter({ hasNotText: pickName });

  // Note when the first write leaves the page (clock of the test) and when the dialog is gone (clock of the page).
  let write: number | null = null;
  page.on("request", (r) => {
    if (r.method() !== "GET" && r.url().includes("/rest/v1/") && write === null) write = Date.now();
  });
  await page.evaluate(() => {
    const w = window as unknown as { __gone?: number };
    new MutationObserver(() => {
      if (!document.querySelector("dialog[open]") && w.__gone === undefined) w.__gone = performance.timeOrigin + performance.now();
    }).observe(document.body, { childList: true, subtree: true, attributes: true });
  });
  await pick.click();
  // A second tap while the sheet leaves (the panel is inert and the rows are disabled): nothing happens.
  await others.first().evaluate((el) => (el as HTMLElement).click());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const gone = await page.evaluate(() => (window as unknown as { __gone?: number }).__gone ?? null);
  expect(write, "no write was made").not.toBeNull();
  expect(gone, "the dialog never closed").not.toBeNull();
  expect(write!, "the choice was written before the dialog was gone").toBeLessThan(gone!);
  await expect(beans).toContainText(pickName);
  // The first tap won, and focus is back on the row's button.
  await expect(beans.getByRole("button", { name: /Black beans/ })).toBeFocused();
});
