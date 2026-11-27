import { expect, test, type Page } from "@playwright/test";
import { createHousehold } from "./helpers/household";
import { routeFoodImages } from "./helpers/fixtures";
import { addFromSearch, seedDinnerOnDay } from "./helpers/flows-a";
import { noonLosAngeles, pinToday } from "./helpers/clock";
import { dinnerDate, weekStartFor } from "../lib/domain/weeks";

// The service worker would let image requests skip page.route on WebKit.
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await routeFoodImages(page, { wide: /wide\.jpg/ });
});

declare global {
  interface Window {
    __log: string[];
    __anim: string[][];
    __vt: number;
  }
}

/**
 * Logs every bk-* class that is added to or removed from an element (and every element that arrives with one), in the
 * order it happened, so a test reads order from the log and never from a timer. "DOUBLE" marks an element that carries
 * two of bk-reveal, bk-settle and bk-fade-in at once. Also counts view transitions and records what each animate() moves.
 */
async function watch(page: Page, opts: { noViewTransitions?: boolean } = {}): Promise<void> {
  await page.addInitScript((noVT) => {
    window.__log = [];
    window.__anim = [];
    window.__vt = 0;
    if (noVT) {
      delete (Document.prototype as { startViewTransition?: unknown }).startViewTransition;
    } else if (typeof document.startViewTransition === "function") {
      const real = document.startViewTransition.bind(document);
      document.startViewTransition = ((cb: () => void) => {
        window.__vt++;
        return real(cb);
      }) as typeof document.startViewTransition;
    }
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, frames: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
      const list = Array.isArray(frames) ? frames : [];
      window.__anim.push([...new Set(list.flatMap((f) => Object.keys(f)))]);
      return animate.call(this, frames, options);
    } as typeof Element.prototype.animate;

    const ENTRANCES = ["bk-reveal", "bk-settle", "bk-fade-in"];
    const name = (el: Element) => el.getAttribute("data-testid") ?? el.tagName.toLowerCase();
    // An element that arrives already classed is seen twice (as a new node and as a class change): log each class once.
    const active = new WeakMap<Element, Set<string>>();
    const note = (el: Element, sign: string, cls: string) => {
      const seen = active.get(el) ?? new Set<string>();
      active.set(el, seen);
      if (sign === "+" ? seen.has(cls) : !seen.has(cls)) return;
      if (sign === "+") seen.add(cls);
      else seen.delete(cls);
      const step = (el as HTMLElement).style?.getPropertyValue("--i");
      window.__log.push(`${sign}${cls} ${name(el)}${step ? ` i=${step}` : ""}`);
      if (ENTRANCES.filter((c) => el.classList.contains(c)).length > 1) window.__log.push(`DOUBLE ${name(el)}`);
    };
    const classesOf = (el: Element) => [...el.classList].filter((c) => c.startsWith("bk-") && c !== "bk-gutter" && c !== "bk-press");
    const start = () => {
      new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === "childList") {
            r.addedNodes.forEach((n) => {
              if (!(n instanceof Element)) return;
              for (const el of [n, ...n.querySelectorAll("*")]) for (const c of classesOf(el)) note(el, "+", c);
            });
          } else if (r.type === "attributes" && r.attributeName === "class") {
            const before = new Set((r.oldValue ?? "").split(/\s+/));
            const el = r.target as Element;
            const now = new Set(classesOf(el));
            for (const c of now) if (!before.has(c)) note(el, "+", c);
            for (const c of before) if (c.startsWith("bk-") && !el.classList.contains(c)) note(el, "-", c);
          }
        }
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"], attributeOldValue: true });
    };
    if (document.documentElement) start();
    else document.addEventListener("DOMContentLoaded", start, { once: true });
  }, !!opts.noViewTransitions);
}

const log = (page: Page) => page.evaluate(() => window.__log.slice());
const tileOf = (page: Page, day: string) => page.getByTestId(`day-row-${day}`).getByRole("button").first();
const noDoubles = async (page: Page) => expect((await log(page)).filter((l) => l.startsWith("DOUBLE"))).toEqual([]);
/** Elements still carrying a view-transition-name: none may be left behind once a transition is over. */
const namedElements = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[style]")].filter((el) => el.style.viewTransitionName !== "").length);

async function twoDinners(page: Page): Promise<string> {
  const email = await createHousehold(page);
  await seedDinnerOnDay(email, "mon", { name: "Monday soup" });
  await seedDinnerOnDay(email, "thu", { name: "Thursday soup" });
  return email;
}

