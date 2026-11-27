import { expect, test, type Page } from "@playwright/test";
import { createHousehold } from "./helpers/household";
import { routeFoodImages } from "./helpers/fixtures";

// Requests from a worker-controlled page can skip page.route on WebKit; keep parity with the other add-meal specs.
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await routeFoodImages(page);
});

const SAFE_WORDS = /\bsafe\b|nut-free|allergen-free|free of|no allergens/i;

/** Daughter (4) is the last person row: a tree nut allergy and a dislike of mushrooms. */
async function listFoods(page: Page) {
  await page.goto("/household");
  await page.getByTestId("person-row").last().click();
  const form = page.getByRole("form", { name: "Edit Daughter" }).last();
  await form.getByRole("button", { name: "+ tree nuts" }).click();
  const food = form.getByLabel("Add a food");
  await food.fill("mushrooms");
  await food.press("Enter");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("person-row").last()).toContainText("Allergy: tree nuts");
}

async function searchFor(page: Page, query: string) {
  await page.getByLabel("What's for dinner?").fill(query);
  await page.getByRole("button", { name: "Search" }).click();
}

test("an allergy shows on the card and the draft, and adding takes a clear second step", async ({ page }) => {
  await createHousehold(page, "add-meal-flags");
  await listFoods(page);

  await page.goto("/week/add?day=thu&slot=dinner");
  await searchFor(page, "pesto pasta");
  const card = page.getByRole("button", { name: /^Basil pesto pasta · Example Kitchen/ });
  await expect(card).toBeVisible();
  const flag = card.getByTestId("result-flag");
  await expect(flag).toHaveCount(1);
  await expect(flag).toHaveAttribute("data-kind", "allergy");
  await expect(flag).toContainText("Tree nut allergy: Daughter (4)");
  await expect(flag).toContainText("Check labels.");
  await expect(card).toHaveAccessibleName(/Tree nut allergy: Daughter \(4\)\..*Check labels\./);

  // The draft marks the ingredient and shows the warning; the main button picks something else.
  await card.click();
  const box = page.getByTestId("allergy-box");
  await expect(box).toBeVisible();
  await expect(box).toContainText("Tree nut allergy: Daughter (4)");
  await expect(box).toContainText("check every label");
  await expect(page.getByRole("listitem").filter({ hasText: "Basil pesto · tree nut" })).toBeVisible();
  const different = page.getByRole("button", { name: "Pick a different dinner" });
  const anyway = page.getByRole("button", { name: "Add to Thursday anyway" });
  await expect(page.getByRole("button", { name: "Add to Thursday", exact: true })).toHaveCount(0);
  const [d, a] = [(await different.boundingBox())!, (await anyway.boundingBox())!];
  expect(d.height).toBeGreaterThanOrEqual(51.5);
  expect(a.height).toBeGreaterThanOrEqual(43.5);
  expect(a.y).toBeGreaterThan(d.y);
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(SAFE_WORDS);

  // "Pick a different dinner" returns to the cards with nothing added.
  await different.click();
  await expect(box).toHaveCount(0);
  await expect(card).toBeVisible();

  // "Add anyway" adds it; the flag stays on the saved favorite.
  await card.click();
  await anyway.click();
  await expect(page).toHaveURL(/\/week$/);
  await page.goto("/favorites");
  const row = page.getByTestId("favorite-row").filter({ hasText: "Basil pesto pasta" });
  await expect(row.getByTestId("result-flag")).toContainText("Tree nut allergy: Daughter (4)");
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(SAFE_WORDS);
});

test("flags on soup cards, results survive a tab switch, and a Favorites + opens the warning", async ({ page }) => {
  await createHousehold(page, "add-meal-flags-2");
  await listFoods(page);

  // Put the pilaf in Favorites by adding it anyway.
  await page.goto("/week/add?day=thu&slot=dinner");
  let searches = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/recipes/search") searches++;
  });
  await searchFor(page, "soup");
  const soup = page.getByRole("button", { name: /^White bean and mushroom soup · Budget Bytes/ });
  await expect(soup.getByTestId("result-flag")).toHaveText("Has cremini mushrooms. Daughter (4) won’t eat them.");
  await expect(soup.getByTestId("result-flag")).toHaveAttribute("data-kind", "dislike");
  const pilaf = page.getByRole("button", { name: /^Broccolini quinoa pilaf with toasted almonds · Example Kitchen/ });
  await expect(pilaf.getByTestId("result-flag")).toContainText("Tree nut allergy: Daughter (4)");
  await expect(pilaf.getByTestId("result-flag")).toContainText("Lists almonds. Check labels.");
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(SAFE_WORDS);

  // Away to Favorites and back: the same cards, and no second search.
  await page.getByRole("tab", { name: "Favorites" }).click();
  await expect(page.getByLabel("What's for dinner?")).toBeHidden();
  await page.getByRole("tab", { name: "Search" }).click();
  await expect(soup).toBeVisible();
  await expect(pilaf).toBeVisible();
  expect(searches).toBe(1);

  await pilaf.click();
  await page.getByRole("button", { name: "Add to Thursday anyway" }).click();
  await expect(page).toHaveURL(/\/week$/);

  // A won't-eat match keeps the one-tap "+"; an allergy match opens the warning first.
  await page.goto("/favorites");
  const row = page.getByTestId("favorite-row").filter({ hasText: "Broccolini quinoa pilaf" });
  await row.getByRole("button", { name: /^Add Broccolini quinoa pilaf with toasted almonds to this week/ }).click();
  const warning = page.getByRole("dialog", { name: "Allergy" });
  await expect(warning.getByTestId("allergy-box")).toContainText("check every label");
  await warning.getByRole("button", { name: "Pick a different dinner" }).click();
  await expect(warning).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Added" })).toHaveCount(0);

  await row.getByRole("button", { name: /^Add Broccolini quinoa pilaf/ }).click();
  await page.getByRole("dialog", { name: "Allergy" }).getByRole("button", { name: "Add to this week anyway" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Added Broccolini quinoa pilaf/ })).toBeVisible();
});
