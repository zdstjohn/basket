import { expect, test, type Locator, type Page } from "@playwright/test";
import { createHousehold, joinAsPartner } from "./helpers/household";
import { routeFoodImages } from "./helpers/fixtures";
import { clientFor } from "./helpers/db";
import { addFromSearch, favoritesKept, readWeekBudget, weekBudget } from "./helpers/flows-a";
import { chooseStore, listTotal, openItemSheet, openList } from "./helpers/flows-b";

test.beforeEach(async ({ page }) => {
  await routeFoodImages(page);
});

/** Chicken tacos on Thursday: for the five-person family that is 11.2 oz of chicken, 1 can of beans, 12 tortillas, 1 onion. */
async function planTacos(page: Page) {
  await addFromSearch(page, { day: "thu", query: "tacos", pick: "Chicken tacos · Allrecipes" });
}

const row = (page: Page, name: string): Locator => page.getByTestId("list-row").filter({ hasText: name });
const total = listTotal;
const dollars = async (loc: Locator): Promise<number> =>
  Math.round(Number(/\$([\d.]+)/.exec(await loc.innerText())?.[1]) * 100);

const openSheet = openItemSheet;

async function setPrice(page: Page, name: string, price: string) {
  const sheet = await openSheet(page, name);
  await sheet.getByRole("button", { name: "Set price" }).click();
  await sheet.getByLabel("Price").fill(price);
  await sheet.getByRole("button", { name: "Save price" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("list: tabs, groups, scaled amounts and estimates", async ({ page }, testInfo) => {
  const shots = `e2e/screenshots/${testInfo.project.name}`;
  await createHousehold(page);
  await planTacos(page);
  await openList(page);

  const tabs = page.getByRole("tablist", { name: "Stores" });
  await expect(tabs.getByRole("tab", { name: /^Fred Meyer.*· 4$/ })).toHaveAttribute("aria-selected", "true");
  // Every tab total shows cents.
  await expect(tabs.getByRole("tab", { name: /^Fred Meyer.*\$\d+\.\d{2} · 4$/ })).toBeVisible();
  await expect(tabs.getByRole("tab", { name: /^Amazon.*\$0\.00 · 0$/ })).toBeVisible();
  await expect(tabs.getByRole("tab", { name: /^Amazon.*· 0$/ })).toBeVisible();
  await expect(tabs.getByRole("tab", { name: /^Costco.*· 0$/ })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Meat and seafood" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Beans and tofu" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Produce" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bakery" })).toBeVisible();
  await expect(row(page, "Boneless chicken thighs")).toContainText("11.2 oz");
  await expect(row(page, "Black beans")).toContainText("1 can");
  await expect(row(page, "Corn tortillas")).toContainText("12");
  await expect(row(page, "Yellow onion")).toContainText("1");

  // Every price waits for its estimate, then reads "estimate".
  await expect(page.getByTestId("list-row").getByText("estimate", { exact: true })).toHaveCount(4);
  // No Fred Meyer chosen yet: the list says how to get real products, and keeps the estimates.
  await expect(page.getByText("Choose your Fred Meyer in Household to see real products and prices.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Household" })).toHaveAttribute("href", "/household");
  await expect(page.getByText("Estimated total, for the amounts you’ll use")).toBeVisible();
  // The rows are the tab panel of the store tabs.
  await expect(page.getByRole("tabpanel")).toContainText("Boneless chicken thighs");
  await expect(total(page)).toContainText("$");
  await expect(page.getByText(/without a price/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Review and fill carts" })).toHaveCount(0);

  // Everything is a tap target of at least 44 px.
  for (const name of ["Got Yellow onion"]) {
    const box = await page.getByRole("checkbox", { name }).locator("xpath=ancestor::label").boundingBox();
    expect(box && box.width >= 44 && box.height >= 44).toBe(true);
  }
  const rowBox = await row(page, "Yellow onion").getByRole("button", { name: /Yellow onion/ }).boundingBox();
  expect(rowBox && rowBox.height >= 44).toBe(true);

  await page.screenshot({ path: `${shots}/list.png`, fullPage: true });

  // Favorites: "Under $15" keeps meals whose lines all have prices and add up to $15 or less.
  await expect(await favoritesKept(page, "Under $15")).toHaveCount(1);
});

test("list: have it moves an item to Skipped and drops the total; checking off crosses it out", async ({ page }) => {
  await createHousehold(page);
  await planTacos(page);
  await openList(page);
  await expect(page.getByTestId("list-row").getByText("estimate", { exact: true })).toHaveCount(4);

  const before = await dollars(total(page));
  const onionPrice = await dollars(row(page, "Yellow onion"));
  expect(onionPrice).toBeGreaterThan(0);

  const sheet = await openSheet(page, "Yellow onion");
  await sheet.getByRole("button", { name: "I have it" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const skipped = page.getByTestId("skipped");
  await expect(skipped.getByText("Skipped, you have them")).toBeVisible();
  await expect(skipped.getByTestId("list-row")).toBeHidden(); // collapsed
  await skipped.locator("summary").click();
  await expect(skipped.getByTestId("list-row").filter({ hasText: "Yellow onion" })).toBeVisible();
  await expect(page.getByTestId("list-row").filter({ hasText: "Yellow onion" })).toHaveCount(1);
  await expect.poll(() => dollars(total(page))).toBe(before - onionPrice);
  await expect(page.getByRole("tab", { name: /^Fred Meyer.*· 3$/ })).toBeVisible();

  // And back.
  const again = await openSheet(page, "Yellow onion");
  await again.getByRole("button", { name: "I need it" }).click();
  await expect.poll(() => dollars(total(page))).toBe(before);

  // Checking off is a separate thing: it stays on the list, crossed out.
  await page.getByRole("checkbox", { name: "Got Black beans" }).check();
  await expect(page.getByRole("checkbox", { name: "Got Black beans" })).toBeChecked();
  await expect(row(page, "Black beans")).toHaveAttribute("data-checked", "true");
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Got Black beans" })).toBeChecked();
});

test("budget: the sentence changes at $201 and $226", async ({ page }) => {
  await createHousehold(page);
  await planTacos(page);
  await openList(page);
  await expect(page.getByTestId("list-row").getByText("estimate", { exact: true })).toHaveCount(4);

  await setPrice(page, "Boneless chicken thighs", "198");
  await setPrice(page, "Black beans", "1");
  await setPrice(page, "Corn tortillas", "1");
  await setPrice(page, "Yellow onion", "1");
  await expect(total(page)).toHaveText("$201.00");
  await expect(page.getByTestId("list-bar")).toContainText("into the wiggle room");

  // The week's budget follows the list's total. (How the week words it is checked in week.spec.ts.)
  await weekBudget(page);
  await expect.poll(async () => (await readWeekBudget(page)).totalCents).toBe(20100);

  await openList(page);
  await setPrice(page, "Boneless chicken thighs", "223");
  await expect(total(page)).toHaveText("$226.00");
  await expect(page.getByTestId("list-bar")).toContainText("past the wiggle room");
  await weekBudget(page);
  await expect.poll(async () => (await readWeekBudget(page)).totalCents).toBe(22600);

  // Leaving one out of the budget brings the total back down.
  await openList(page);
  const sheet = await openSheet(page, "Boneless chicken thighs");
  await sheet.getByRole("button", { name: "Leave out of budget" }).click();
  await expect(total(page)).toContainText("$3");
  await expect(page.getByTestId("list-bar")).toContainText("left");
  await expect(page.getByTestId("list-bar")).not.toContainText("past the wiggle room");
});

test("stores and prices: a move sticks; your own price replaces the estimate", async ({ page }) => {
  const email = await createHousehold(page);
  await planTacos(page);
  await openList(page);
  await expect(page.getByTestId("list-row").getByText("estimate", { exact: true })).toHaveCount(4);

  const sheet = await openSheet(page, "Corn tortillas");
  await expect(sheet.getByRole("button", { name: "Move to Fred Meyer" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Move to Amazon" }).click();
  await expect(row(page, "Corn tortillas")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /^Amazon.*· 1$/ })).toBeVisible();
  await page.getByRole("tab", { name: /^Amazon/ }).click();
  await expect(row(page, "Corn tortillas")).toBeVisible();
  // Amazon never guesses: until you type a price, a link to Amazon's search stands in for it.
  const amazon = row(page, "Corn tortillas").getByRole("link", { name: "Search Amazon" });
  await expect(amazon).toHaveAttribute("href", "https://www.amazon.com/s?k=corn%20tortillas");
  await expect(amazon).toHaveAttribute("target", "_blank");
  await expect(amazon).toHaveAttribute("rel", "noopener noreferrer");
  expect((await amazon.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(row(page, "Corn tortillas").getByText("estimate", { exact: true })).toHaveCount(0);
  await expect(row(page, "Corn tortillas").getByText("no price yet", { exact: true })).toHaveCount(0);

  // The choice is the household's, not the week's: it is still there on reload and next week.
  await page.reload();
  await page.getByRole("tab", { name: /^Amazon/ }).click();
  await expect(row(page, "Corn tortillas")).toBeVisible();
  const sb = await clientFor(email);
  const { data } = await sb.from("item_store").select("canonical, store");
  expect(data).toEqual([{ canonical: "corn tortillas", store: "amazon" }]);

  await setPrice(page, "Corn tortillas", "$3.00");
  await expect(row(page, "Corn tortillas").getByText("your price", { exact: true })).toBeVisible();
  await expect(row(page, "Corn tortillas")).toContainText("$3.00");
  await expect(row(page, "Corn tortillas").getByText("estimate", { exact: true })).toHaveCount(0);
  // A price you typed is kept: the search link stands in only for the estimate.
  await expect(row(page, "Corn tortillas").getByRole("link", { name: "Search Amazon" })).toHaveCount(0);
});

test("list: one food, one row, with the amounts joined; ticks and untick stick", async ({ page }) => {
  await createHousehold(page);
  await planTacos(page); // 1 onion in the dinner

  // A staple of the same food in a different unit joins the dinner's onion instead of making a second row.
  await page.goto("/household");
  const staples = page.getByRole("region", { name: "Staples" });
  await staples.getByRole("button", { name: "+ Add staple" }).click();
  await staples.getByLabel("Name").fill("Yellow onion");
  await staples.getByLabel("Amount").fill("200");
  await staples.getByLabel("Unit").fill("g");
  await staples.getByLabel("Type").selectOption({ label: "Produce" });
  await staples.getByRole("button", { name: "Save staple" }).click();
  await expect(staples.getByTestId("staple-row").filter({ hasText: "Yellow onion" })).toBeVisible();
  await openListFromHousehold(page);

  await expect(page.getByTestId("list-row").filter({ hasText: "Yellow onion" })).toHaveCount(1);
  await expect(row(page, "Yellow onion")).toContainText("1 + 7.1 oz");

  await page.getByRole("checkbox", { name: "Got Yellow onion" }).check();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Got Yellow onion" })).toBeChecked();
  await page.getByRole("checkbox", { name: "Got Yellow onion" }).uncheck();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Got Yellow onion" })).not.toBeChecked();
  await expect(page.getByTestId("list-row").filter({ hasText: "Yellow onion" })).toHaveCount(1);
});

test("two phones: a staple is checked off live, and the list works offline", async ({ page, browser, context }, testInfo) => {
  const shots = `e2e/screenshots/${testInfo.project.name}`;
  const email = await createHousehold(page);

  await page.goto("/household");
  const staples = page.getByRole("region", { name: "Staples" });
  await staples.getByRole("button", { name: "+ Add staple" }).click();
  await staples.getByLabel("Name").fill("Milk");
  await staples.getByLabel("Amount").fill("1");
  await staples.getByLabel("Unit").fill("gallon");
  await staples.getByLabel("Type").selectOption({ label: "Dairy" });
  await staples.getByRole("button", { name: "Save staple" }).click();
  await expect(staples.getByTestId("staple-row").filter({ hasText: "Milk" })).toContainText("1 gallon");

  await openListFromHousehold(page);
  await expect(row(page, "Milk")).toContainText("1 gallon");
  await expect(row(page, "Milk").getByText("estimate", { exact: true })).toBeVisible();

  const { context: otherContext, page: b } = await joinAsPartner(page, browser);
  await page.goto("/list"); // joining took the first phone to Household
  await expect(row(page, "Milk")).toBeVisible();
  await b.goto("/list");
  await expect(b.locator('[data-live="on"]')).toBeAttached();
  await expect(row(b, "Milk")).toBeVisible();

  await page.getByRole("checkbox", { name: "Got Milk" }).check();
  await expect(b.getByRole("checkbox", { name: "Got Milk" })).toBeChecked({ timeout: 5000 });
  await expect(row(b, "Milk")).toHaveAttribute("data-checked", "true");

  // Offline: a reload still shows the last list, with a quiet line, and a check-off waits to be sent.
  await page.getByRole("checkbox", { name: "Got Milk" }).uncheck();
  await expect(b.getByRole("checkbox", { name: "Got Milk" })).not.toBeChecked({ timeout: 5000 });
  await expect(page.locator('[data-offline-ready="on"]')).toBeAttached({ timeout: 15_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Offline. Showing your last list.")).toBeVisible();
  await expect(row(page, "Milk")).toBeVisible();
  await page.screenshot({ path: `${shots}/list-offline.png`, fullPage: true });

  // A cold start at the app's start page (/week) with no signal lands on the saved list.
  await page.goto("/week");
  await expect(page).toHaveURL(/\/list$/);
  await expect(row(page, "Milk")).toBeVisible();

  await page.getByRole("checkbox", { name: "Got Milk" }).check();
  await expect(page.getByRole("checkbox", { name: "Got Milk" })).toBeChecked();
  await context.setOffline(false);
  await expect(page.getByText("Offline. Showing your last list.")).toHaveCount(0, { timeout: 15_000 });

  const sb = await clientFor(email);
  await expect
    .poll(async () => (await sb.from("week_item_state").select("checked").eq("item_key", "milk")).data?.[0]?.checked)
    .toBe(true);
  await expect(b.getByRole("checkbox", { name: "Got Milk" })).toBeChecked({ timeout: 10_000 });
  await otherContext.close();
});

async function openListFromHousehold(page: Page) {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "List" }).click();
  await expect(page).toHaveURL(/\/list$/);
}

test("household: where things come from, staples on and off, always-have", async ({ page }, testInfo) => {
  const shots = `e2e/screenshots/${testInfo.project.name}`;
  const email = await createHousehold(page);
  await page.goto("/household");

  const stores = page.getByRole("region", { name: "Where things come from" });
  const dairy = stores.getByRole("radiogroup", { name: "Dairy and eggs" });
  await expect(dairy.getByRole("radio", { name: "Fred Meyer" })).toBeChecked();
  await dairy.getByRole("radio", { name: "Costco" }).check();
  await expect(dairy.getByRole("radio", { name: "Costco" })).toBeChecked();
  const sb = await clientFor(email);
  await expect
    .poll(async () => (await sb.from("households").select("category_store")).data?.[0]?.category_store)
    .toEqual({ dairy: "costco" });

  const staples = page.getByRole("region", { name: "Staples" });
  await staples.getByRole("button", { name: "+ Add staple" }).click();
  await staples.getByLabel("Name").fill("Milk");
  await staples.getByLabel("Amount").fill("1");
  await staples.getByLabel("Unit").fill("gallon");
  await staples.getByLabel("Type").selectOption({ label: "Dairy" });
  await staples.getByRole("button", { name: "Save staple" }).click();
  await expect(staples.getByTestId("staple-row")).toHaveCount(1);

  const always = page.getByRole("region", { name: "Always have" });
  await expect(always.getByRole("button", { name: "Add salt" })).toBeVisible(); // suggested once
  await always.getByRole("button", { name: "Add salt" }).click();
  await expect(always.getByRole("button", { name: "Remove salt" })).toBeVisible();
  await always.getByLabel("Add something you always have").fill("Black pepper");
  await always.getByRole("button", { name: "Add", exact: true }).click();
  await expect(always.getByRole("button", { name: "Remove black pepper" })).toBeVisible();
  await page.screenshot({ path: `${shots}/household-stores.png`, fullPage: true });

  // The staple lands in the Costco tab, because Dairy comes from Costco.
  await openListFromHousehold(page);
  await expect(page.getByRole("tab", { name: /^Costco.*· 1$/ })).toBeVisible();
  await page.getByRole("tab", { name: /^Costco/ }).click();
  await expect(row(page, "Milk")).toBeVisible();

  // Always-have items are skipped by name.
  await page.goto("/household");
  await always.getByLabel("Add something you always have").fill("milk");
  await always.getByRole("button", { name: "Add", exact: true }).click();
  await openListFromHousehold(page);
  await page.getByRole("tab", { name: /^Costco.*· 0$/ }).click();
  await page.getByTestId("skipped").locator("summary").click();
  await expect(page.getByTestId("skipped").getByTestId("list-row").filter({ hasText: "Milk" })).toBeVisible();

  // Turning a staple off takes it away entirely.
  await page.goto("/household");
  await always.getByRole("button", { name: "Remove milk" }).click();
  await page.getByRole("switch", { name: "Milk" }).uncheck();
  await openListFromHousehold(page);
  await expect(page.getByText("Your list is clear.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Plan this week" })).toHaveAttribute("href", "/week");
});

test("sign out: the saved list is wiped, and offline the next person sees none of it", async ({ page, context }) => {
  await createHousehold(page);
  await planTacos(page);
  await openList(page);
  await expect(row(page, "Yellow onion")).toBeVisible();
  await expect(page.locator('[data-offline-ready="on"]')).toBeAttached({ timeout: 15_000 });
  const before = await page.evaluate(async () => ({
    keys: Object.keys(localStorage).filter((k) => /^list/.test(k)),
    caches: await caches.keys(),
  }));
  expect(before.keys.length).toBeGreaterThan(0);
  expect(before.caches).toContain("basket-offline-v1");

  await page.goto("/household");
  const out = page.getByRole("button", { name: "Sign out" });
  const box = await out.boundingBox();
  expect(box && box.height >= 44).toBe(true);
  await out.click();
  await expect(page).toHaveURL(/\/login/);

  const after = await page.evaluate(async () => ({
    keys: Object.keys(localStorage).filter((k) => /^(list|add-meal:)/.test(k)),
    // Scripts may be saved again by the login page; the list page itself must be gone.
    page: await caches.open("basket-offline-v1").then((c) => c.match("/list")).then((r) => !!r),
  }));
  expect(after.keys).toEqual([]);
  expect(after.page).toBe(false);

  // Offline, /list has nothing saved to show: the page can't open at all.
  await context.setOffline(true);
  await expect(page.goto("/list")).rejects.toThrow();
  await context.setOffline(false);
  // Online it sends a signed-out visitor to the login page.
  await page.goto("/list");
  await expect(page).toHaveURL(/\/login/);
});

const checkAll = (page: Page): Locator => page.getByRole("button", { name: /^Check off all \(\d+\)$/ });

test("check off all: ticks this store only, skips I-have-it, and Undo puts back just those", async ({ page }) => {
  await createHousehold(page);
  await planTacos(page);
  await openList(page);

  // Corn tortillas move to Amazon; the onion is already in the house; the beans were ticked by hand.
  await (await openSheet(page, "Corn tortillas")).getByRole("button", { name: "Move to Amazon" }).click();
  await (await openSheet(page, "Yellow onion")).getByRole("button", { name: "I have it" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Got Black beans" }).check();

  const button = checkAll(page);
  await expect(button).toHaveText("Check off all (1)"); // chicken only
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const before = await dollars(total(page));
  await button.click();

  const message = page.getByTestId("check-all-undo");
  await expect(message).toContainText("Checked off 1 item");
  await expect(page.getByRole("status").filter({ hasText: "Checked off 1 item" })).toBeVisible();
  await expect(button).toHaveCount(0);
  await expect(row(page, "Boneless chicken thighs")).toHaveAttribute("data-checked", "true");
  await expect(row(page, "Black beans")).toHaveAttribute("data-checked", "true");
  expect(await dollars(total(page))).toBe(before); // ticking never changes the estimate
  await expect(page.getByRole("tab", { name: /^Fred Meyer.*· 2$/ })).toBeVisible();

  // The other tab is untouched.
  await page.getByRole("tab", { name: /^Amazon/ }).click();
  await expect(row(page, "Corn tortillas")).not.toHaveAttribute("data-checked", "true");
  await expect(checkAll(page)).toHaveText("Check off all (1)");

  // Undo unticks the chicken, not the beans that were ticked before.
  await page.getByRole("tab", { name: /^Fred Meyer/ }).click();
  await message.getByRole("button", { name: "Undo" }).click();
  await expect(message).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Got Boneless chicken thighs" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Got Black beans" })).toBeChecked();
  await expect(checkAll(page)).toHaveText("Check off all (1)");

  // A row still works by itself afterwards, and the skipped onion stayed unchecked.
  await page.getByRole("checkbox", { name: "Got Boneless chicken thighs" }).check();
  await expect(row(page, "Boneless chicken thighs")).toHaveAttribute("data-checked", "true");
  await expect(checkAll(page)).toHaveCount(0);
  await page.getByTestId("skipped").locator("summary").click();
  await expect(page.getByRole("checkbox", { name: "Got Yellow onion" })).not.toBeChecked();

  // It lasts: reload shows the same.
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Got Black beans" })).toBeChecked();
  await expect(checkAll(page)).toHaveCount(0);
});

test("check off all works offline, and Undo too, then everything is sent", async ({ page, context }) => {
  const email = await createHousehold(page);
  await planTacos(page);
  await openList(page);
  await expect(page.getByTestId("list-row")).toHaveCount(4);
  await expect(page.locator('[data-offline-ready="on"]')).toBeAttached({ timeout: 15_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Offline. Showing your last list.")).toBeVisible();

  await checkAll(page).click();
  await expect(page.getByTestId("check-all-undo")).toContainText("Checked off 4 items");
  await expect(page.locator('[data-testid="list-row"][data-checked="true"]')).toHaveCount(4);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator('[data-testid="list-row"][data-checked="true"]')).toHaveCount(0);
  await checkAll(page).click();
  await expect(page.locator('[data-testid="list-row"][data-checked="true"]')).toHaveCount(4);

  await context.setOffline(false);
  await expect(page.getByText("Offline. Showing your last list.")).toHaveCount(0, { timeout: 15_000 });
  const sb = await clientFor(email);
  await expect
    .poll(async () => (await sb.from("week_item_state").select("checked").eq("checked", true)).data?.length)
    .toBe(4);
});

test("a ticked item moves to Got it", async ({ page }) => {
  await createHousehold(page);
  await planTacos(page);
  await openList(page);
  await expect(page.getByTestId("list-row")).toHaveCount(4);

  const produce = page.getByRole("region", { name: "Produce" });
  await expect(produce.getByTestId("list-row").filter({ hasText: "Yellow onion" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Got it/ })).toHaveCount(0);

  await page.getByRole("checkbox", { name: "Got Yellow onion" }).check();
  const gotIt = page.getByRole("region", { name: /^Got it · 1$/ });
  await expect(gotIt.getByTestId("list-row").filter({ hasText: "Yellow onion" })).toHaveAttribute("data-checked", "true");
  // The aisle it left has nothing else in it, so the heading goes too.
  await expect(page.getByRole("heading", { name: "Produce" })).toHaveCount(0);
  // The group sits below the aisles and above the skipped ones.
  const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
  expect(headings[headings.length - 1]).toBe("Got it · 1");

  // Unticking puts it back in its aisle.
  await page.getByRole("checkbox", { name: "Got Yellow onion" }).uncheck();
  await expect(page.getByRole("region", { name: "Produce" }).getByTestId("list-row").filter({ hasText: "Yellow onion" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Got it/ })).toHaveCount(0);
});

test("prices stay on one line beside a four-line product name at 360 px", async ({ page }) => {
  await createHousehold(page);
  await chooseStore(page);
  await planTacos(page);
  await openList(page);
  await page.setViewportSize({ width: 360, height: 800 });
  const beans = row(page, "Black beans");
  await expect(beans.getByTestId("row-count")).toBeVisible();

  // Give the row a product name far longer than it can hold, with its line limits off so it really takes four lines or more.
  await beans.evaluate((li) => {
    const long = "Simple Truth Organic Reduced Sodium Slow Cooked Black Beans With Roasted Garlic And Smoked Paprika, Family Size Value Pack, 6 Count Case";
    const name = li.querySelector(".line-clamp-2") as HTMLElement;
    const line = li.querySelector(".line-clamp-1") as HTMLElement;
    for (const el of [name, line]) {
      el.classList.remove("line-clamp-1", "line-clamp-2");
      el.textContent = long;
    }
  });
  const text = (await beans.locator("button").first().boundingBox())!;
  expect(text.height).toBeGreaterThanOrEqual(4 * 16); // at least four lines tall
  for (const id of ["row-total", "row-count"]) {
    const box = (await beans.getByTestId(id).boundingBox())!;
    expect(box.height, `${id} wrapped`).toBeLessThanOrEqual(24);
    expect(box.x + box.width, `${id} ran off the screen`).toBeLessThanOrEqual(360);
  }
  const rowBox = (await beans.boundingBox())!;
  const totalBox = (await beans.getByTestId("row-total").boundingBox())!;
  expect(totalBox.x).toBeGreaterThan(rowBox.x + rowBox.width / 2); // the price column is on the right, not squeezed under the name
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

/** Plans tacos, opens the list, waits for it to be saved for offline use, goes offline on a reloaded page, and ticks the onion. */
async function tickOffline(page: Page, context: import("@playwright/test").BrowserContext) {
  await createHousehold(page);
  await planTacos(page);
  await openList(page);
  await expect(page.getByTestId("list-row")).toHaveCount(4);
  await expect(page.locator('[data-offline-ready="on"]')).toBeAttached({ timeout: 15_000 });
  // The clock is installed before the offline reload, so the next look for a signal is ours to step.
  await page.clock.install();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Offline. Showing your last list.")).toBeVisible();
  await page.getByRole("checkbox", { name: "Got Yellow onion" }).check();
  await expect(page.getByRole("checkbox", { name: "Got Yellow onion" })).toBeChecked();
}

test("back online says Saved only when the queue emptied", async ({ page, context }) => {
  await tickOffline(page, context);
  await context.setOffline(false);
  // The list looks for a signal again after 5 seconds.
  await page.clock.runFor(12_000);
  const saved = page.getByText("Back online. Saved.");
  await expect(saved).toBeVisible();
  await expect(page.getByText("Offline. Showing your last list.")).toHaveCount(0);
  // It says so for two seconds, then goes.
  await page.clock.runFor(2500);
  await expect(saved).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Got Yellow onion" })).toBeChecked();
});

test("back online says only Back online when the server refused a change", async ({ page, context }) => {
  await tickOffline(page, context);
  // Every write is refused as bad data (a real answer, not a dropped connection).
  await page.route("**/rest/v1/week_item_state*", (route) =>
    route.request().method() === "GET"
      ? route.continue()
      : route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "23514", message: "refused", details: null, hint: null }) }),
  );
  await context.setOffline(false);
  await page.clock.runFor(12_000);
  await expect(page.getByText("Back online.", { exact: true })).toBeVisible();
  await expect(page.getByText("Back online. Saved.")).toHaveCount(0);
  await page.clock.runFor(2500);
  await expect(page.getByText("Back online.", { exact: true })).toHaveCount(0);
});

test("the stale-prices line and the offline line can show together", async ({ page, context }) => {
  await createHousehold(page);
  await chooseStore(page);
  // Every Fred Meyer lookup fails, so the prices on screen may be old.
  await page.route("**/api/kroger/match", (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
  await planTacos(page);
  await openList(page);
  const stale = page.getByText("Fred Meyer prices may be out of date.");
  await expect(stale).toBeVisible();

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  const offline = page.getByText("Offline. Showing your last list.");
  await expect(offline).toBeVisible();
  await expect(stale).toBeVisible();
  // The offline line comes first.
  const [a, b] = [(await offline.boundingBox())!, (await stale.boundingBox())!];
  expect(a.y).toBeLessThan(b.y);
});

test("Check off all shows Undo without moving the list", async ({ page }) => {
  await createHousehold(page);
  await planTacos(page);
  await openList(page);
  await expect(page.getByTestId("list-row")).toHaveCount(4);

  const first = page.getByTestId("list-row").first();
  const button = checkAll(page);
  const topBefore = (await first.boundingBox())!.y;
  const buttonBox = (await button.boundingBox())!;
  await button.click();

  const toast = page.getByTestId("check-all-undo");
  await expect(toast).toContainText("Checked off 4 items");
  // The message floats over the page: it is not inside the list, and it takes no room in it.
  expect(await toast.evaluate((el) => getComputedStyle(el.parentElement!).position)).toBe("fixed");
  await expect(page.getByRole("tabpanel").getByTestId("check-all-undo")).toHaveCount(0);
  // The first row only moves up (by the button that went away), never down by a message.
  const topAfter = (await page.getByTestId("list-row").first().boundingBox())!.y;
  expect(topAfter).toBeLessThanOrEqual(topBefore + 1);
  expect(topBefore - topAfter).toBeLessThanOrEqual(buttonBox.height + 24);
  await expect(page.getByRole("region", { name: /^Got it · 4$/ })).toBeVisible();
});

test("an Amazon row with no price links to the store search", async ({ page }) => {
  await createHousehold(page);
  await planTacos(page);
  await openList(page);
  await (await openSheet(page, "Corn tortillas")).getByRole("button", { name: "Move to Amazon" }).click();
  await page.getByRole("tab", { name: /^Amazon/ }).click();

  const tortillas = row(page, "Corn tortillas");
  const link = tortillas.getByRole("link", { name: "Search Amazon" });
  await expect(link).toHaveAttribute("href", "https://www.amazon.com/s?k=corn%20tortillas");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // It stands where the price would be: the row has no price, and the link sits beside the row's own button, not inside it.
  await expect(tortillas.getByTestId("row-total")).toHaveCount(0);
  await expect(tortillas.locator("button a")).toHaveCount(0);
  // The name still opens the item sheet.
  await tortillas.getByRole("button", { name: /^Corn tortillas/ }).click();
  await expect(page.getByRole("dialog", { name: "Corn tortillas" })).toBeVisible();
});
