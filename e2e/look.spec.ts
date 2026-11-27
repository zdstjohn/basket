import { expect, test, type Page } from "@playwright/test";
import { createHousehold } from "./helpers/household";

const DARK = "#191614";
const LIGHT = "#F5E6A6";

const themeColors = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute("content")));

test("auto follows the phone", async ({ browser }) => {
  for (const [scheme, bg] of [
    ["dark", "rgb(25, 22, 20)"],
    ["light", "rgb(245, 230, 166)"],
  ] as const) {
    const context = await browser.newContext({ colorScheme: scheme });
    const page = await context.newPage();
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-look", "auto");
    await expect(page.locator("html")).toHaveCSS("background-color", bg);
    await context.close();
  }
});

test("choosing Dark sticks, sets the status bar color, and does not flash on reload", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __lookAtBody?: string };
    const watch = new MutationObserver(() => {
      if (document.body && w.__lookAtBody === undefined) {
        w.__lookAtBody = document.documentElement.dataset.look ?? "";
        watch.disconnect();
      }
    });
    watch.observe(document, { childList: true, subtree: true });
  });
  await createHousehold(page, "look-dark");
  await page.goto("/household");
  await page.getByRole("radio", { name: "Dark" }).check();

  await expect(page.locator("html")).toHaveAttribute("data-look", "dark");
  expect(await page.evaluate(() => localStorage.getItem("basket:look"))).toBe("dark");
  expect((await themeColors(page)).length).toBeGreaterThan(0);
  expect(new Set(await themeColors(page))).toEqual(new Set([DARK]));

  await page.reload();
  expect(await page.evaluate(() => (window as unknown as { __lookAtBody?: string }).__lookAtBody)).toBe("dark");
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
});

test("the status bar color survives a tap on the tab bar", async ({ page }) => {
  await createHousehold(page, "look-nav");
  await page.goto("/household");
  await page.getByRole("radio", { name: "Dark" }).check();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "List" }).click();
  await expect(page).toHaveURL(/\/list/);
  await expect.poll(async () => new Set(await themeColors(page)).size === 1 && (await themeColors(page))[0]).toBe(DARK);
  await expect(page.locator("html")).toHaveAttribute("data-look", "dark");
});

test("a junk stored value behaves as Match my phone", async ({ page }) => {
  await createHousehold(page, "look-junk");
  await page.evaluate(() => localStorage.setItem("basket:look", "purple"));
  await page.goto("/household");
  await expect(page.locator("html")).toHaveAttribute("data-look", "auto");
  await expect(page.getByRole("radio", { name: "Match my phone" })).toBeChecked();
});

test("a second tab follows the choice", async ({ page, context }) => {
  await createHousehold(page, "look-tabs");
  await page.goto("/household");
  const other = await context.newPage();
  await other.goto("/household");
  await expect(other.locator("html")).toHaveAttribute("data-look", "auto");

  await page.getByRole("radio", { name: "Light" }).check();
  await expect(other.locator("html")).toHaveAttribute("data-look", "light");
  await expect(other.getByRole("radio", { name: "Light" })).toBeChecked();
  expect(new Set(await themeColors(other))).toEqual(new Set([LIGHT]));
});
