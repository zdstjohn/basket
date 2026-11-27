import type { Page } from "@playwright/test";

/** One screen of the app, as the layout and contrast checks visit it. */
export interface Screen {
  name: string;
  path: string;
  /** Visited with no one signed in. */
  signedOut?: true;
  /** Visited by a signed-in person who has no household yet. */
  fresh?: true;
  /** Its text colors are not yet held to 4.5:1; the screen's own task removes this. */
  contrastPending?: true;
  /** Waits for what makes the screen worth checking. */
  setup?: (page: Page) => Promise<void>;
}
