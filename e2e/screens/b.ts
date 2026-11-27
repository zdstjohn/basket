import { expect } from "@playwright/test";
import type { Screen } from "./shared";

/** Stream B: the list, the household, onboarding, sign-in and invites. The cart review needs a Fred Meyer store chosen first (the layout spec does that). */
export const SCREENS_B: Screen[] = [
  {
    name: "list",
    path: "/list",
    setup: async (page) => {
      await expect(page.getByTestId("list-row").first()).toBeVisible();
    },
  },
  {
    name: "review",
    path: "/list/review",
    contrastPending: true,
    setup: async (page) => {
      await expect(page.getByTestId("review-line").first()).toBeVisible();
    },
  },
  { name: "household", path: "/household", contrastPending: true },
  { name: "onboarding", path: "/onboarding", fresh: true },
  { name: "login", path: "/login", signedOut: true },
  { name: "invite-failed", path: `/invite/${"0".repeat(64)}` },
];
