import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createHousehold, joinAsPartner } from "./helpers/household";
import { FOOD_JPG, routeFoodImages } from "./helpers/fixtures";
import { clientFor } from "./helpers/db";
import { addFavoriteToDay, addFromSearch as plan, readWeekBudget, seedDinnerOnDay, weekBudget } from "./helpers/flows-a";
import { pinToday } from "./helpers/clock";
import { openItemSheet, openList, setBudget } from "./helpers/flows-b";
import { getOrCreateWeek, setWeekMeal } from "../lib/db/queries/weeks";
import { getMyHousehold } from "../lib/db/queries/household";
import { listFavorites } from "../lib/db/queries/meals";
import { formatDollars } from "../lib/domain/money-input";
import { formatWeekRange, previousWeekStart } from "../lib/week/format";
import { weekStartFor, type Day } from "../lib/domain/weeks";

// The household defaults: Sunday starts the week, Los Angeles time.
const thisWeekStart = () => weekStartFor(new Date(), "sun", "America/Los_Angeles");
const SIGNED_PHOTO = /\/storage\/v1\/object\/sign\/meal-photos\//;

// The app now registers its service worker on every screen. WebKit lets requests from a worker-controlled page
// skip page.route, so these tests (which mock /api/recipes/search) run without the worker.
test.use({ serviceWorkers: "block" });

// Tonight is Wednesday unless a test pins another day; no test below plans a Wednesday.
test.beforeEach(async ({ page }) => {
  await routeFoodImages(page, { wide: /wide\.jpg/, failing: /gone\.jpg/, tiny: /tiny\.jpg/ });
  await pinToday(page, "wed");
});

async function searchFor(page: Page, query: string) {
  await page.getByLabel("What's for dinner?").fill(query);
  await page.getByRole("button", { name: "Search" }).click();
}

/** Search → pick the card with this name → "Add to <Day>". */
const addFromSearch = (page: Page, day: Day, query: string, pick: string) => plan(page, { day, query, pick });

