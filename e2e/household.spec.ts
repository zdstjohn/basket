import { expect, test, type Page } from "@playwright/test";
import { createHousehold, joinAsPartner } from "./helpers/household";

// Daughter appears twice in the family (6 and 4); the four-year-old is the last row.
const youngest = (page: Page) => page.getByTestId("person-row").last();

test("won't-eat and allergies are saved for a person and seen from a second phone", async ({ page, browser }) => {
  await createHousehold(page, "household-lists");
  await page.goto("/household");

  await youngest(page).click();
  const form = page.getByRole("form", { name: "Edit Daughter" }).last();

  // Typing a word inside a longer allergy shows what it covers, and Enter adds without saving the person.
  const allergy = form.getByLabel("Add an allergy");
  await allergy.fill("cashew nuts");
  await expect(form.getByRole("status").filter({ hasText: "covers" })).toContainText("Tree nuts covers");
  await form.getByRole("button", { name: "+ tree nuts" }).click();
  await expect(form.getByRole("button", { name: "Remove tree nuts" })).toBeVisible();
  await expect(form.getByText("Always check labels.")).toBeVisible();
  await expect(form.getByText(/safe|nut-free/i)).toHaveCount(0);

  const food = form.getByLabel("Add a food");
  await food.fill("Mushrooms");
  await food.press("Enter");
  await expect(form.getByRole("button", { name: "Remove mushrooms" })).toBeVisible();
  await food.fill("mushrooms");
  await form.getByRole("button", { name: "Add" }).first().click();
  await expect(form.getByText("That’s already on the list.")).toBeVisible();

  // The open editor fits the phone: no sideways scroll, every tap target at least 44 px.
  const fit = await page.evaluate(() => {
    const small = [...document.querySelectorAll<HTMLElement>("form button, form input")]
      .filter((el) => el.offsetParent !== null && el.getBoundingClientRect().height < 43.5)
      .map((el) => el.getAttribute("aria-label") ?? el.textContent ?? el.tagName);
    const root = document.scrollingElement as HTMLElement;
    return { small, wide: root.scrollWidth > root.clientWidth };
  });
  expect(fit).toEqual({ small: [], wide: false });

  await form.getByRole("button", { name: "Save" }).click();
  await expect(youngest(page)).toContainText("Won’t eat mushrooms");
  await expect(youngest(page)).toContainText("Allergy: tree nuts");

  await page.reload();
  await expect(youngest(page)).toContainText("Won’t eat mushrooms");
  await expect(youngest(page)).toContainText("Allergy: tree nuts");

  const { context, page: other } = await joinAsPartner(page, browser);
  await other.goto("/household");
  await expect(youngest(other)).toContainText("Won’t eat mushrooms");
  await expect(youngest(other)).toContainText("Allergy: tree nuts");
  await context.close();
});

test("deleting a person takes a second, explicit step", async ({ page }) => {
  await createHousehold(page, "household-delete");
  await page.goto("/household");
  await expect(page.getByTestId("person-row")).toHaveCount(5);

  await youngest(page).click();
  const form = page.getByRole("form", { name: "Edit Daughter" }).last();
  await form.getByRole("button", { name: "Delete" }).click();
  await expect(form.getByText("Delete Daughter (4)? This can’t be undone.")).toBeVisible();
  await expect(page.getByTestId("person-row")).toHaveCount(5);

  await form.getByRole("button", { name: "Cancel" }).last().click();
  await expect(form.getByText("This can’t be undone.")).toHaveCount(0);
  await expect(page.getByTestId("person-row")).toHaveCount(5);

  await form.getByRole("button", { name: "Delete" }).click();
  await form.getByRole("group", { name: "Confirm delete" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("person-row")).toHaveCount(4);
});