test("the week reveals once on open and not again after a sheet", async ({ page }) => {
  await watch(page);
  await pinToday(page, "wed");
  await twoDinners(page);
  await page.goto("/week");
  await expect(page.getByTestId("day-row-thu")).toBeVisible();

  // Every pinboard item reveals, in the order the board reads, one step apart.
  await expect.poll(async () => (await log(page)).filter((l) => l.startsWith("+bk-reveal day-row-")).length).toBe(7);
  const order = await page.locator('[data-testid^="day-row-"]').evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
  const steps = (await log(page)).filter((l) => l.startsWith("+bk-reveal day-row-")).map((l) => /^\+bk-reveal (\S+) i=(\d+)$/.exec(l)!);
  expect(steps.map((m) => m[1])).toEqual(order);
  expect(steps.map((m) => Number(m[2]))).toEqual(order.map((_, i) => i));
  // Each one lets go of the class when it is done, so a later entrance never meets it.
  await expect.poll(async () => (await log(page)).filter((l) => l.startsWith("-bk-reveal")).length).toBeGreaterThanOrEqual(7);

  const before = (await log(page)).filter((l) => l.startsWith("+bk-reveal")).length;
  await tileOf(page, "thu").click();
  await expect(page.getByRole("dialog", { name: "Thursday soup" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 200));
  expect((await log(page)).filter((l) => l.startsWith("+bk-reveal")).length).toBe(before);
  await noDoubles(page);
});

test("a tap during the reveal opens the dinner", async ({ page }) => {
  await watch(page);
  await pinToday(page, "wed");
  await twoDinners(page);
  await page.goto("/week");
  // The click is dispatched, not performed: a performed click would wait for the moving tile to hold still.
  await tileOf(page, "thu").dispatchEvent("click");
  await expect(page.getByRole("dialog", { name: "Thursday soup" })).toBeVisible();
});

test("a tap on Close 50 ms after a tile tap closes the sheet", async ({ page }) => {
  await watch(page);
  await pinToday(page, "wed");
  await twoDinners(page);
  await page.goto("/week");
  await expect(page.getByTestId("day-row-thu")).toBeVisible();
  await tileOf(page, "thu").dispatchEvent("click");
  const close = page.getByRole("dialog").getByRole("button", { name: "Close" });
  await close.waitFor({ state: "attached" });
  await page.waitForTimeout(50);
  await close.dispatchEvent("click");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The tile takes taps again, and nothing keeps a transition name.
  await expect.poll(() => namedElements(page)).toBe(0);
  await tileOf(page, "thu").dispatchEvent("click");
  await expect(page.getByRole("dialog", { name: "Thursday soup" })).toBeVisible();
});

test("a double tap on a tile opens one sheet and leaves no transition name behind", async ({ page }) => {
  await watch(page);
  await pinToday(page, "wed");
  await twoDinners(page);
  await page.goto("/week");
  await expect(page.getByTestId("day-row-thu")).toBeVisible();
  const tile = tileOf(page, "thu");
  await tile.dispatchEvent("click");
  await tile.dispatchEvent("click");
  await expect(page.getByRole("dialog", { name: "Thursday soup" })).toHaveCount(1);
  await expect.poll(() => namedElements(page)).toBe(0);
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).dispatchEvent("click");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => namedElements(page)).toBe(0);
});

test("adding a dinner settles its tile", async ({ page }) => {
  await watch(page);
  await createHousehold(page);
  await page.clock.install({ time: noonLosAngeles(dinnerDate(weekStartFor(new Date(), "sun", "America/Los_Angeles"), "wed")) });
  await addFromSearch(page, { day: "fri", query: "tacos", pick: "Chicken tacos · Allrecipes" });
  await expect(page.getByTestId("day-row-fri")).toContainText("Chicken tacos");

  await expect.poll(async () => (await log(page)).some((l) => l.startsWith("+bk-settle day-row-fri"))).toBe(true);
  await page.clock.runFor(600);
  await expect.poll(async () => (await log(page)).some((l) => l.startsWith("-bk-settle day-row-fri"))).toBe(true);
  const lines = await log(page);
  expect(lines.findIndex((l) => l.startsWith("+bk-settle day-row-fri"))).toBeLessThan(lines.findIndex((l) => l.startsWith("-bk-settle day-row-fri")));
  // Only the new tile settles.
  expect(lines.filter((l) => l.startsWith("+bk-settle")).map((l) => l.split(" ")[1])).toEqual(["day-row-fri"]);
  await noDoubles(page);
});

test("the week total rolls when a dinner is added", async ({ page }) => {
  await watch(page);
  await createHousehold(page);
  await addFromSearch(page, { day: "fri", query: "tacos", pick: "Chicken tacos · Allrecipes" });
  await expect.poll(async () => (await log(page)).some((l) => l.startsWith("+bk-roll"))).toBe(true);
  await expect(page.getByTestId("week-total")).not.toHaveText("$0.00");
});

