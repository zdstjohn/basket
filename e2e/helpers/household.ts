import { expect, type Page } from "@playwright/test";

export interface PersonInput {
  name: string;
  age: number;
  diet?: "None" | "Vegetarian" | "Vegan" | "Pescatarian";
}

export const FAMILY: PersonInput[] = [
  { name: "Dad", age: 38 },
  { name: "Mom", age: 39, diet: "Vegetarian" },
  { name: "Son", age: 8 },
  { name: "Daughter", age: 6 },
  { name: "Daughter", age: 4 },
];

/** Walks the onboarding page for a signed-in user with no household. */
export async function onboard(
  page: Page,
  people: PersonInput[] = FAMILY,
): Promise<void> {
  await page.goto("/week");
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Household name").fill("The Smiths");
  for (const [i, p] of people.entries()) {
    if (i > 0) await page.getByRole("button", { name: "+ Add person" }).click();
    const row = page.getByRole("group", { name: `Person ${i + 1}` });
    await row.getByLabel("Name").fill(p.name);
    await row.getByLabel("Age").fill(String(p.age));
    if (p.diet) await row.getByLabel("Diet").selectOption({ label: p.diet });
  }
}