test("this week: add a search result to Thursday, with a photo and a swap", async ({ page }, testInfo) => {
  const shots = `e2e/screenshots/${testInfo.project.name}`;
  await createHousehold(page);

  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await expect(page.getByTestId("week-range")).toHaveText(formatWeekRange(thisWeekStart()));
  await expect(page.getByRole("link", { name: /Add dinner/ })).toHaveCount(7);
  await expect.poll(async () => (await readWeekBudget(page)).text).toContain("$0.00 of $200");
  await expect.poll(async () => (await readWeekBudget(page)).text).toContain("$200 left");
  await expect(page.getByRole("button", { name: /Repeat/ })).toBeDisabled();

  const build = page.getByRole("link", { name: "Build shopping list" });
  await expect(build).toBeVisible();
  const box = await build.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.y + box.height >= viewport.height - 120).toBe(true);
  await page.screenshot({ path: `${shots}/week.png`, fullPage: true });

  await page.getByTestId("day-row-thu").getByRole("link", { name: /Add dinner/ }).click();
  await expect(page).toHaveURL(/\/week\/add\?day=thu&slot=dinner$/);
  await expect(page.getByRole("heading", { name: "Thursday dinner" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Search" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("radio", { name: "Big sites" })).toBeChecked();

  await searchFor(page, "tacos");
  const cards = page.getByTestId("result-card");
  await expect(cards.first()).toBeVisible();
  const n = await cards.count();
  expect(n).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < n; i++) {
    await expect(cards.nth(i).locator("img")).toHaveAttribute("src", /^https:\/\/images\.example\.test\//);
    await expect(cards.nth(i).getByTestId("result-title")).not.toBeEmpty();
    await expect(cards.nth(i).getByTestId("result-site")).not.toBeEmpty();
  }
  await expect(cards.first()).toContainText("★ 4.7 · 1,203 ratings");
  await expect(cards.first()).toContainText("Most loved");
  // The spoken name carries the evidence too, and still starts with the title and site.
  await expect(page.getByRole("button", { name: "Chicken tacos · Allrecipes, Most loved, ★ 4.7 · 1,203 ratings · 30 min" })).toBeVisible();
  await expect(cards.nth(1)).not.toContainText("Most loved");
  await expect(cards.nth(1)).toContainText("♥ 340 likes · 30 min");
  await expect(page.getByText("Only a few on the big sites, so here are some from Spoonacular too.")).toBeVisible();
  await page.screenshot({ path: `${shots}/search.png`, fullPage: true });

  await page.getByRole("button", { name: "Chicken tacos · Allrecipes" }).click();
  const draft = page.getByRole("region", { name: "Draft recipe" });
  await expect(draft).toBeVisible();
  await expect(page.getByText("Photo: Allrecipes")).toBeVisible();
  const link = page.getByRole("link", { name: "Open the full recipe" });
  await expect(link).toHaveAttribute("href", "https://www.allrecipes.com/recipe/fake-chicken-tacos");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(draft).toContainText("Scaled to 3.8 servings");
  await expect(page.getByText("Mom's portion: black beans")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Save as a favorite" })).toBeChecked();
  await page.screenshot({ path: `${shots}/add-meal.png`, fullPage: true });

  await page.getByRole("button", { name: "Add to Thursday" }).click();
  await expect(page).toHaveURL(/\/week$/);
  const thu = page.getByTestId("day-row-thu");
  await expect(thu).toContainText("Chicken tacos");
  await expect(thu).toContainText("Mom: black beans instead");
  await expect(thu.locator("img")).toHaveAttribute("src", "https://images.example.test/tacos.jpg");
  await expect(thu.getByRole("img", { name: "Favorite" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Add dinner/ })).toHaveCount(6);
});

test("budget: the week says what is left, into the wiggle room or past it, with the amounts", async ({ page }) => {
  await createHousehold(page);
  await addFromSearch(page, "thu", "tacos", "Chicken tacos · Allrecipes");
  // The dinner's estimate arrives a moment after the week opens; wait until the total stops moving.
  await expect.poll(async () => (await readWeekBudget(page)).totalCents).toBeGreaterThan(0);
  let last = -1;
  await expect
    .poll(async () => {
      const now = (await readWeekBudget(page)).totalCents;
      const stable = now === last;
      last = now;
      return stable;
    }, { intervals: [500] })
    .toBe(true);
  const { totalCents } = await readWeekBudget(page);
  const dollars = Math.ceil(totalCents / 100);
  const total = formatDollars(totalCents);

  const says = async (target: number, words: string, left: RegExp) => {
    await weekBudget(page);
    await expect.poll(async () => (await readWeekBudget(page)).text).toContain(words);
    await expect.poll(async () => (await readWeekBudget(page)).text).toContain(`${total} of $${target}`);
    await expect.poll(async () => (await readWeekBudget(page)).text).toMatch(left);
  };

  // At or under the target.
  await setBudget(page, { target: dollars, wiggle: 5 });
  await says(dollars, "left", /left/);
  // Over the target by less than the wiggle room.
  await setBudget(page, { target: dollars - 1 });
  await says(dollars - 1, "into the wiggle room", /\$\d[\d.]* into the wiggle room/);
  // Over by more than the wiggle room (between $1 and $2 over the target, with $1 of room).
  await setBudget(page, { target: dollars - 2, wiggle: 1 });
  await says(dollars - 2, "past the wiggle room", /\$\d[\d.]* past the wiggle room/);
});

test("sources: the toggle, the Spoonacular footer, the fallback note and the limit message", async ({ page }) => {
  await createHousehold(page);
  await page.goto("/week/add?day=mon&slot=dinner");

  await page.getByRole("radio", { name: "Spoonacular" }).click();
  await expect(page.getByRole("radio", { name: "Spoonacular" })).toBeChecked();
  await searchFor(page, "tacos");
  await expect(page.getByTestId("result-card").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Recipes from Spoonacular" })).toHaveAttribute(
    "href",
    "https://spoonacular.com",
  );

  await page.reload();
  await expect(page.getByRole("radio", { name: "Spoonacular" })).toBeChecked();

  await page.getByRole("radio", { name: "Big sites" }).click();
  await searchFor(page, "lasagna");
  await expect(page.getByText("Nothing on the big sites, so here's Spoonacular.")).toBeVisible();
  await expect(page.getByTestId("result-card").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Recipes from Spoonacular" })).toBeVisible();

  await searchFor(page, "zzzz nothing");
  await expect(
    page.getByText("No recipes found on our sites. Try other words, or paste a recipe."),
  ).toBeVisible();

  await page.route("**/api/recipes/search", (route) =>
    route.fulfill({ status: 429, contentType: "application/json", body: '{"error":"source_limit"}' }),
  );
  await page.getByRole("radio", { name: "Spoonacular" }).click();
  await searchFor(page, "tacos");
  await expect(page.getByText("Spoonacular's daily limit is used up. Big sites still works.")).toBeVisible();

  await page.unroute("**/api/recipes/search");
  await page.route("**/api/recipes/search", (route) =>
    route.fulfill({ status: 402, contentType: "application/json", body: '{"error":"cap_reached"}' }),
  );
  await searchFor(page, "tacos");
  await expect(
    page.getByText("This month's recipe help is used up. You can still type the ingredients in."),
  ).toBeVisible();
});

test("photos: a broken image becomes an Add a photo tile; Change photo uploads one; paste gets a photo", async ({
  page,
  browser,
}) => {
  await page.unroute("https://images.example.test/**");
  await routeFoodImages(page, { failing: /tacos\.jpg/ });
  await createHousehold(page);

  await page.goto("/week/add?day=thu&slot=dinner");
  await searchFor(page, "tacos");
  await page.getByRole("button", { name: "Chicken tacos · Allrecipes" }).click();
  await expect(page.getByRole("region", { name: "Draft recipe" }).getByText("Add a photo")).toBeVisible();
  await page.getByRole("button", { name: "Add to Thursday" }).click();
  await expect(page).toHaveURL(/\/week$/);

  const thu = page.getByTestId("day-row-thu");
  await expect(thu.getByText("Add a photo")).toBeVisible();
  await expect(thu.locator("img")).toHaveCount(0);

  await thu.getByRole("button", { name: /Chicken tacos/ }).click();
  const sheet = page.getByRole("dialog", { name: "Chicken tacos" });
  await sheet.getByLabel("Change photo").setInputFiles(FOOD_JPG);
  await expect(sheet.locator("img")).toHaveAttribute("src", SIGNED_PHOTO, { timeout: 15_000 });
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(thu.locator("img")).toHaveAttribute("src", SIGNED_PHOTO);

  await page.goto("/favorites");
  await expect(page.getByTestId("favorite-row").first().locator("img")).toHaveAttribute("src", SIGNED_PHOTO);

  const { context, page: other } = await joinAsPartner(page, browser);
  await other.reload();
  await expect(other.getByTestId("day-row-thu").locator("img")).toHaveAttribute("src", SIGNED_PHOTO);
  await context.close();

  // Paste: plain recipe text; the photo comes from the first search option for its name.
  await page.goto("/week/add?day=fri&slot=dinner");
  await page.getByRole("tab", { name: "Paste" }).click();
  await page
    .getByLabel("Recipe text or link")
    .fill("Chicken pot pie\n2 cups cooked chicken\n1 pie crust\n1 cup frozen peas and carrots");
  await page.getByRole("button", { name: "Read recipe" }).click();
  const draft = page.getByRole("region", { name: "Draft recipe" });
  await expect(draft).toBeVisible();
  await expect(page.getByText("Photo: Taste of Home")).toBeVisible();
  await expect(draft.locator("img").first()).toHaveAttribute("src", "https://images.example.test/pot-pie.jpg");
  await page.getByRole("button", { name: "Add to Friday" }).click();
  await expect(page).toHaveURL(/\/week$/);
  await expect(page.getByTestId("day-row-fri")).toContainText("Chicken pot pie");
  await expect(page.getByTestId("day-row-fri").locator("img")).toHaveAttribute(
    "src",
    "https://images.example.test/pot-pie.jpg",
  );
});

test("interruption: a half-finished meal comes back after a reload, and is cleared once added", async ({
  page,
}) => {
  await createHousehold(page);
  await page.goto("/week/add?day=thu&slot=dinner");
  await searchFor(page, "Chicken pot pie");
  await page.getByRole("button", { name: /Chicken pot pie/ }).click();
  const draft = page.getByRole("region", { name: "Draft recipe" });
  await expect(draft).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("What's for dinner?")).toHaveValue("Chicken pot pie");
  await expect(page.getByRole("region", { name: "Draft recipe" })).toBeVisible();
  await expect(page.getByText("Photo: Taste of Home")).toBeVisible();

  await page.getByRole("button", { name: "Add to Thursday" }).click();
  await expect(page).toHaveURL(/\/week$/);
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("add-meal:")));
  expect(keys).toEqual([]);

  await page.goto("/week/add?day=thu&slot=dinner");
  await expect(page.getByLabel("What's for dinner?")).toHaveValue("");
  await expect(page.getByRole("region", { name: "Draft recipe" })).toHaveCount(0);
});

test("two phones: changes show up live, and a Friday tie ends with one meal", async ({ page, browser }) => {
  const a = page;
  await createHousehold(a);
  await addFromSearch(a, "sat", "pot pie", "Chicken pot pie · Taste of Home");
  await addFromSearch(a, "thu", "tacos", "Chicken tacos · Allrecipes");

  const { context, page: b } = await joinAsPartner(a, browser);
  await pinToday(b, "wed");
  await b.goto("/week");
  await expect(b.locator('[data-live="on"]')).toBeAttached();
  await expect(b.getByTestId("day-row-thu")).toContainText("Chicken tacos");

  // A sets Monday to a favorite; B sees it without reloading.
  await addFavoriteToDay(a, { day: "mon", name: "Chicken tacos" });
  await expect(b.getByTestId("day-row-mon")).toContainText("Chicken tacos", { timeout: 5000 });

  // Both pick a different meal for Friday at the same moment.
  await a.goto("/week/add?day=fri&slot=dinner");
  await b.goto("/week/add?day=fri&slot=dinner");
  await a.getByRole("tab", { name: "Favorites" }).click();
  await b.getByRole("tab", { name: "Favorites" }).click();
  const addA = a.getByRole("button", { name: "Add Chicken tacos to Friday" });
  const addB = b.getByRole("button", { name: "Add Chicken pot pie to Friday" });
  await expect(addA).toBeVisible();
  await expect(addB).toBeVisible();
  await Promise.all([addA.click(), addB.click()]);
  await expect(a).toHaveURL(/\/week$/);
  await expect(b).toHaveURL(/\/week$/);

  await expect
    .poll(
      async () => {
        const [ta, tb] = await Promise.all([
          a.getByTestId("day-row-fri").innerText(),
          b.getByTestId("day-row-fri").innerText(),
        ]);
        const one = /Chicken tacos|Chicken pot pie/.exec(ta)?.[0];
        return one === /Chicken tacos|Chicken pot pie/.exec(tb)?.[0] && !!one && !(ta.includes("Chicken tacos") && ta.includes("Chicken pot pie"));
      },
      { timeout: 5000 },
    )
    .toBe(true);

  // Taking a dinner off a day reaches the other phone too.
  await a.getByTestId("day-row-mon").getByRole("button", { name: /Chicken tacos/ }).click();
  await a.getByRole("dialog").getByRole("button", { name: "Take off Monday" }).click();
  await expect(b.getByTestId("day-row-mon")).toContainText("Add dinner", { timeout: 5000 });
  await context.close();
});

test("favorites are photo tiles; an empty list offers Find a dinner", async ({ page }) => {
  await createHousehold(page);
  await page.goto("/favorites");
  await expect(page.getByText("Nothing saved yet. Meals you keep will wait here.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Find a dinner" })).toHaveAttribute("href", "/week");

  await addFromSearch(page, "thu", "tacos", "Chicken tacos · Allrecipes");
  await page.goto("/favorites");
  const row = page.getByTestId("favorite-row");
  await expect(row).toHaveCount(1);
  // A tile: a photo crop with the name, the made line and the tag under it, and a "+" that is its own button.
  await expect(row.first().locator("img")).toBeVisible();
  await expect(row.first()).toContainText("Made");
  await expect(row.first().getByRole("button", { name: "Add Chicken tacos to this week" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Find a dinner" })).toHaveCount(0);
});

test("the Favorites tab inside Add a meal has no Find a dinner link", async ({ page }) => {
  await createHousehold(page);
  await page.goto("/week/add?day=thu&slot=dinner");
  await page.getByRole("tab", { name: "Favorites" }).click();
  await expect(page.getByText("Nothing saved yet. Meals you keep will wait here.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Find a dinner" })).toHaveCount(0);
});

test("favorites: listed with a photo and tag, searchable, adds to the first empty day; repeat copies last week", async ({
  page,
}, testInfo) => {
  const shots = `e2e/screenshots/${testInfo.project.name}`;
  const email = await createHousehold(page);
  await addFromSearch(page, "thu", "tacos", "Chicken tacos · Allrecipes");

  await page.goto("/favorites");
  await expect(page.getByRole("heading", { name: "Favorites" })).toBeVisible();
  const rows = page.getByTestId("favorite-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Chicken tacos");
  await expect(rows.first()).toContainText("Veg swap");
  await expect(rows.first().locator("img")).toHaveAttribute("src", "https://images.example.test/tacos.jpg");
  await expect(page.getByRole("button", { name: "All 1" })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: `${shots}/favorites.png`, fullPage: true });

  await page.getByLabel("Search favorites").fill("zzz");
  await expect(rows).toHaveCount(0);
  await expect(page.getByText("No favorites match that.")).toBeVisible();
  await page.getByLabel("Search favorites").fill("taco");
  await expect(rows).toHaveCount(1);
  await page.getByLabel("Search favorites").fill("corn tortillas");
  await expect(rows).toHaveCount(1);
  await page.getByLabel("Search favorites").fill("");
  await page.getByRole("button", { name: "Vegetarian" }).click();
  await expect(rows).toHaveCount(0);
  await page.getByRole("button", { name: /^All/ }).click();

  await page.getByRole("button", { name: "Add Chicken tacos to this week" }).click();
  await expect(page.getByText("Added Chicken tacos to Sunday.")).toBeVisible();
  await page.goto("/week");
  await expect(page.getByTestId("day-row-sun")).toContainText("Chicken tacos");

  // Repeat: seed last week with one dinner (Monday) straight in the database.
  const sb = await clientFor(email);
  const household = await getMyHousehold(sb);
  const [meal] = await listFavorites(sb, household!.id);
  const prev = await getOrCreateWeek(sb, household!.id, previousWeekStart(thisWeekStart()));
  await setWeekMeal(sb, prev.id, "mon", "dinner", meal.id);

  await page.reload();
  const repeat = page.getByRole("button", { name: /Repeat/ });
  await expect(repeat).toBeEnabled();
  await repeat.click();
  const confirm = page.getByRole("dialog");
  await expect(confirm).toContainText("Copy last week’s dinners into this week? This replaces what’s planned.");
  await confirm.getByRole("button", { name: "Copy dinners" }).click();
  await expect(page.getByTestId("day-row-mon")).toContainText("Chicken tacos");
  await expect(page.getByTestId("day-row-thu")).toContainText("Add dinner");
  await expect(page.getByTestId("day-row-sun")).toContainText("Add dinner");
});

test("add a meal: bad links go back to the week; ingredients can be edited before saving", async ({ page }) => {
  const email = await createHousehold(page);
  for (const bad of ["day=constructor&slot=dinner", "day=thu&slot=lunch", "day=__proto__&slot=dinner"]) {
    await page.goto(`/week/add?${bad}`);
    await expect(page).toHaveURL(/\/week$/);
  }

  await page.goto("/week/add?day=thu&slot=dinner");
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await searchFor(page, "tacos");
  await page.getByRole("button", { name: "Chicken tacos · Allrecipes" }).click();
  const draft = page.getByRole("region", { name: "Draft recipe" });
  // 12 tortillas for 4 servings is 11.4 for this household: shown rounded up.
  await expect(draft.getByText("Corn tortillas")).toBeVisible();
  await expect(draft.getByText("12", { exact: true })).toBeVisible();

  await draft.getByRole("button", { name: "Edit ingredients" }).click();
  const tortillas = draft.getByRole("group", { name: "Ingredient 2" });
  await expect(tortillas.getByLabel("Name")).toHaveValue("corn tortillas");
  await tortillas.getByLabel("Amount").fill("8");
  await draft.getByRole("button", { name: "Remove yellow onion" }).click();
  await draft.getByRole("button", { name: "+ Add ingredient" }).click();
  const added = draft.getByRole("group", { name: "Ingredient 3" });
  await added.getByLabel("Name").fill("lime");
  await added.getByLabel("Amount").fill("0");
  await draft.getByRole("button", { name: "Done" }).click();
  await expect(draft.getByRole("alert")).toContainText("needs a name, an amount above zero and a unit");
  await added.getByLabel("Amount").fill("2");
  await draft.getByRole("button", { name: "Done" }).click();
  await expect(draft.getByText("Lime")).toBeVisible();
  await expect(draft.getByText("Yellow onion")).toHaveCount(0);
  await expect(draft.getByText("8", { exact: true })).toBeVisible(); // 8 * 3.8 / 4 = 7.6, up to 8

  await page.getByRole("button", { name: "Add to Thursday" }).click();
  await expect(page).toHaveURL(/\/week$/);

  const sb = await clientFor(email);
  const household = await getMyHousehold(sb);
  const [meal] = await listFavorites(sb, household!.id);
  const lines = meal.ingredients as unknown as { canonical: string; amount: number }[];
  expect(lines.find((l) => l.canonical === "corn tortillas")?.amount).toBe(8);
  expect(lines.find((l) => l.canonical === "lime")?.amount).toBe(2);
  expect(lines.some((l) => l.canonical === "yellow onion")).toBe(false);
});

test("ratings: nothing is clipped on a 360 px screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await createHousehold(page);
  await page.goto("/week/add?day=thu&slot=dinner");
  await searchFor(page, "tacos");
  const first = page.getByTestId("result-card").first();
  await expect(first.getByTestId("result-loved")).toHaveText("Most loved");
  const meta = first.getByTestId("result-meta");
  await expect(meta).toHaveText("★ 4.7 · 1,203 ratings · 30 min");
  expect(await meta.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const box = (await meta.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  expect(box.height).toBeLessThan(24);
});

/** Where an element is on the page, as a plain box. */
async function boxOf(locator: Locator) {
  return (await locator.boundingBox())!;
}

test("tonight with a wide photo leads as the hero", async ({ page }) => {
  const email = await createHousehold(page);
  await seedDinnerOnDay(email, "wed", { name: "Ratatouille with Brie", photoUrl: "https://images.example.test/wide.jpg", width: 800, credit: "Foodista" });
  await page.reload();
  const hero = page.locator("[data-tonight]");
  await expect(hero).toContainText("Tonight · Wednesday");
  await expect(hero).toContainText("Ratatouille with Brie");
  await expect(hero).toContainText("Photo: Foodista");
  await expect(hero.locator("img")).toHaveCSS("opacity", "1");
  const box = await boxOf(hero);
  expect(box.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);
  expect(Math.abs(box.width / box.height - 2)).toBeLessThan(0.02);
  // It sits directly under the header, before the pinboard.
  await expect(page.getByTestId("day-row-wed")).toHaveAttribute("data-tonight");
  expect((await boxOf(hero)).y).toBeLessThan((await boxOf(page.getByRole("region", { name: "Dinners" }))).y);
});

test("tonight with a small photo is a tile marked Tonight, never a hero", async ({ page }) => {
  const email = await createHousehold(page);
  await seedDinnerOnDay(email, "wed", { name: "Small photo soup", photoUrl: "https://images.example.test/small.jpg", width: 400 });
  await page.reload();
  const tonight = page.getByTestId("day-row-wed");
  await expect(tonight).toContainText("Tonight");
  await expect(tonight).toContainText("Small photo soup");
  await expect(page.locator("[data-tonight]")).toHaveCount(0);
  const board = page.getByRole("region", { name: "Dinners" });
  await expect(board.getByTestId(/^day-row-/).first()).toHaveAttribute("data-testid", "day-row-wed");
  expect((await boxOf(tonight)).width).toBeLessThan(page.viewportSize()!.width / 2);
});

test("a photo of unknown width never shows as a hero and then collapses", async ({ page }) => {
  const email = await createHousehold(page);
  const { sb, mealId } = await seedDinnerOnDay(email, "wed", { name: "Held soup", photoUrl: "https://images.example.test/held.jpg", width: null });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("https://images.example.test/held.jpg", async (route) => {
    await gate;
    await route.fulfill({ status: 200, contentType: "image/jpeg", body: readFileSync(FOOD_JPG) });
  });
  await page.reload();
  const tonight = page.getByTestId("day-row-wed");
  await expect(tonight.locator("[data-photo-state='loading']")).toBeVisible();
  await expect(page.locator("[data-tonight]")).toHaveCount(0);
  const before = await boxOf(tonight);

  release();
  await expect(tonight.locator("[data-photo-state='ready']")).toBeVisible();
  const after = await boxOf(tonight);
  expect(Math.abs(after.x - before.x)).toBeLessThan(1);
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  expect(Math.abs(after.width - before.width)).toBeLessThan(1);
  expect(Math.abs(after.height - before.height)).toBeLessThan(1);
  // The week writes the width back once, and the small photo stays a tile.
  await expect.poll(async () => (await sb.from("meals").select("photo_width").eq("id", mealId).single()).data?.photo_width).toBe(400);
  await expect(page.locator("[data-tonight]")).toHaveCount(0);
});

test("no dinner tonight shows the wide Add dinner row first", async ({ page }) => {
  await createHousehold(page);
  const board = page.getByRole("region", { name: "Dinners" });
  const first = board.getByTestId(/^day-row-/).first();
  await expect(first).toHaveAttribute("data-testid", "day-row-wed");
  await expect(first).toContainText("Tonight · Wed");
  await expect(first.getByRole("link", { name: /Add dinner/ })).toBeVisible();
  const link = await boxOf(first.getByRole("link"));
  const section = await boxOf(board);
  expect(link.width).toBeGreaterThan(section.width * 0.85);
  expect(Math.round(link.height)).toBe(52);
});

test("long names and big numbers fit at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const email = await createHousehold(page);
  await seedDinnerOnDay(email, "thu", { name: "W".repeat(80), photoUrl: "https://images.example.test/small.jpg", width: 400 });
  await addFromSearch(page, "fri", "tacos", "Chicken tacos · Allrecipes");
  await setBudget(page, { target: 10000, wiggle: 500 });
  // A price typed on one row makes the week's total a long amount.
  await openList(page);
  const sheet = await openItemSheet(page, "Corn tortillas");
  await sheet.getByRole("button", { name: "Set price" }).click();
  await sheet.getByLabel("Price").fill("$1234.56");
  await sheet.getByRole("button", { name: "Save price" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "This week" }).click();
  await expect(page).toHaveURL(/\/week$/);
  const thu = page.getByTestId("day-row-thu");
  await expect(thu).toContainText("WWWW");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const name = await boxOf(thu.locator(".line-clamp-2"));
  expect(name.height).toBeLessThanOrEqual(41);
  const budget = page.getByRole("region", { name: "Budget" });
  await expect.poll(async () => (await readWeekBudget(page)).text).toContain("of $10,000");
  await expect.poll(async () => (await readWeekBudget(page)).totalCents).toBeGreaterThanOrEqual(123456);
  expect((await readWeekBudget(page)).text).toMatch(/\$1,\d{3}\.\d{2}/);
  const total = await boxOf(budget.locator("strong"));
  expect(total.height).toBeLessThan(24);
});

test("a width of 0 never makes a tiny photo the hero", async ({ page }) => {
  const email = await createHousehold(page);
  await seedDinnerOnDay(email, "wed", { name: "Tiny photo soup", photoUrl: "https://images.example.test/tiny.jpg", width: 0 });
  await page.reload();
  const tonight = page.getByTestId("day-row-wed");
  await expect(tonight).toContainText("Tonight");
  await expect(tonight).toContainText("Tiny photo soup");
  await expect(page.locator("[data-tonight]")).toHaveCount(0);
  await expect(tonight.locator("[data-photo-state='fallback']")).toBeVisible();
});

test("a hero whose photo fails to load falls back to a tile marked Tonight", async ({ page }) => {
  const email = await createHousehold(page);
  await seedDinnerOnDay(email, "wed", { name: "Gone photo soup", photoUrl: "https://images.example.test/gone.jpg", width: 800 });
  await page.reload();
  const tonight = page.getByTestId("day-row-wed");
  await expect(tonight).toContainText("Gone photo soup");
  await expect(page.locator("[data-tonight]")).toHaveCount(0);
  await expect(tonight).toContainText("Tonight");
  await expect(tonight.getByText("Add a photo")).toBeVisible();
  await expect(tonight.locator("img")).toHaveCount(0);
  expect((await boxOf(tonight)).width).toBeLessThan(page.viewportSize()!.width / 2 + 1);
});

test("a tile keeps what is different about the night, not the everyone line", async ({ page }) => {
  const email = await createHousehold(page);
  const { sb, mealId } = await seedDinnerOnDay(email, "thu", { name: "Leftover soup" });
  await sb.from("week_meals").update({ servings_override: 5.8 }).eq("meal_id", mealId);
  await page.reload();
  const tile = page.getByTestId("day-row-thu");
  await expect(tile).toContainText("+2 for leftovers");
  await expect(tile).not.toContainText("Everyone vegetarian");
});

test("the pinboard reads in week order", async ({ page }) => {
  const email = await createHousehold(page);
  await seedDinnerOnDay(email, "mon", { name: "Monday soup" });
  await seedDinnerOnDay(email, "fri", { name: "Friday soup" });
  const order = () => page.locator('[data-testid^="day-row-"]').evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")!.slice(8)));

  // Tonight is the first day of the week: the order is the week's (a row-by-row grid, so DOM order is reading order).
  await pinToday(page, "sun");
  await page.reload();
  await expect(page.locator('[data-testid^="day-row-"]')).toHaveCount(7);
  expect(await order()).toEqual(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);

  // Tonight is lifted to the front; every other day keeps the week's order.
  await pinToday(page, "wed");
  await page.reload();
  await expect(page.locator('[data-testid^="day-row-"]')).toHaveCount(7);
  expect(await order()).toEqual(["wed", "sun", "mon", "tue", "thu", "fri", "sat"]);
});

test("a tile and the Add row beside it are as tall as each other, and the days read left to right", async ({ page }) => {
  const email = await createHousehold(page);
  await seedDinnerOnDay(email, "mon", { name: "A rather long name for a Monday soup that wraps", photoUrl: "https://images.example.test/small.jpg", width: 400 });
  await seedDinnerOnDay(email, "thu", { name: "Thursday soup" });
  await pinToday(page, "sun");
  await page.reload();
  await expect(page.locator('[data-testid^="day-row-"]')).toHaveCount(7);

  const mon = await boxOf(page.getByTestId("day-row-mon"));
  const tue = await boxOf(page.getByTestId("day-row-tue"));
  expect(Math.abs(mon.height - tue.height)).toBeLessThan(1);
  expect(Math.abs(mon.y - tue.y)).toBeLessThan(1);
  expect(mon.x).toBeLessThan(tue.x);
  // The Add row fills its cell, so there is no hole under it.
  const add = await boxOf(page.getByTestId("day-row-tue").getByRole("link"));
  expect(Math.abs(add.height - tue.height)).toBeLessThan(1);

  const days = ["mon", "tue", "wed", "thu", "fri", "sat"];
  const boxes = await Promise.all(days.map(async (d) => ({ d, ...(await boxOf(page.getByTestId(`day-row-${d}`))) })));
  const reading = [...boxes].sort((a, b) => Math.round(a.y) - Math.round(b.y) || a.x - b.x).map((b) => b.d);
  expect(reading).toEqual(days);
});
