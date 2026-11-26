import { readFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";

export const FOOD_JPG = path.join(__dirname, "..", "fixtures", "food.jpg");

/** Every recipe photo in the fake search comes from images.example.test; serve one small local JPEG. */
export async function routeFoodImages(
  target: Page | BrowserContext,
  opts: { failing?: RegExp } = {},
): Promise<void> {
  const body = readFileSync(FOOD_JPG);
  await target.route("https://images.example.test/**", (route) => {
    if (opts.failing?.test(route.request().url())) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, contentType: "image/jpeg", body });
  });
}
