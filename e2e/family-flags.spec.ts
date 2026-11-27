import { expect, test, type Page } from "@playwright/test";
import { createHousehold, FAMILY, type PersonInput } from "./helpers/household";
import { routeFoodImages } from "./helpers/fixtures";

// Requests from a worker-controlled page can skip page.route on WebKit; keep parity with the other add-meal specs.
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await routeFoodImages(page);
});

const SAFE_WORDS = /\bsafe\b|nut-free/i;

/** The five-person family, where Daughter (4) won't eat mushrooms and is allergic to tree nuts. */
const WITH_LISTS: PersonInput[] = FAMILY.map((p) =>
  p.name === "Daughter" && p.age === 4 ? { ...p, wontEat: ["mushrooms"], allergies: ["tree nuts"] } : p,
);

async function searchFor(page: Page, query: string) {
  await page.getByLabel("What's for dinner?").fill(query);
  await page.getByRole("button", { name: "Search" }).click();
}

const youngest = (page: Page) => page.getByTestId("person-row").last();

test("household: a sixth person can be added and deleted in two taps; won't-eat and allergies fit a phone", async ({ page }) => {
  await createHousehold(page, "family-flags-household");
  await page.goto("/household");
  await expect(page.getByTestId("person-row")).toHaveCount(5);

  // Add a sixth person, open them, and delete them: the first tap only asks.
  await page.getByRole("button", { name: "+ Add" }).click();
  const added = page.getByRole("form", { name: "Add a person" });
  await added.getByLabel("Name").fill("Grandma");
  await added.getByLabel("Age").fill("70");
  await added.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("person-row")).toHaveCount(6);

  await youngest(page).click();
  const sixth = page.getByRole("form", { name: "Edit Grandma" });
  await sixth.getByRole("button", { name: "Delete" }).click();
  await expect(sixth.getByText("Delete Grandma? This can’t be undone.")).toBeVisible();
  await expect(page.getByTestId("person-row")).toHaveCount(6);
  await sixth.getByRole("group", { name: "Confirm delete" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("person-row")).toHaveCount(5);

  // The second Daughter (age 4) is the last row.
  await page.setViewportSize({ width: 360, height: 800 });
  await youngest(page).click();
  const form = page.getByRole("form", { name: "Edit Daughter" });
  const food = form.getByLabel("Add a food");
  await food.fill("Mushrooms");
  await expect(form.getByRole("status").filter({ hasText: "covers" })).toHaveText(
    "Mushrooms covers cremini, portobello, shiitake and the rest.",
  );
  await form.getByRole("group", { name: "Won’t eat" }).getByRole("button", { name: "Add", exact: true }).click();
  await form.getByRole("button", { name: "+ tree nuts" }).click();

  // Every chip, Add button and suggestion is at least 44 px both ways, and nothing scrolls sideways at 360 px.
  const fit = await page.evaluate(() => {
    const small = [...document.querySelectorAll<HTMLElement>('[role="group"] button')]
      .filter((el) => el.offsetParent !== null)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.height < 43.5 || r.width < 43.5;
      })
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
});

test("cards: a won't-eat and an allergy are flagged in plain words, and results survive a tab switch", async ({ page }) => {
  await createHousehold(page, "family-flags-cards", WITH_LISTS);
  await page.goto("/week/add?day=thu&slot=dinner");
  let searches = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/recipes/search") searches++;
  });
  await searchFor(page, "soup");

  const soup = page.getByRole("button", { name: /^White bean and mushroom soup · Budget Bytes/ });
  await expect(soup.getByTestId("result-flag")).toHaveText("Has cremini mushrooms. Daughter (4) won’t eat them.");
  const pilaf = page.getByRole("button", { name: /^Broccolini quinoa pilaf with toasted almonds · Example Kitchen/ });
  await expect(pilaf.getByTestId("result-flag")).toContainText("Tree nut allergy: Daughter (4)");
  await expect(pilaf.getByTestId("result-flag")).toContainText("Lists almonds. Check labels.");
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(SAFE_WORDS);

  // Away to Favorites and back: the same cards, and no second search.
  await page.getByRole("tab", { name: "Favorites" }).click();
  await page.getByRole("tab", { name: "Search" }).click();
  await expect(soup).toBeVisible();
  await expect(pilaf).toBeVisible();
  expect(searches).toBe(1);
});

