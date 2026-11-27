import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { routeFoodImages } from "./fixtures";
import { signInAs, uniqueEmail } from "./auth";

export interface PersonInput {
  name: string;
  age: number;
  diet?: "None" | "Vegetarian" | "Vegan" | "Pescatarian";
  /** Foods this person won't eat, set on the Household screen after onboarding. */
  wontEat?: string[];
  /** Allergies, set on the Household screen after onboarding. */
  allergies?: string[];
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

/** Types each person's won't-eat foods and allergies on the Household screen, one person at a time. */
export async function setFoods(page: Page, people: PersonInput[]): Promise<void> {
  const wanted = people.flatMap((p, i) => ((p.wontEat?.length ?? 0) > 0 || (p.allergies?.length ?? 0) > 0 ? [{ p, i }] : []));
  if (wanted.length === 0) return;
  await page.goto("/household");
  for (const { p, i } of wanted) {
    const row = page.getByTestId("person-row").nth(i);
    await row.click();
    const form = page.getByRole("form", { name: `Edit ${p.name}` });
    for (const food of p.wontEat ?? []) {
      const box = form.getByLabel("Add a food");
      await box.fill(food);
      await box.press("Enter");
    }
    for (const food of p.allergies ?? []) {
      const box = form.getByLabel("Add an allergy");
      await box.fill(food);
      await box.press("Enter");
    }
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form).toHaveCount(0);
  }
}

/** Signs in a new user, onboards the family (five people unless told otherwise) and lands on /week. */
export async function createHousehold(page: Page, label = "owner", people: PersonInput[] = FAMILY): Promise<string> {
  const email = uniqueEmail(label);
  await signInAs(page, email);
  await onboard(page, people);
  await page.getByRole("button", { name: "Start planning" }).click();
  await expect(page).toHaveURL(/\/week$/);
  await setFoods(page, people);
  if (people.some((p) => p.wontEat?.length || p.allergies?.length)) await page.goto("/week");
  return email;
}

/** The owner invites a partner; returns a second signed-in phone in the same household, on /week. */
export async function joinAsPartner(
  owner: Page,
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  await owner.goto("/household");
  await owner.getByRole("button", { name: "Invite" }).click();
  const link = owner.getByLabel("Invite link");
  await expect(link).toHaveValue(/\/invite\/[0-9a-f]{64}$/);
  const url = await link.inputValue();

  const baseURL = test.info().project.use.baseURL;
  const context = await browser.newContext({ baseURL });
  await routeFoodImages(context);
  const page = await context.newPage();
  await signInAs(page, uniqueEmail("partner"));
  await page.goto(url);
  await expect(page).toHaveURL(/\/week$/);
  return { context, page };
}
