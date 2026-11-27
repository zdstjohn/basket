import { expect } from "@playwright/test";
import type { Screen } from "./shared";

/** Stream B: the list, the household, onboarding, sign-in and invites. (The cart review joins when the cart merges.) */
export const SCREENS_B: Screen[] = [
  {
    name: "list",
    path: "/list",
    contrastPending: true,
    setup: async (page) => {
      await expect(page.getByTestId("list-row").first()).toBeVisible();
    },
  },
  { name: "household", path: "/household", contrastPending: true },
  { name: "onboarding", path: "/onboarding", fresh: true, contrastPending: true },
  { name: "login", path: "/login", signedOut: true },
  { name: "invite-failed", path: `/invite/${"0".repeat(64)}` },
];
