import { expect, test, type Page } from "@playwright/test";
import { createHousehold } from "./helpers/household";
import { routeFoodImages } from "./helpers/fixtures";
import { clientFor } from "./helpers/db";
import { addFromSearch } from "./helpers/flows-a";
import { listTotal, openItemSheet, openList } from "./helpers/flows-b";
import { rollDigits } from "../lib/motion/roll";

// Motion of the shopping list: the strike, the move to "Got it", the rolling total. The clock is driven by hand
// (page.clock) and the page's own DOM is logged by a MutationObserver, so nothing here waits on wall-clock time.

test.beforeEach(async ({ page }) => {
  await routeFoodImages(page);
});

async function tacosList(page: Page): Promise<string> {
  const email = await createHousehold(page);
  await addFromSearch(page, { day: "thu", query: "tacos", pick: "Chicken tacos · Allrecipes" });
  await openList(page);
  await expect(page.getByTestId("list-row")).toHaveCount(4);
  return email;
}

const row = (page: Page, name: string) => page.getByTestId("list-row").filter({ hasText: name });
const gotIt = (page: Page) => page.getByRole("region", { name: /^Got it · \d+$/ });
const tickBox = (page: Page, name: string) => page.getByRole("checkbox", { name: `Got ${name}` });

/** Logs "strike-on" when a strike overlay gets data-on, and "row-in:got-it" / "row-in:aisle" when a row is mounted. */
async function watch(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __log: string[] };
    w.__log = [];
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "attributes") {
          const t = r.target as Element;
          if (t.classList.contains("bk-strike") && t.hasAttribute("data-on")) w.__log.push("strike-on");
        } else {
          r.addedNodes.forEach((n) => {
            if (!(n instanceof HTMLElement)) return;
            const rows = [...(n.matches('[data-testid="list-row"]') ? [n] : []), ...n.querySelectorAll<HTMLElement>('[data-testid="list-row"]')];
            for (const li of rows) w.__log.push(li.closest("section[aria-labelledby]") ? "row-in:got-it" : "row-in:aisle");
          });
        }
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-on"] });
  });
}
const log = (page: Page) => page.evaluate(() => (window as unknown as { __log: string[] }).__log);

/** Counts Element.animate calls (flip slides) and keeps their keyframes. */
async function recordAnimations(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __anims: Keyframe[][] };
    w.__anims = [];
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, frames: Keyframe[] | PropertyIndexedKeyframes | null, o?: number | KeyframeAnimationOptions) {
      w.__anims.push(Array.isArray(frames) ? frames : []);
      return orig.call(this, frames, o);
    } as typeof Element.prototype.animate;
  });
}
const animations = (page: Page) => page.evaluate(() => (window as unknown as { __anims: Keyframe[][] }).__anims);
// Running, finite animations only: a skeleton pulse or a finished fill-forwards fade is not a move in progress.
const settledDown = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getComputedTiming().endTime !== Infinity).length,
      ),
    )
    .toBe(0);

