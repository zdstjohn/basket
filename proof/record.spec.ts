import { test, type Page } from "@playwright/test";
import { addFromSearch } from "../e2e/helpers/flows-a";
import { chooseStore, openItemSheet } from "../e2e/helpers/flows-b";
import { dress, expect, outDir, pendingReason, recordingContext, settle, signInFor } from "./helpers";
import { watchTransforms } from "./measure";

/**
 * Motion clips: week open, a meal settling, photo into the dinner sheet and back, sheet drag and flick, the budget total
 * rolling, a list item's strike and move. Each runs twice: as is, and with reduced motion (the "-reduced" clip), where it
 * also fails if any element's transform changes. Setup happens first, in a context of its own; the clip (a second context
 * with the same sign-in) holds only the motion. proof/page.ts turns the .webm files into .mp4 and a quarter-speed .mp4.
 */
test.describe.configure({ mode: "parallel" });

const tacos = (page: Page, day: "thu" | "fri" = "thu") =>
  addFromSearch(page, { day, query: "tacos", pick: "Chicken tacos · Allrecipes" });

interface Clip {
  name: string;
  screens: string[];
  /** Before recording: gets the household to the state the motion starts from. */
  setup: (page: Page) => Promise<void>;
  /** The motion itself. */
  act: (page: Page) => Promise<void>;
  /** The check is about motion the app makes by itself; a finger-driven drag moves things on purpose. */
  skipTransformCheck?: true;
}

const CLIPS: Clip[] = [
  {
    name: "week-open",
    screens: ["week"],
    setup: async (page) => {
      await tacos(page);
    },
    act: async (page) => {
      await page.goto("/week");
      await page.waitForTimeout(1500);
    },
  },
  {
    name: "meal-settle",
    screens: ["week", "add-meal"],
    setup: async () => {},
    act: async (page) => {
      await tacos(page);
      await page.waitForTimeout(1200);
    },
  },
  {
    name: "photo-sheet",
    screens: ["week"],
    setup: async (page) => {
      await tacos(page);
    },
    act: async (page) => {
      await page.goto("/week");
      await settle(page);
      await page.getByRole("button", { name: /Chicken tacos/ }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.waitForTimeout(900);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.waitForTimeout(900);
    },
  },
  {
    name: "sheet-drag",
    screens: ["list"],
    skipTransformCheck: true,
    setup: async (page) => {
      await chooseStore(page);
      await tacos(page);
    },
    act: async (page) => {
      await page.goto("/list");
      const sheet = await openItemSheet(page, "Boneless chicken thighs");
      await page.waitForTimeout(600);
      const box = (await sheet.boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + 12;
      const drag = async (to: number, steps: number, pause: number) => {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x, to, { steps });
        await page.waitForTimeout(pause);
      };
      // Drag down, think, drag back up and let go: the sheet returns.
      await drag(y + 160, 16, 300);
      await page.mouse.move(x, y, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(700);
      // A quick flick down: the sheet leaves.
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + 220, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(900);
    },
  },
  {
    name: "budget-roll",
    screens: ["week"],
    setup: async (page) => {
      await tacos(page);
    },
    act: async (page) => {
      await tacos(page, "fri");
      await page.waitForTimeout(1500);
    },
  },
  {
    name: "list-strike",
    screens: ["list"],
    setup: async (page) => {
      await chooseStore(page);
      await tacos(page);
    },
    act: async (page) => {
      await page.goto("/list");
      await expect(page.getByTestId("list-row").first()).toBeVisible();
      await settle(page);
      const boxes = page.getByTestId("list-row").getByRole("checkbox");
      await boxes.nth(0).click();
      await page.waitForTimeout(900);
      await boxes.nth(1).click();
      await page.waitForTimeout(900);
    },
  },
];

for (const clip of CLIPS) {
  for (const reduced of [false, true]) {
    const name = reduced ? `${clip.name}-reduced` : clip.name;
    test(`clip ${name}`, async ({ page, context, browser }, testInfo) => {
      const device = testInfo.project.name;
      const pending = pendingReason(clip.screens);
      if (pending) {
        console.log(`[proof] skipped clip ${name} (${device}): ${pending}`);
        test.skip(true, pending);
      }

      await dress(page, "light", testInfo);
      await signInFor(page, "household", `clip-${clip.name}`);
      try {
        await clip.setup(page);
      } catch (err) {
        const reason = `setup failed: ${(err as Error).message.split("\n")[0]}`;
        console.log(`[proof] skipped clip ${name} (${device}): ${reason}`);
        test.skip(true, reason);
      }

      const rawDir = outDir("motion", "raw");
      const rec = await recordingContext(browser, testInfo, context, outDir("motion", ".rec"), reduced);
      const rpage = await rec.newPage();
      rpage.setDefaultTimeout(8000);
      await dress(rpage, "light", testInfo);
      const stop = reduced && !clip.skipTransformCheck ? await watchTransforms(rpage) : null;

      let failure: string | null = null;
      try {
        await clip.act(rpage);
      } catch (err) {
        failure = (err as Error).message.split("\n")[0];
      }
      const moved = stop ? await stop() : [];
      const video = rpage.video();
      await rec.close();
      if (video && !failure) await video.saveAs(`${rawDir}/${name}-${device}.webm`);

      if (failure) {
        console.log(`[proof] skipped clip ${name} (${device}): could not play it: ${failure}`);
        test.skip(true, failure);
      }
      expect(moved, `reduced motion must not change a transform, only opacity:\n${moved.join("\n")}`).toEqual([]);
    });
  }
}
