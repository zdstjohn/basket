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
  await allergy.fill(""); // left in the box, it would be added on Save
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
  await food.fill(""); // text left in the box would be added (and refused) on Save

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

test("text left in a box is added on Save, or Save stops and says why", async ({ page }) => {
  await createHousehold(page, "household-pending");
  await page.goto("/household");
  await youngest(page).click();
  const form = page.getByRole("form", { name: "Edit Daughter" }).last();

  await form.getByLabel("Add an allergy").fill("peanuts");
  await form.getByLabel("Add a food").fill("olives");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(youngest(page)).toContainText("Allergy: peanuts");
  await expect(youngest(page)).toContainText("Won’t eat olives");

  // A duplicate left in the box stops the save, keeps the editor open, and says so.
  await youngest(page).click();
  await form.getByLabel("Add an allergy").fill("Peanuts");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByRole("alert")).toContainText("That’s already on the list.");
  await expect(form).toBeVisible();
});

test("a typo is called out, the suggestions stay, and each allergy says what it covers", async ({ page }) => {
  await createHousehold(page, "household-typo");
  await page.goto("/household");
  await youngest(page).click();
  const form = page.getByRole("form", { name: "Edit Daughter" }).last();
  const exact = "Basket will look for these exact words only.";

  const box = form.getByLabel("Add an allergy");
  await box.fill("penuts");
  await expect(form.getByRole("status").filter({ hasText: exact })).toBeVisible();
  await box.press("Enter");
  await expect(form.getByRole("button", { name: "Remove penuts" })).toBeVisible();
  await expect(form.getByText(exact)).toBeVisible(); // on the chip
  await expect(form.getByRole("button", { name: "+ milk" })).toBeVisible();

  await form.getByRole("button", { name: "+ peanuts" }).click();
  await form.getByRole("button", { name: "+ milk" }).click();
  const allergies = form.getByRole("group", { name: "Allergies" });
  await expect(allergies).toContainText("Peanuts covers");
  await expect(allergies).toContainText("Milk covers");

  // Only the × removes a chip, and focus lands back in the box.
  await allergies.getByText("milk", { exact: true }).click();
  await expect(form.getByRole("button", { name: "Remove milk" })).toBeVisible();
  await form.getByRole("button", { name: "Remove penuts" }).click();
  await expect(form.getByRole("button", { name: "Remove penuts" })).toHaveCount(0);
  await expect(box).toBeFocused();
  await expect(form.getByText(exact)).toHaveCount(0);
});

test("a delete confirm puts focus on Cancel", async ({ page }) => {
  await createHousehold(page, "household-focus");
  await page.goto("/household");
  await youngest(page).click();
  const form = page.getByRole("form", { name: "Edit Daughter" }).last();
  await form.getByRole("button", { name: "Delete" }).click();
  await expect(form.getByRole("group", { name: "Confirm delete" }).getByRole("button", { name: "Cancel" })).toBeFocused();
});

test("an allergy added on another phone shows up here and is not wiped by a save", async ({ page, browser }) => {
  await createHousehold(page, "household-stale");
  const { context, page: other } = await joinAsPartner(page, browser); // leaves phone 1 on /household
  await page.goto("/household");
  await youngest(page).click();
  const mine = page.getByRole("form", { name: "Edit Daughter" }).last();
  await expect(mine).toBeVisible();

  await other.goto("/household");
  await youngest(other).click();
  const theirs = other.getByRole("form", { name: "Edit Daughter" }).last();
  await theirs.getByRole("button", { name: "+ sesame" }).click();
  await theirs.getByRole("button", { name: "Save" }).click();
  await expect(youngest(other)).toContainText("Allergy: sesame");

  // No reload here: the row, and a note in the open editor, catch up on their own.
  await expect(youngest(page)).toContainText("Allergy: sesame");
  await expect(mine.getByText("Changed on the other phone. Your edits are kept; check before saving.")).toBeVisible();
  await expect(mine.getByRole("button", { name: "Remove sesame" })).toBeVisible();

  await mine.getByLabel("Appetite").selectOption({ label: "Big appetite" });
  await mine.getByRole("button", { name: "Save" }).click();
  await expect(youngest(page)).toContainText("Allergy: sesame");
  await page.reload();
  await expect(youngest(page)).toContainText("Allergy: sesame");
  await youngest(page).click();
  await expect(page.getByRole("form", { name: "Edit Daughter" }).last().getByLabel("Appetite")).toHaveValue("1.25");
  await context.close();
});
