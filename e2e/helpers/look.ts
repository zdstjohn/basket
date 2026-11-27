import type { Page } from "@playwright/test";
import { LOOK_KEY, type Look } from "../../lib/look";

/** Chooses the look (light, dark or auto) before the page loads. Runs again on every navigation, so it survives `goto`. */
export async function setLook(page: Page, look: Look): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // No storage on a blank page: the next real page runs this again.
      }
    },
    [LOOK_KEY, look],
  );
}

/**
 * Pretends the phone has these safe-area insets (px). A browser cannot fake env(safe-area-inset-*),
 * so this sets the two tokens the app reads instead. Runs on every navigation.
 */
export async function setInsets(page: Page, top: number, bottom: number): Promise<void> {
  await page.addInitScript(
    ([t, b]) => {
      const apply = () => {
        document.documentElement.style.setProperty("--bk-safe-top", `${t}px`);
        document.documentElement.style.setProperty("--bk-safe-bottom", `${b}px`);
      };
      if (document.documentElement) apply();
      else new MutationObserver((_, watch) => {
        if (document.documentElement) {
          watch.disconnect();
          apply();
        }
      }).observe(document, { childList: true });
    },
    [top, bottom],
  );
}
