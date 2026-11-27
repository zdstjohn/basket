import { readFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";

export const FOOD_JPG = path.join(__dirname, "..", "fixtures", "food.jpg");
/** The same picture at 250 x 125: under the 300 px a tile needs. */
export const FOOD_SMALL_JPG = path.join(__dirname, "..", "fixtures", "food-small.jpg");
/** The same picture at 800 x 400: wide enough to lead the week as the hero. */
export const FOOD_WIDE_JPG = path.join(__dirname, "..", "fixtures", "food-wide.jpg");

/** Every recipe photo in the fake search comes from images.example.test; serve one small local JPEG. */
export async function routeFoodImages(
  target: Page | BrowserContext,
  opts: { failing?: RegExp; wide?: RegExp; tiny?: RegExp } = {},
): Promise<void> {
  const body = readFileSync(FOOD_JPG);
  const wide = readFileSync(FOOD_WIDE_JPG);
  const tiny = readFileSync(FOOD_SMALL_JPG);
  await target.route("https://images.example.test/**", (route) => {
    const url = route.request().url();
    if (opts.failing?.test(url)) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, contentType: "image/jpeg", body: opts.wide?.test(url) ? wide : opts.tiny?.test(url) ? tiny : body });
  });
  // The server cannot reach images.example.test, so its preview route would mark every photo unreadable.
  // The week writes each photo's width itself once the picture loads, which is what these tests read.
  await target.route("**/api/meals/preview", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preview: null, width: null }) }),
  );
}
