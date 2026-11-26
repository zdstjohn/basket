import { expect, test } from "@playwright/test";
import { createHousehold } from "./helpers/household";

// Chromium only: service workers and the manifest are checked on the Pixel 7 project.
test.skip(({ browserName }) => browserName !== "chromium", "service worker check runs in Chromium");

test("manifest makes Basket installable", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const m = await res.json();
  expect(m.name).toBe("Basket");
  expect(m.short_name).toBe("Basket");
  expect(m.display).toBe("standalone");
  expect(m.start_url).toBe("/week");
  expect(m.theme_color).toBe("#F7F8F5");
  expect(m.background_color).toBe("#F7F8F5");
  const sizes = m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose ?? "any"}`);
  expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  for (const icon of m.icons) {
    const png = await request.get(icon.src);
    expect(png.status(), icon.src).toBe(200);
    expect(png.headers()["content-type"]).toContain("image/png");
  }
});

test("apple touch icon and viewport-fit are in the page head", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /apple-touch-icon\.png/);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.webmanifest/);
});

test("a service worker registers on /week", async ({ page }) => {
  await createHousehold(page, "pwa");
  await expect(page).toHaveURL(/\/week$/);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toMatch(/\/$/);
  const state = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state);
  expect(state).toBe("activated");
});