test("an allergy stays a warning: on the draft, the week row, the meal sheet and Favorites, with no leave-out or swap", async ({ page }) => {
  await createHousehold(page, "family-flags-allergy", WITH_LISTS);
  await page.goto("/week/add?day=thu&slot=dinner");
  await searchFor(page, "soup");
  const pilaf = page.getByRole("button", { name: /^Broccolini quinoa pilaf with toasted almonds · Example Kitchen/ });
  await pilaf.click();
  const box = page.getByTestId("allergy-box");
  await expect(box).toBeVisible();
  await expect(box).toContainText("check every label");

  // "Pick a different dinner" returns to the results with nothing on the week.
  await page.getByRole("button", { name: "Pick a different dinner" }).click();
  await expect(box).toHaveCount(0);
  await expect(pilaf).toBeVisible();
  const other = await page.context().newPage();
  await other.goto("/week");
  await expect(other.getByTestId("day-row-thu")).toContainText("+ Add dinner");
  await other.close();

  await pilaf.click();
  await page.getByRole("button", { name: "Add to Thursday anyway" }).click();
  await expect(page).toHaveURL(/\/week$/);
  const thursday = page.getByTestId("day-row-thu");
  await expect(thursday).toContainText("Tree nut allergy: Daughter (4)");

  await thursday.getByRole("button").click();
  const sheet = page.getByRole("dialog", { name: "Broccolini quinoa pilaf with toasted almonds" });
  await expect(sheet.getByTestId("allergy-box")).toContainText("check every label");
  await expect(sheet.getByRole("button", { name: /^(Leave|Swap) / })).toHaveCount(0);
  expect(await sheet.innerText()).not.toMatch(SAFE_WORDS);
  await sheet.getByRole("button", { name: "Close" }).click();

  await page.goto("/favorites");
  const row = page.getByTestId("favorite-row").filter({ hasText: "Broccolini quinoa pilaf" });
  await expect(row.getByTestId("result-flag")).toContainText("Tree nut allergy: Daughter (4)");
});

/** The first number in the cremini mushrooms row of the shopping list (ounces). */
async function mushroomAmount(page: Page): Promise<number> {
  await page.goto("/list");
  const row = page.getByTestId("list-row").filter({ hasText: "mushrooms" });
  await expect(row).toBeVisible();
  const match = /(\d+(?:\.\d+)?)\s*(?:oz|lb)/.exec(await row.innerText());
  expect(match).not.toBeNull();
  return Number(match![1]);
}

test("a won't-eat can be left out or swapped for one person, and the list follows", async ({ page }) => {
  await createHousehold(page, "family-flags-dislike", WITH_LISTS);
  await page.goto("/week/add?day=fri&slot=dinner");
  await searchFor(page, "soup");
  await page.getByRole("button", { name: /^White bean and mushroom soup · Budget Bytes/ }).click();

  // Leave them out on the draft, then add it.
  const draftBox = page.getByTestId("dislike-box");
  await expect(draftBox).toContainText("Daughter (4) won’t eat mushrooms");
  await expect(draftBox).toContainText("Change it just for Daughter (4)?");
  await draftBox.getByRole("button", { name: "Leave them out" }).click();
  await expect(draftBox).toContainText("Daughter (4): no mushrooms");
  await page.getByRole("button", { name: "Add to Friday" }).click();
  await expect(page).toHaveURL(/\/week$/);
  await expect(page.getByTestId("day-row-fri")).toContainText(/Daughter \(4\): no mushrooms$/);

  const cut = await mushroomAmount(page);

  // "Change", then "Keep it as is": the list buys the full amount again.
  await page.goto("/week");
  await page.getByTestId("day-row-fri").getByRole("button").click();
  const sheet = page.getByRole("dialog", { name: "White bean and mushroom soup" });
  await expect(sheet.getByTestId("dislike-box")).toContainText("Mushrooms cut to 4 people");
  await sheet.getByTestId("dislike-box").getByRole("button", { name: "Change" }).click();
  await sheet.getByRole("button", { name: "Keep it as is" }).click();
  await expect(sheet.getByTestId("dislike-box")).toHaveCount(0);
  await sheet.getByRole("button", { name: "Close" }).click();
  expect(await mushroomAmount(page)).toBeGreaterThan(cut);

  // Swap them for zucchini: the box says so and the list has a zucchini row.
  await page.goto("/week");
  await page.getByTestId("day-row-fri").getByRole("button").click();
  const again = page.getByRole("dialog", { name: "White bean and mushroom soup" });
  await again.getByTestId("dislike-box").getByRole("button", { name: "Swap them" }).click();
  const swap = page.getByRole("dialog", { name: "Instead of mushrooms" });
  await expect(swap).toContainText("For Daughter (4), in White bean and mushroom soup.");
  await swap.getByRole("radio", { name: /Zucchini/ }).check();
  await swap.getByRole("button", { name: "Swap for Daughter (4)" }).click();
  await expect(again.getByTestId("dislike-box")).toContainText("Daughter (4): zucchini instead of mushrooms");
  await again.getByRole("button", { name: "Close" }).click();
  await page.goto("/list");
  await expect(page.getByTestId("list-row").filter({ hasText: "zucchini" })).toBeVisible();
});
