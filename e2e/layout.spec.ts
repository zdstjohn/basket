import { expect, test } from "@playwright/test";
import { contrastRatio } from "../lib/design/contrast";
import { signInAs, uniqueEmail } from "./helpers/auth";
import { audit, measureShell, textPairs } from "./helpers/audit";
import { addFromSearch } from "./helpers/flows-a";
import { routeFoodImages } from "./helpers/fixtures";
import { chooseStore, openReview, planTacos } from "./helpers/fred-meyer";
import { createHousehold } from "./helpers/household";
import { setInsets, setLook } from "./helpers/look";
import { SCREENS, type Screen } from "./screens";

const MIN_CONTRAST = 4.5;

const VARIANTS = [
  { name: "light", look: "light", insets: null },
  { name: "dark", look: "dark", insets: null },
  { name: "light, iPhone 17 insets", look: "light", insets: [62, 34] },
  { name: "light, Pixel 7 gesture insets", look: "light", insets: [28, 24] },
] as const;

test.beforeEach(async ({ page }) => {
  await routeFoodImages(page);
});

for (const variant of VARIANTS) {
  test(`layout (${variant.name}): every screen fits, taps are 44px, nothing hides under the nav, text has contrast`, async ({
    page,
    context,
  }, testInfo) => {
    const shots = `e2e/screenshots/${testInfo.project.name}`;
    const tag = variant.name.replace(/[^a-z0-9]+/gi, "-");
    await setLook(page, variant.look);
    if (variant.insets) await setInsets(page, variant.insets[0], variant.insets[1]);
    await createHousehold(page, "layout");

    // Put a planned meal on the week so the list and week screens have real content, and a Fred Meyer store so the review screen opens.
    await chooseStore(page);
    await addFromSearch(page, { day: "thu", query: "tacos", pick: "Chicken tacos · Allrecipes" });

    const found: string[] = [];
    const visit = async (screen: Screen) => {
      await page.goto(screen.path);
      await page.waitForLoadState("networkidle");
      await screen.setup?.(page);
      const where = `${screen.path}`;

      for (const p of await audit(page)) found.push(`${where}: ${p.what}: ${p.detail}`);

      // The shell: the first heading clears the top inset, the tab bar clears the bottom inset and ends at the screen's edge.
      const shell = await measureShell(page);
      if (variant.insets) {
        if (shell.insetTop !== variant.insets[0] || shell.insetBottom !== variant.insets[1]) {
          found.push(`${where}: insets are ${shell.insetTop}/${shell.insetBottom}, expected ${variant.insets.join("/")}`);
        }
      }
      if (shell.h1Top === null) found.push(`${where}: no h1`);
      else if (shell.h1Top < shell.insetTop - 0.5) found.push(`${where}: h1 starts at ${shell.h1Top}, above the top inset ${shell.insetTop}`);
      if (shell.nav) {
        if (shell.nav.paddingBottom < shell.insetBottom - 0.5) {
          found.push(`${where}: nav bottom padding ${shell.nav.paddingBottom} is under the bottom inset ${shell.insetBottom}`);
        }
        if (Math.abs(shell.nav.bottom - shell.innerHeight) > 1) {
          found.push(`${where}: nav ends at ${shell.nav.bottom}, not at the screen bottom ${shell.innerHeight}`);
        }
      }

      // Text contrast (the ratios use the real contrastRatio, not a copy of the maths).
      const { pairs, skipped } = await textPairs(page);
      const weak = pairs.map((p) => ({ ...p, ratio: contrastRatio(p.fg, p.bg) })).filter((p) => p.ratio < MIN_CONTRAST);
      // Text that cannot be measured (an image or gradient behind it included) must sit inside a data-on-photo container
      // (which the audit skips, and which only allowlisted components may set) or it fails.
      const unmeasured = skipped;
      if (screen.contrastPending) {
        const worklist = [
          ...weak.map((p) => `${p.ratio.toFixed(2)} "${p.text}" ${p.fg} on ${p.bg}`),
          ...unmeasured.map((k) => `unmeasured "${k.text}": ${k.reason}`),
        ];
        if (worklist.length) {
          testInfo.annotations.push({ type: "contrast-pending", description: `${screen.name}: ${weak.length} pair(s) under ${MIN_CONTRAST}, ${unmeasured.length} unmeasured\n${worklist.join("\n")}` });
        }
      } else {
        for (const p of weak) found.push(`${where}: contrast ${p.ratio.toFixed(2)} for "${p.text}" (${p.fg} on ${p.bg})`);
        for (const k of unmeasured) found.push(`${where}: contrast not measurable for "${k.text}": ${k.reason}`);
      }
      await page.screenshot({ path: `${shots}/layout-${screen.name}-${tag}.png`, fullPage: true });
    };

    for (const screen of SCREENS.filter((s) => !s.signedOut && !s.fresh)) await visit(screen);

    // A signed-in person with no household yet, then no one at all.
    await context.clearCookies();
    await signInAs(page, uniqueEmail("layout-fresh"));
    for (const screen of SCREENS.filter((s) => s.fresh)) await visit(screen);
    await context.clearCookies();
    for (const screen of SCREENS.filter((s) => s.signedOut)) await visit(screen);

    expect(found, found.join("\n")).toEqual([]);
  });
}

test("review screen: no sideways scroll at 360, 402 and 412, and the send button sits above the nav", async ({ page }) => {
  await createHousehold(page, "layoutreview");
  await chooseStore(page);
  await planTacos(page);
  await openReview(page);
  await expect(page.getByTestId("review-line").first()).toBeVisible();
  for (const width of [360, 402, 412]) {
    await page.setViewportSize({ width, height: 800 });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(wide, `sideways scroll at ${width}`).toBe(false);
    const send = await page.getByTestId("send-cart").boundingBox();
    const nav = await page.getByRole("navigation", { name: "Main" }).boundingBox();
    expect(send && nav && send.y + send.height <= nav.y + 0.5, `send button above the nav at ${width}`).toBe(true);
  }
});