test("reduced motion: 120 ms fades, no travel", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await watch(page);
  await pinToday(page, "wed");
  await twoDinners(page);
  await page.goto("/week");
  await expect(page.getByTestId("day-row-thu")).toBeVisible();

  const tokens = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "bk-reveal";
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const out = { duration: style.animationDuration, move: getComputedStyle(document.documentElement).getPropertyValue("--bk-move").trim() };
    probe.remove();
    return out;
  });
  expect(tokens.duration).toBe("0.12s");
  expect(tokens.move).toBe("0");

  // Opening a dinner: no view transition (the photo does not travel), and the sheet only fades.
  await page.evaluate(() => {
    window.__vt = 0;
    window.__anim = [];
  });
  await tileOf(page, "thu").click();
  await expect(page.getByRole("dialog", { name: "Thursday soup" })).toBeVisible();
  expect(await page.evaluate(() => window.__vt)).toBe(0);
  const moved = await page.evaluate(() => window.__anim.flat());
  expect(moved).toContain("opacity");
  expect(moved).not.toContain("transform");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await namedElements(page)).toBe(0);
});

test("without view transitions a tile still opens and closes", async ({ page }) => {
  await watch(page, { noViewTransitions: true });
  await pinToday(page, "wed");
  await twoDinners(page);
  await page.goto("/week");
  expect(await page.evaluate(() => typeof document.startViewTransition)).toBe("undefined");
  await tileOf(page, "thu").click();
  const sheet = page.getByRole("dialog", { name: "Thursday soup" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await tileOf(page, "mon").click();
  await expect(page.getByRole("dialog", { name: "Monday soup" })).toBeVisible();
});

/** A household with Chicken tacos (it has ingredients) on Thursday, its sheet open. */
async function openTacos(page: Page) {
  await createHousehold(page);
  await addFromSearch(page, { day: "thu", query: "tacos", pick: "Chicken tacos · Allrecipes" });
  await tileOf(page, "thu").click();
  const sheet = page.getByRole("dialog", { name: "Chicken tacos" });
  await expect(sheet).toBeVisible();
  return sheet;
}

const servingsIn = async (sheet: ReturnType<Page["getByRole"]>) => {
  const text = (await sheet.getByText(/^Scaled to /).textContent()) ?? "";
  return Number(/Scaled to ([\d.]+) servings?/.exec(text)![1]);
};

test("the dinner sheet lists ingredients scaled for the household", async ({ page }) => {
  const sheet = await openTacos(page);
  await expect(sheet.getByRole("heading", { name: "Ingredients" })).toBeVisible();
  await expect(sheet.getByText(/^Scaled to [\d.]+ servings?$/)).toBeVisible();
  const rows = sheet.getByRole("region", { name: "Ingredients" }).getByRole("listitem");
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(rows.first()).not.toBeEmpty();
  // The name is the dinner's, in the display face, and the sheet has a named Close.
  await expect(sheet.getByRole("heading", { name: "Chicken tacos", level: 2 })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Close" })).toHaveCount(1);
});

test("with leftovers set, the sheet scales to the override", async ({ page }) => {
  const sheet = await openTacos(page);
  const base = await servingsIn(sheet);
  await sheet.getByRole("button", { name: "More leftovers" }).click();
  await expect(sheet.getByText("Leftovers: +1 servings")).toBeVisible();
  await expect.poll(() => servingsIn(sheet)).toBeCloseTo(base + 1, 0);
  await sheet.getByRole("button", { name: "Fewer leftovers" }).click();
  await expect(sheet.getByText("Leftovers: +0 servings")).toBeVisible();
  await expect.poll(() => servingsIn(sheet)).toBeCloseTo(base, 0);
});

test("a small photo is a tile in the sheet, not a stretched hero", async ({ page }) => {
  await pinToday(page, "wed");
  const email = await createHousehold(page);
  await seedDinnerOnDay(email, "thu", { name: "Small photo soup", photoUrl: "https://images.example.test/small.jpg", width: 400 });
  await seedDinnerOnDay(email, "fri", { name: "Wide photo soup", photoUrl: "https://images.example.test/wide.jpg", width: 800 });
  await page.goto("/week");
  const ratioAndWidth = async () => {
    const panel = (await page.getByTestId("sheet-panel").boundingBox())!;
    const photo = (await page.locator("[data-sheet-photo] [data-photo-state]").boundingBox())!;
    return { ratio: photo.width / photo.height, inset: panel.width - photo.width };
  };

  await tileOf(page, "thu").click();
  await expect(page.getByRole("dialog", { name: "Small photo soup" })).toBeVisible();
  const small = await ratioAndWidth();
  expect(Math.abs(small.ratio - 1.6)).toBeLessThan(0.03); // the 8:5 tile crop
  expect(small.inset).toBeGreaterThanOrEqual(31); // inside the gutter
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await tileOf(page, "fri").click();
  await expect(page.getByRole("dialog", { name: "Wide photo soup" })).toBeVisible();
  const wide = await ratioAndWidth();
  expect(Math.abs(wide.ratio - 2)).toBeLessThan(0.03); // the 2:1 hero crop
  expect(wide.inset).toBeLessThan(1); // edge to edge
});
