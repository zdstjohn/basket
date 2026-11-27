import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";
import { createHousehold } from "./helpers/household";
import { routeFoodImages } from "./helpers/fixtures";
import { addFromSearch } from "./helpers/flows-a";
import { openItemSheet, openList } from "./helpers/flows-b";

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await routeFoodImages(page);
});

/** A household with one planned dinner, its list, and the sheet of one list row. B owns what is inside it. */
async function openSheet(page: Page): Promise<Locator> {
  await createHousehold(page);
  await addFromSearch(page, { day: "thu", query: "tacos", pick: "Chicken tacos · Allrecipes" });
  await openList(page);
  return openItemSheet(page, "Yellow onion");
}

const panel = (page: Page) => page.getByTestId("sheet-panel");
const zone = (page: Page) => page.getByTestId("sheet-drag");
const transform = (page: Page) => panel(page).evaluate((el) => getComputedStyle(el).transform);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Holds the drag zone, moves down in even steps over `ms`, and releases. */
async function dragZone(page: Page, dy: number, ms: number, steps: number, { release = true } = {}) {
  const box = (await zone(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x, y + (dy * i) / steps);
    if (ms > 0) await sleep(ms / steps);
  }
  if (release) await page.mouse.up();
}

test("a short slow drag springs back", async ({ page }) => {
  await openSheet(page);
  await dragZone(page, 60, 400, 10);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(() => transform(page)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
});

test("the sheet follows the finger 1:1 while held, and never rises above its place", async ({ page }) => {
  await openSheet(page);
  await dragZone(page, 50, 100, 5, { release: false });
  await expect.poll(() => panel(page).evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)).toBeCloseTo(50, 0);
  const box = (await zone(page).boundingBox())!;
  await page.mouse.move(box.x + 20, box.y - 200);
  await expect.poll(() => transform(page)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  await page.mouse.up();
});

test("a drag past 30% dismisses", async ({ page }) => {
  await openSheet(page);
  const h = (await panel(page).boundingBox())!.height;
  await dragZone(page, Math.ceil(h * 0.4), 600, 12);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a quick flick dismisses", async ({ page }) => {
  await openSheet(page);
  await dragZone(page, 80, 0, 4);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a flick, a pause, then release does not dismiss", async ({ page }) => {
  await openSheet(page);
  await dragZone(page, 60, 0, 3, { release: false });
  await sleep(400);
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toBeVisible();
});

async function cdpTouch(cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
}

async function touchDrag(page: Page, from: { x: number; y: number }, dy: number, ms: number, steps: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdpTouch(cdp, "touchStart", from.x, from.y);
  for (let i = 1; i <= steps; i++) {
    await cdpTouch(cdp, "touchMove", from.x, from.y + (dy * i) / steps);
    await sleep(ms / steps);
  }
  await cdpTouch(cdp, "touchEnd", from.x, from.y + dy);
}

test("a touch drag on the content dismisses (pixel-7 only)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "pixel-7", "CDP touch input is Chromium only");
  await openSheet(page);
  const scroll = page.getByTestId("sheet-scroll");
  expect(await scroll.evaluate((el) => el.scrollTop)).toBe(0);
  const box = (await scroll.boundingBox())!;
  const h = (await panel(page).boundingBox())!.height;
  await touchDrag(page, { x: box.x + box.width / 2, y: box.y + 8 }, Math.ceil(h * 0.45), 500, 15);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a touch drag on scrolled content scrolls and does not move the sheet (pixel-7 only)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "pixel-7", "CDP touch input is Chromium only");
  await openSheet(page);
  const scroll = page.getByTestId("sheet-scroll");
  await scroll.evaluate((el) => {
    const filler = document.createElement("div");
    filler.style.height = "2000px";
    el.appendChild(filler);
    el.scrollTop = 150;
  });
  const box = (await scroll.boundingBox())!;
  await touchDrag(page, { x: box.x + box.width / 2, y: box.y + 20 }, 100, 300, 10);
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await transform(page)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  expect(await scroll.evaluate((el) => el.scrollTop)).toBeLessThan(150);
});

test("Escape, a second Escape and the backdrop all close it once", async ({ page }) => {
  await openSheet(page);
  // The list screen closes the sheet by unmounting it; count how often the dialog is removed.
  await page.evaluate(() => {
    (window as unknown as { __closes: number }).__closes = 0;
    new MutationObserver((records) => {
      for (const r of records) r.removedNodes.forEach((n) => {
        if (n instanceof HTMLElement && n.tagName === "DIALOG") (window as unknown as { __closes: number }).__closes++;
      });
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __closes: number }).__closes)).toBe(1);

  const again = await openItemSheet(page, "Yellow onion");
  await page.mouse.click(5, 5);
  await expect(again).toHaveCount(0);
  await expect(page.getByTestId("list-row").filter({ hasText: "Yellow onion" })).toBeVisible();
});

test("with reduced motion the sheet fades and never translates", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ ...testInfo.project.use, reducedMotion: "reduce" });
  const page = await context.newPage();
  await routeFoodImages(page);
  await createHousehold(page);
  await addFromSearch(page, { day: "thu", query: "tacos", pick: "Chicken tacos · Allrecipes" });
  await openList(page);
  await page.evaluate(() => {
    const w = window as unknown as { __seen: string[] };
    w.__seen = [];
    const tick = () => {
      const el = document.querySelector("[data-testid=sheet-panel]");
      if (el) w.__seen.push(getComputedStyle(el).transform + "|" + getComputedStyle(el).opacity);
      requestAnimationFrame(tick);
    };
    tick();
  });
  const sheet = await openItemSheet(page, "Yellow onion");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
  expect(seen.length).toBeGreaterThan(0);
  for (const s of seen) expect(s.split("|")[0]).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  expect(seen.some((s) => Number(s.split("|")[1]) < 1)).toBe(true);
  await context.close();
});

test("a tap on the backdrop during the enter animation closes it", async ({ page }) => {
  await createHousehold(page);
  await addFromSearch(page, { day: "thu", query: "tacos", pick: "Chicken tacos · Allrecipes" });
  await openList(page);
  const row = page.getByTestId("list-row").filter({ hasText: "Yellow onion" });
  await row.getByRole("button", { name: /Yellow onion/ }).click();
  await sleep(50);
  // Dispatched, not clicked: Playwright would wait for the animation to settle first.
  await page.getByTestId("sheet-scrim").dispatchEvent("click");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
