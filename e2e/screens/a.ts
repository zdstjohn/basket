import { expect, type Page } from "@playwright/test";
import { FAMILY, setFoods } from "../helpers/household";
import type { Screen } from "./shared";

/** Gives the youngest daughter a tree nut allergy once, so the screens below have an allergy to show. */
async function withAllergy(page: Page): Promise<void> {
  await page.goto("/household");
  const row = page.getByTestId("person-row").last();
  await expect(row).toBeVisible();
  if ((await row.innerText()).includes("tree nuts")) return;
  await setFoods(page, FAMILY.map((p) => (p.name === "Daughter" && p.age === 4 ? { ...p, allergies: ["tree nuts"] } : p)));
}

const PILAF = /^Broccolini quinoa pilaf with toasted almonds · Example Kitchen/;

async function searchSoup(page: Page, day: string): Promise<void> {
  await page.goto(`/week/add?day=${day}&slot=dinner`);
  await page.getByLabel(/What.s for dinner\?/).fill("soup");
  await page.getByRole("button", { name: "Search" }).click();
}

/** Stream A: the week, adding a meal and favorites. */
export const SCREENS_A: Screen[] = [
  { name: "week", path: "/week" },
  { name: "add-meal", path: "/week/add?day=thu&slot=dinner", contrastPending: true },
  { name: "favorites", path: "/favorites" },
  {
    // A household with an allergy and the soup with almonds planned anyway: the week tile shows the allergy line.
    name: "week-allergy",
    path: "/week",
    setup: async (page) => {
      await withAllergy(page);
      await searchSoup(page, "fri");
      await page.getByRole("button", { name: PILAF }).click();
      await page.getByRole("button", { name: "Add to Friday anyway" }).click();
      await expect(page).toHaveURL(/\/week$/);
      await expect(page.getByTestId("day-row-fri")).toContainText("Tree nut allergy");
    },
  },
  {
    // Search cards carrying an allergy line and a won't-eat line.
    name: "search-flags",
    path: "/week/add?day=thu&slot=dinner",
    contrastPending: true,
    setup: async (page) => {
      await withAllergy(page);
      await searchSoup(page, "thu");
      await expect(page.getByTestId("result-flag").first()).toBeVisible();
    },
  },
];
