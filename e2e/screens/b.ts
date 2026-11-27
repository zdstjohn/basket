import { expect, type Page } from "@playwright/test";
import { FAMILY, setFoods } from "../helpers/household";
import type { Screen } from "./shared";

/** The household as the audit should see it: one person with an allergy and the editor open, so the allergy line, the chips and the editor's fields are all on screen. */
async function householdWithAllergyAndEditor(page: Page): Promise<void> {
  await page.goto("/household");
  const rows = page.getByTestId("person-row");
  await expect(rows.last()).toBeVisible();
  if (!(await rows.last().innerText()).includes("tree nuts")) {
    await setFoods(page, FAMILY.map((p) => (p.name === "Daughter" && p.age === 4 ? { ...p, wontEat: ["mushrooms"], allergies: ["tree nuts"] } : p)));
    await page.goto("/household");
  }
  await rows.last().click();
  await expect(page.getByRole("form", { name: "Edit Daughter" })).toBeVisible();
}

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
    setup: async (page) => {
      await expect(page.getByTestId("review-line").first()).toBeVisible();
    },
  },
  { name: "household", path: "/household", setup: householdWithAllergyAndEditor },
  {
    // One person already saved into a row (so the audit sees a closed PersonRow) and a second editor open.
    name: "onboarding",
    path: "/onboarding",
    fresh: true,
    setup: async (page) => {
      const first = page.getByRole("group", { name: "Person 1" });
      await first.getByLabel("Name").fill("Dad");
      await first.getByLabel("Age").fill("38");
      await page.getByRole("button", { name: "+ Add person" }).click();
      await expect(page.getByTestId("person-row")).toHaveCount(1);
    },
  },
  { name: "login", path: "/login", signedOut: true },
  { name: "invite-failed", path: `/invite/${"0".repeat(64)}` },
];
