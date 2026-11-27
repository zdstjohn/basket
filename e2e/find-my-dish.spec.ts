import { expect, test, type Page } from "@playwright/test";
import { createHousehold } from "./helpers/household";
import { FOOD_JPG, routeFoodImages } from "./helpers/fixtures";

const SIGNED_PHOTO = /\/storage\/v1\/object\/sign\/meal-photos\//;

/** Tap the visible "Find my dish" button and choose the photo in the picker. */
async function choosePhoto(page: Page) {
  const button = page.getByRole("button", { name: "Find my dish" });
  await expect(button).toBeVisible();
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), button.click()]);
  await chooser.setFiles(FOOD_JPG);
}

// The app registers its service worker on every screen, and WebKit lets requests from a worker-controlled page
// skip page.route. These tests mock /api/recipes/identify, so they run without the worker.
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await routeFoodImages(page);
});

test("find my dish: photo to recipe cards, then use my photo for the meal", async ({ page }, testInfo) => {
  const shots = `e2e/screenshots/${testInfo.project.name}`;
  await createHousehold(page);
  await page.goto("/week/add?day=thu&slot=dinner");
  await expect(page.getByRole("heading", { name: "Thursday dinner" })).toBeVisible();

  await choosePhoto(page);
  await expect(page.getByText("Looks like: Chicken tacos")).toBeVisible();
  await expect(page.getByAltText("Your dish photo")).toBeVisible();
  await expect(page.getByTestId("result-card").first()).toBeVisible();
  await expect(page.getByLabel("What’s for dinner?")).toHaveValue("chicken tacos");
  await page.screenshot({ path: `${shots}/find-my-dish.png`, fullPage: true });

  // Editing the guess and searching again gives new results.
  await page.getByLabel("What’s for dinner?").fill("beef stew");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("button", { name: "Beef stew · Budget Bytes" })).toBeVisible();

  await page.getByLabel("What’s for dinner?").fill("chicken tacos");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Chicken tacos · Allrecipes" }).click();
  const draft = page.getByRole("region", { name: "Draft recipe" });
  await expect(draft).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Use my photo for this meal" })).toBeChecked();
  await expect(draft.locator("img").first()).toHaveAttribute("src", /^blob:/);
  await expect(page.getByText("Your photo", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add to Thursday" }).click();
  await expect(page).toHaveURL(/\/week$/);
  const thu = page.getByTestId("day-row-thu");
  await expect(thu).toContainText("Chicken tacos");
  await expect(thu.locator("img")).toHaveAttribute("src", SIGNED_PHOTO, { timeout: 15_000 });
});

test("find my dish: unchecking keeps the recipe's own photo", async ({ page }) => {
  await createHousehold(page);
  await page.goto("/week/add?day=fri&slot=dinner");
  await choosePhoto(page);
  await page.getByRole("button", { name: "Chicken tacos · Allrecipes" }).click();
  await page.getByRole("checkbox", { name: "Use my photo for this meal" }).uncheck();
  await expect(page.getByText("Photo: Allrecipes")).toBeVisible();
  await page.getByRole("button", { name: "Add to Friday" }).click();
  await expect(page).toHaveURL(/\/week$/);
  await expect(page.getByTestId("day-row-fri").locator("img")).toHaveAttribute(
    "src",
    "https://images.example.test/tacos.jpg",
  );
});

test("find my dish: not a dish, a low-confidence guess, and the monthly limit", async ({ page }) => {
  await createHousehold(page);
  await page.goto("/week/add?day=mon&slot=dinner");

  const answer = (guess: object) => (route: import("@playwright/test").Route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ guess, options: [], source: "sites", fellBack: false, toppedUp: false }),
    });

  await page.route("**/api/recipes/identify", answer({ isFood: false, dish: "", searchQuery: "", keyIngredients: [], confidence: "low" }));
  await choosePhoto(page);
  await expect(page.getByText("That doesn’t look like a dish. Try another photo.")).toBeVisible();
  await expect(page.getByTestId("result-card")).toHaveCount(0);

  await page.unroute("**/api/recipes/identify");
  await page.route("**/api/recipes/identify", answer({ isFood: true, dish: "Chicken tacos", searchQuery: "tacos", keyIngredients: [], confidence: "low" }));
  await choosePhoto(page);
  await expect(page.getByText("Not sure? Edit the name and search again.")).toBeVisible();

  await page.unroute("**/api/recipes/identify");
  await page.route("**/api/recipes/identify", (route) =>
    route.fulfill({ status: 402, contentType: "application/json", body: '{"error":"cap_reached"}' }),
  );
  await choosePhoto(page);
  await expect(
    page.getByText("This month’s recipe help is used up. You can still type the ingredients in."),
  ).toBeVisible();
  await expect(page.getByLabel("What’s for dinner?")).toBeVisible();
});

test("find my dish: the labelled button fits a 360 px screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await createHousehold(page);
  await page.goto("/week/add?day=mon&slot=dinner");
  const button = page.getByRole("button", { name: "Find my dish" });
  await expect(button).toBeVisible();
  const box = (await button.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.screenshot({ path: "e2e/screenshots/find-my-dish-360.png", fullPage: true });
});
