import { expect, test, type Page } from "@playwright/test";
import { createHousehold } from "./helpers/household";
import { routeFoodImages } from "./helpers/fixtures";

// Requests from a worker-controlled page can skip page.route on WebKit; these tests hold /api/meals/draft.
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await routeFoodImages(page);
});

const TACOS = { name: "Chicken tacos · Allrecipes" };

async function searchTacos(page: Page) {
  await page.goto("/week/add?day=thu&slot=dinner");
  await page.getByLabel("What’s for dinner?").fill("tacos");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("button", TACOS)).toBeVisible();
}

/** How many elements carry a view-transition-name right now (the page's own root, which the browser names, is not counted). */
const named = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll("body, body *")].filter((el) => getComputedStyle(el).viewTransitionName !== "none").length,
  );

test("a picked result shows its photo and title before the draft arrives", async ({ page }) => {
  await createHousehold(page);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/meals/draft", async (route) => {
    await held;
    await route.continue();
  });
  await searchTacos(page);
  await page.getByRole("button", TACOS).click();

  const draft = page.getByRole("region", { name: "Draft recipe" });
  await expect(draft).toBeVisible();
  await expect(draft.locator("img").first()).toHaveAttribute("src", "https://images.example.test/tacos.jpg");
  await expect(draft.getByRole("heading", { name: "Chicken tacos" })).toBeVisible();
  await expect(draft.getByRole("status").filter({ hasText: "Reading the recipe…" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to Thursday" })).toBeDisabled();

  release();
  await expect(draft.getByRole("button", { name: "Edit ingredients" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to Thursday" })).toBeEnabled();
  await expect.poll(() => named(page)).toBe(0);
});

test("Not this one returns to the results", async ({ page }) => {
  await createHousehold(page);
  await searchTacos(page);
  await page.getByRole("button", TACOS).click();
  await expect(page.getByRole("region", { name: "Draft recipe" }).getByRole("button", { name: "Edit ingredients" })).toBeVisible();

  await page.getByRole("button", { name: "Not this one" }).click();
  await expect(page.getByRole("region", { name: "Draft recipe" })).toHaveCount(0);
  await expect(page.getByRole("button", TACOS)).toBeVisible();
  await expect(page.getByRole("tab", { name: "Search" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to Thursday" })).toHaveCount(0);
  await expect.poll(() => named(page)).toBe(0);
});

test("a double tap on a result leaves no view-transition-name", async ({ page }) => {
  await createHousehold(page);
  await searchTacos(page);
  await page.getByRole("button", TACOS).dblclick();
  const draft = page.getByRole("region", { name: "Draft recipe" });
  await expect(draft.getByRole("button", { name: "Edit ingredients" })).toBeVisible();
  await expect.poll(() => named(page)).toBe(0);

  // Going back, then picking again straight away, also leaves nothing named.
  await page.getByRole("button", { name: "Not this one" }).click();
  await expect(page.getByRole("button", TACOS)).toBeVisible();
  await expect.poll(() => named(page)).toBe(0);
});

test("under reduced motion the page opens with no photo travel", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await createHousehold(page);
  await searchTacos(page);
  await page.getByRole("button", TACOS).click();
  await expect(page.getByRole("region", { name: "Draft recipe" })).toBeVisible();
  await expect.poll(() => named(page)).toBe(0);
  // The hero is a plain image with no reveal animation on it.
  const animation = await page.getByRole("region", { name: "Draft recipe" }).locator("img").first().evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe("none");
});