async function setPrice(page: Page, name: string, price: string) {
  const sheet = await openItemSheet(page, name);
  await sheet.getByRole("button", { name: "Set price" }).click();
  await sheet.getByLabel("Price").fill(price);
  await sheet.getByRole("button", { name: "Save price" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("ticking draws the strike, then the row moves to Got it", async ({ page }) => {
  await tacosList(page);
  await page.clock.install();
  await watch(page);

  await tickBox(page, "Yellow onion").check();
  // At the tap: the row says ticked and the strike is on, but the row has not left its aisle.
  await expect(row(page, "Yellow onion")).toHaveAttribute("data-checked", "true");
  await expect.poll(() => log(page)).toContain("strike-on");
  expect(await log(page)).not.toContain("row-in:got-it");
  await expect(gotIt(page)).toHaveCount(0);
  // The overlay is decoration: hidden from screen readers, over a positioned name.
  const strike = row(page, "Yellow onion").locator(".bk-strike");
  await expect(strike).toHaveAttribute("aria-hidden", "true");
  expect(await strike.evaluate((el) => getComputedStyle(el.parentElement!).position)).toBe("relative");

  await page.clock.runFor(300);
  await expect(gotIt(page).getByTestId("list-row").filter({ hasText: "Yellow onion" })).toHaveAttribute("data-checked", "true");
  const order = await log(page);
  expect(order.indexOf("strike-on")).toBeGreaterThanOrEqual(0);
  expect(order.indexOf("row-in:got-it")).toBeGreaterThan(order.indexOf("strike-on"));
});

test("tick then untick inside 300 ms leaves the row in its aisle, unticked", async ({ page }) => {
  await tacosList(page);
  await page.clock.install();
  await tickBox(page, "Yellow onion").check();
  await page.clock.runFor(100);
  await tickBox(page, "Yellow onion").uncheck();
  await page.clock.runFor(600);
  const produce = page.getByRole("heading", { name: "Produce" }).locator("xpath=..");
  await expect(produce.getByTestId("list-row").filter({ hasText: "Yellow onion" })).not.toHaveAttribute("data-checked", "true");
  await expect(gotIt(page)).toHaveCount(0);
  await expect(row(page, "Yellow onion").locator(".bk-strike")).not.toHaveAttribute("data-on", /.*/);
});

test("three fast taps end ticked and in Got it", async ({ page }) => {
  await tacosList(page);
  await page.clock.install();
  const box = tickBox(page, "Yellow onion");
  await box.click();
  await box.click();
  await box.click();
  await expect(box).toBeChecked();
  await page.clock.runFor(400);
  await expect(gotIt(page).getByTestId("list-row").filter({ hasText: "Yellow onion" })).toHaveAttribute("data-checked", "true");
});

test("three rapid check-offs land every row at its final place", async ({ page }) => {
  await tacosList(page);
  await page.clock.install();
  for (const n of ["Yellow onion", "Black beans", "Corn tortillas"]) await tickBox(page, n).check();
  await page.clock.runFor(400);
  await expect(page.getByRole("region", { name: /^Got it · 3$/ }).getByTestId("list-row")).toHaveCount(3);
  await page.clock.resume();
  await settledDown(page);
  // Every row rests where layout puts it: no leftover transform, rows do not overlap.
  const rows = await page.getByTestId("list-row").evaluateAll((els) =>
    els.map((e) => ({ t: getComputedStyle(e).transform, top: e.getBoundingClientRect().top, bottom: e.getBoundingClientRect().bottom })),
  );
  for (const r of rows) expect(r.t).toBe("none");
  const sorted = [...rows].sort((a, b) => a.top - b.top);
  for (let i = 1; i < sorted.length; i++) expect(sorted[i].top).toBeGreaterThanOrEqual(sorted[i - 1].bottom - 1);
});

test("ticked rows do not slide when the list opens", async ({ page }) => {
  await tacosList(page);
  await tickBox(page, "Black beans").check();
  await expect(gotIt(page)).toBeVisible();
  await settledDown(page);
  await page.reload();
  await recordAnimations(page);
  await expect(page.getByTestId("list-row")).toHaveCount(4);
  await expect(gotIt(page).getByTestId("list-row").filter({ hasText: "Black beans" })).toBeVisible();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  expect(await animations(page)).toHaveLength(0);
});

test("the total rolls only the digits that changed", async ({ page }) => {
  await tacosList(page);
  await setPrice(page, "Yellow onion", "5.00");
  const before = (await listTotal(page).textContent())!.trim();
  await setPrice(page, "Yellow onion", "9.00");
  await expect.poll(async () => (await listTotal(page).textContent())!.trim()).not.toBe(before);
  const after = (await listTotal(page).textContent())!.trim();
  const cents = (s: string) => Math.round(Number(s.replace(/[^\d.]/g, "")) * 100);
  expect(cents(after)).toBe(cents(before) + 400);
  const changed = rollDigits(before, after).filter((d) => d.from !== null).length;
  await expect(page.getByTestId("list-bar").locator(".bk-roll")).toHaveCount(changed);
});

test("a total that gains a digit keeps the bar on one line", async ({ page }) => {
  await tacosList(page);
  await setPrice(page, "Yellow onion", "5.00");
  const bar = page.getByTestId("list-bar");
  const before = (await bar.boundingBox())!;
  await setPrice(page, "Yellow onion", "195.00");
  await expect.poll(async () => (await listTotal(page).textContent())!.replace(/[^\d]/g, "").length).toBeGreaterThanOrEqual(5);
  const after = (await bar.boundingBox())!;
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
  // The total itself stays on one line: its box is no taller than one line of text.
  const oneLine = await page.getByTestId("list-bar").locator("strong").first().evaluate((el) => {
    const line = parseFloat(getComputedStyle(el).lineHeight);
    return el.getBoundingClientRect().height <= line * 1.25;
  });
  expect(oneLine).toBe(true);
});

test("reduced motion: no transforms on the list; the total crossfades", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await tacosList(page);
  await recordAnimations(page);
  await tickBox(page, "Yellow onion").check();
  await expect(gotIt(page).getByTestId("list-row").filter({ hasText: "Yellow onion" })).toBeVisible();
  await settledDown(page);
  for (const frames of await animations(page)) for (const f of frames) expect(Object.keys(f)).not.toContain("transform");
  const strike = gotIt(page).locator(".bk-strike").first();
  expect(await strike.evaluate((el) => getComputedStyle(el).clipPath)).not.toMatch(/100%/);
  await setPrice(page, "Black beans", "7.00");
  const bar = page.getByTestId("list-bar");
  await expect(bar.locator(".bk-roll")).toHaveCount(0);
  await expect(bar.locator(".bk-fade-in").first()).toBeAttached();
});

test("focus stays on the item you ticked after its row moves", async ({ page }) => {
  await tacosList(page);
  const box = tickBox(page, "Yellow onion");
  await box.focus();
  await page.keyboard.press("Space");
  await expect(box).toBeChecked();
  await expect(gotIt(page).getByTestId("list-row").filter({ hasText: "Yellow onion" })).toBeVisible();
  await settledDown(page);
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe("Got Yellow onion");
  expect(await page.evaluate(() => !!document.activeElement?.closest("section[aria-labelledby]"))).toBe(true);
});

test("a tick made offline strikes, moves and is still ticked after coming back", async ({ page, context }) => {
  const email = await tacosList(page);
  await expect(page.locator('[data-offline-ready="on"]')).toBeAttached({ timeout: 15_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Offline. Showing your last list.")).toBeVisible();

  await tickBox(page, "Yellow onion").check();
  await expect(row(page, "Yellow onion").locator(".bk-strike")).toHaveAttribute("data-on", /.*/);
  await expect(gotIt(page).getByTestId("list-row").filter({ hasText: "Yellow onion" })).toHaveAttribute("data-checked", "true");

  await context.setOffline(false);
  await expect(page.getByText("Offline. Showing your last list.")).toHaveCount(0, { timeout: 15_000 });
  const sb = await clientFor(email);
  await expect
    .poll(async () => (await sb.from("week_item_state").select("checked").eq("checked", true)).data?.length)
    .toBe(1);
  await expect(gotIt(page).getByTestId("list-row").filter({ hasText: "Yellow onion" })).toHaveAttribute("data-checked", "true");
});
