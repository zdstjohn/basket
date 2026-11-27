import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { contrastRatio } from "../lib/design/contrast";
import { textPairs } from "../e2e/helpers/audit";
import { addFromSearch } from "../e2e/helpers/flows-a";
import { chooseStore } from "../e2e/helpers/flows-b";
import { SCREENS, type Screen } from "../e2e/screens";
import { LOOKS, dress, outDir, settle, signInFor, slug, zoomContext, type Who } from "./helpers";
import { measureRollClipping, measureScales } from "./measure";

const MIN_CONTRAST = 4.5;

/**
 * For every screen in both looks: (1) spacing on the scale, (2) gutter edges, (3) type scale, (4) contrast, (5) 200% crops.
 * Findings are written to proof-out/measure/. They fail the test, except on a screen that is still contrastPending (its own
 * task has not redesigned it yet): there they are listed as an annotation and in the file, and the test passes.
 */
test.describe.configure({ mode: "parallel" });

const who = (s: Screen): Who => (s.signedOut ? "out" : s.fresh ? "fresh" : "household");

for (const screen of SCREENS) {
  for (const look of LOOKS) {
    test(`measure ${screen.name} (${look})`, async ({ page, context, browser }, testInfo) => {
      const device = testInfo.project.name;
      await dress(page, look, testInfo);
      await signInFor(page, who(screen), `measure-${screen.name}`);
      if (who(screen) === "household") {
        // The same content the layout spec uses: a store and one planned dinner.
        await chooseStore(page);
        await addFromSearch(page, { day: "thu", query: "tacos", pick: "Chicken tacos · Allrecipes" });
      }
      await page.goto(screen.path);
      await page.waitForLoadState("networkidle");
      await screen.setup?.(page);
      await settle(page);

      const found: string[] = (await measureScales(page)).map((f) => `${f.rule}: ${f.where}: ${f.detail}`);

      const { pairs, skipped } = await textPairs(page);
      for (const p of pairs) {
        const ratio = contrastRatio(p.fg, p.bg);
        if (ratio < MIN_CONTRAST) found.push(`contrast: ${ratio.toFixed(2)} "${p.text}" ${p.fg} on ${p.bg}`);
      }
      for (const k of skipped) found.push(`contrast: not measurable "${k.text}": ${k.reason}`);

      // 5. 200% crops: the same screen at twice the pixel density, cut into four, for the eye.
      const tag = `${screen.name}-${device}-${look}`;
      const zoom = await zoomContext(browser, testInfo, context);
      try {
        const zpage = await zoom.newPage();
        await dress(zpage, look, testInfo);
        await zpage.goto(screen.path);
        await zpage.waitForLoadState("networkidle");
        await screen.setup?.(zpage);
        await settle(zpage);
        const size = zpage.viewportSize()!;
        const height = await zpage.evaluate(() => document.documentElement.scrollHeight);
        const part = Math.ceil(height / 4);
        for (let i = 0; i < 4 && i * part < height; i++) {
          await zpage.screenshot({
            path: `${outDir("zoom")}/${tag}-${i + 1}.png`,
            fullPage: true,
            clip: { x: 0, y: i * part, width: size.width, height: Math.min(part, height - i * part) },
          });
        }
      } finally {
        await zoom.close();
      }

      writeFileSync(`${outDir("measure")}/${slug(tag)}.json`, JSON.stringify({ screen: screen.name, device, look, pending: !!screen.contrastPending, found }, null, 2));
      if (screen.contrastPending) {
        if (found.length) testInfo.annotations.push({ type: "pending-findings", description: `${found.length} finding(s); see proof-out/measure\n${found.slice(0, 20).join("\n")}` });
        return;
      }
      expect(found, found.join("\n")).toEqual([]);
    });
  }
}

test("200% text size: rolling digits clip to one line, in both looks", async ({ page }, testInfo) => {
  for (const look of LOOKS) {
    await dress(page, look, testInfo);
    await signInFor(page, "household", `measure-roll-${look}`);
    await addFromSearch(page, { day: "thu", query: "tacos", pick: "Chicken tacos · Allrecipes" });
    for (const path of ["/week", "/list"]) {
      await page.goto(path);
      await settle(page);
      const clip = await measureRollClipping(page);
      if (clip === null) {
        console.log(`[proof] roll clipping: no rolling digits on ${path} (${look}) yet`);
        continue;
      }
      expect(clip, `${path} (${look}): ${clip.map((c) => `${c.where} ${c.detail}`).join("; ")}`).toEqual([]);
    }
  }
});
