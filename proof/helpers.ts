import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { signInAs, uniqueEmail } from "../e2e/helpers/auth";
import { routeFoodImages } from "../e2e/helpers/fixtures";
import { createHousehold, type PersonInput } from "../e2e/helpers/household";
import { setInsets, setLook } from "../e2e/helpers/look";
import type { Look } from "../lib/look";
import { SCREENS, type Screen } from "../e2e/screens";

export const OUT = path.join(process.cwd(), "proof-out");
export const LOOKS: Exclude<Look, "auto">[] = ["light", "dark"];

/** The safe-area insets of each phone, top / bottom in px. */
export const INSETS: Record<string, [number, number]> = {
  "iphone-17": [62, 34],
  "pixel-7": [28, 24],
};

export const insetsFor = (testInfo: TestInfo): [number, number] => INSETS[testInfo.project.name] ?? [0, 0];

export function outDir(...parts: string[]): string {
  const dir = path.join(OUT, ...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** The registry entry a proof state belongs to, or why the state is not shot yet. */
export function pendingReason(screenNames: string[]): string | null {
  for (const name of screenNames) {
    const screen = SCREENS.find((s) => s.name === name);
    if (!screen) return `screen "${name}" is not in the registry yet`;
    if (screen.contrastPending) return `screen "${name}" is still contrastPending`;
  }
  return null;
}

export type Who = "household" | "fresh" | "out";

/** Looks, insets and food images, set before the first page loads. */
export async function dress(page: Page, look: Look, testInfo: TestInfo): Promise<void> {
  const [top, bottom] = insetsFor(testInfo);
  await routeFoodImages(page);
  await setLook(page, look);
  await setInsets(page, top, bottom);
}

/** Signs in the way a state needs: a household of five, a person with none, or no one. */
export async function signInFor(page: Page, who: Who, label: string, people?: PersonInput[]): Promise<string | null> {
  if (who === "household") return createHousehold(page, label, people);
  if (who === "fresh") {
    const email = uniqueEmail(label);
    await signInAs(page, email);
    return email;
  }
  return null;
}

/** Waits for the page to be quiet: network idle, fonts ready, finite animations and transitions done. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const running = document.getAnimations().filter((a) => {
        const end = a.effect?.getComputedTiming().endTime;
        return a.playState === "running" && Number.isFinite(end as number);
      });
      if (running.length === 0) return;
      await new Promise((r) => setTimeout(r, 100));
    }
  });
}

export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * A context like the project's, recording video into `dir`, signed in as the same person as `from`
 * (cookies and storage are copied), so a clip holds only the motion and none of the setup.
 */
export async function recordingContext(
  browser: Browser,
  testInfo: TestInfo,
  from: BrowserContext,
  dir: string,
  reducedMotion: boolean,
): Promise<BrowserContext> {
  const use = testInfo.project.use;
  const viewport = use.viewport ?? { width: 402, height: 874 };
  const context = await browser.newContext({
    baseURL: use.baseURL,
    viewport,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    userAgent: use.userAgent,
    storageState: await from.storageState(),
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
    recordVideo: { dir, size: viewport },
  });
  await routeFoodImages(context);
  return context;
}

/** The project's phone at twice the pixel density, signed in as the same person as `from`: the "200%" crops. */
export async function zoomContext(browser: Browser, testInfo: TestInfo, from: BrowserContext): Promise<BrowserContext> {
  const use = testInfo.project.use;
  const context = await browser.newContext({
    baseURL: use.baseURL,
    viewport: use.viewport ?? { width: 402, height: 874 },
    deviceScaleFactor: Math.min(4, (use.deviceScaleFactor ?? 1) * 2),
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    userAgent: use.userAgent,
    storageState: await from.storageState(),
  });
  await routeFoodImages(context);
  return context;
}

export { expect, type Screen };
