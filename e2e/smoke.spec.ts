import { expect, test } from "@playwright/test";

test("home shows the Basket heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Basket" })).toBeVisible();
});

test("home has no sideways scroll", async ({ page }) => {
  await page.goto("/");
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});
