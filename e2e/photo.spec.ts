import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createHousehold } from "./helpers/household";
import { FOOD_JPG, routeFoodImages } from "./helpers/fixtures";
import { pinToday } from "./helpers/clock";
import { seedDinnerOnDay } from "./helpers/flows-a";

// The app registers its service worker on every screen; WebKit lets requests from a worker-controlled
// page skip page.route, and these tests hold and fail pictures on purpose.
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await routeFoodImages(page, { failing: /gone\.jpg/ });
  await pinToday(page, "wed");
});

test("a photo that fails to load shows Add a photo and no image in the tile", async ({ page }) => {
  const email = await createHousehold(page);
  await seedDinnerOnDay(email, "thu", { name: "Soup without a photo", photoUrl: "https://images.example.test/gone.jpg" });
  await page.reload();
  const tile = page.getByTestId("day-row-thu");
  await expect(tile).toContainText("Soup without a photo");
  await expect(tile.getByText("Add a photo")).toBeVisible();
  await expect(tile.locator("img")).toHaveCount(0);
  await expect(tile.locator("[data-photo-state='fallback']")).toBeVisible();
});

test("a photo still loading holds the tile's size, then fades in", async ({ page }) => {
  const email = await createHousehold(page);
  await seedDinnerOnDay(email, "thu", { name: "Soup A", photoUrl: "https://images.example.test/held.jpg", width: 400 });
  await seedDinnerOnDay(email, "fri", { name: "Soup B", photoUrl: "https://images.example.test/loaded.jpg", width: 400 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("https://images.example.test/held.jpg", async (route) => {
    await gate;
    await route.fulfill({ status: 200, contentType: "image/jpeg", body: readFileSync(FOOD_JPG) });
  });
  await page.reload();
  const held = page.getByTestId("day-row-thu");
  const loaded = page.getByTestId("day-row-fri");
  await expect(loaded.locator("[data-photo-state='ready']")).toBeVisible();
  await expect(held.locator("[data-photo-state]")).toHaveAttribute("data-photo-state", "loading");
  const heldBox = (await held.boundingBox())!;
  const loadedBox = (await loaded.boundingBox())!;
  expect(Math.abs(heldBox.height - loadedBox.height)).toBeLessThan(1);

  release();
  await expect(held.locator("[data-photo-state]")).toHaveAttribute("data-photo-state", "ready");
  await expect(held.locator("img")).toHaveCSS("opacity", "1");
  expect(Math.abs((await held.boundingBox())!.height - heldBox.height)).toBeLessThan(1);
});
