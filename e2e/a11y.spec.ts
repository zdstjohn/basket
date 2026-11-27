import { expect, test } from "@playwright/test";
import { createHousehold } from "./helpers/household";

test("the tab bar draws only Lucide icons", async ({ page }) => {
  await createHousehold(page, "a11y-nav");
  const nav = page.locator('nav[aria-label="Main"]');
  await expect(nav.locator("svg.lucide")).toHaveCount(4);
  await expect(nav.locator("svg:not(.lucide)")).toHaveCount(0);
});

// Every tab says where you are in the browser's title and the screen reader's page name. Passes once the screens set their titles.
test.fixme("document.title differs between the four tabs (enabled in C2)", async ({ page }) => {
  await createHousehold(page, "a11y-title");
  const nav = page.getByRole("navigation", { name: "Main" });
  const titles: string[] = [];
  for (const [name, url] of [
    ["This week", /\/week$/],
    ["Favorites", /\/favorites$/],
    ["List", /\/list$/],
    ["Household", /\/household$/],
  ] as const) {
    await nav.getByRole("link", { name }).click();
    await expect(page).toHaveURL(url);
    titles.push(await page.title());
  }
  expect(new Set(titles).size).toBe(4);
});
