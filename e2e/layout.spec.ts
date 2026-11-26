import { expect, test, type Page } from "@playwright/test";
import { createHousehold } from "./helpers/household";
import { routeFoodImages } from "./helpers/fixtures";

const SCREENS = [
  { name: "week", path: "/week" },
  { name: "add-meal", path: "/week/add?day=thu&slot=dinner" },
  { name: "favorites", path: "/favorites" },
  { name: "list", path: "/list" },
  { name: "household", path: "/household" },
];

interface Problem {
  what: string;
  detail: string;
}

/** Everything the layout rules care about, measured in the page. */
async function audit(page: Page): Promise<Problem[]> {
  return page.evaluate(() => {
    const problems: { what: string; detail: string }[] = [];
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""} "${(el.textContent ?? "").trim().slice(0, 30)}"`;

    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth) {
      problems.push({ what: "horizontal scroll", detail: `${doc.scrollWidth} > ${window.innerWidth}` });
    }

    // A control may be a big label around a small native input (checkbox row), so measure its tap area:
    // the input itself or the label that wraps it, whichever is larger.
    const controls = [...document.querySelectorAll<HTMLElement>("button, a, input")];
    if (controls.length === 0) problems.push({ what: "no controls found", detail: "the screen did not render" });
    for (const el of controls) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      let box = el.getBoundingClientRect();
      const label = el instanceof HTMLInputElement ? el.closest("label") : null;
      if (label) {
        const lb = label.getBoundingClientRect();
        if (lb.width * lb.height > box.width * box.height) box = lb;
      }
      // Skip controls that take no room at all (visually hidden inputs that a visible label stands in for).
      if (box.width === 0 && box.height === 0) continue;
      if (box.width < 44 || box.height < 44) {
        problems.push({ what: "target under 44px", detail: `${describe(el)} ${Math.round(box.width)}x${Math.round(box.height)}` });
      }
      if (box.right > window.innerWidth + 0.5 || box.left < -0.5) {
        problems.push({ what: "target off screen sideways", detail: describe(el) });
      }
    }

    // Nothing sits under the bottom nav or the bottom edge: after scrolling to the end,
    // the last thing in the page ends above the nav (or the viewport bottom when there is no nav).
    window.scrollTo(0, document.documentElement.scrollHeight);
    const nav = document.querySelector("nav[aria-label='Main']");
    const limit = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    const main = document.querySelector("main") ?? document.body;
    const visible = [...main.querySelectorAll<HTMLElement>("*")].filter((e) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.height > 0 && r.width > 0 && s.position !== "fixed" && s.position !== "sticky" && s.visibility !== "hidden";
    });
    let lowest = 0;
    let lowestEl: Element | null = null;
    for (const e of visible) {
      const b = e.getBoundingClientRect().bottom;
      if (b > lowest) {
        lowest = b;
        lowestEl = e;
      }
    }
    if (lowestEl && lowest > limit + 0.5) {
      problems.push({ what: "content under the nav or bottom edge", detail: `${describe(lowestEl)} ends ${Math.round(lowest)} > ${Math.round(limit)}` });
    }
    // Fixed or sticky controls must stay inside the viewport (the safe-area padding keeps them clear of the home bar).
    for (const el of controls) {
      const s = getComputedStyle(el);
      if (s.position !== "fixed" && s.position !== "sticky") continue;
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight + 0.5) problems.push({ what: "pinned control below the screen", detail: describe(el) });
    }
    window.scrollTo(0, 0);
    return problems;
  });
}

test.beforeEach(async ({ page }) => {
  await routeFoodImages(page);
});

test("layout: every screen fits, taps are 44px and nothing hides under the nav", async ({ page }, testInfo) => {
  const shots = `e2e/screenshots/${testInfo.project.name}`;
  await createHousehold(page, "layout");

  // Put a planned meal on the week so the list and week screens have real content.
  await page.goto("/week/add?day=thu&slot=dinner");
  await page.getByLabel("What's for dinner?").fill("tacos");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Chicken tacos · Allrecipes" }).click();
  await page.getByRole("button", { name: "Add to Thursday" }).click();
  await expect(page).toHaveURL(/\/week$/);

  const found: string[] = [];
  for (const screen of SCREENS) {
    await page.goto(screen.path);
    await page.waitForLoadState("networkidle");
    if (screen.name === "list") {
      await expect(page.getByTestId("list-row").first()).toBeVisible();
    }
    const problems = await audit(page);
    await page.screenshot({ path: `${shots}/layout-${screen.name}.png`, fullPage: true });
    for (const p of problems) found.push(`${screen.path}: ${p.what}: ${p.detail}`);
  }
  expect(found, found.join("\n")).toEqual([]);
});
