import { expect, test, type Page } from "@playwright/test";
import { createHousehold, joinAsPartner } from "./helpers/household";
import { FOOD_JPG, routeFoodImages } from "./helpers/fixtures";
import { clientFor } from "./helpers/db";
import { getOrCreateWeek, setWeekMeal } from "../lib/db/queries/weeks";
import { getMyHousehold } from "../lib/db/queries/household";
import { listFavorites } from "../lib/db/queries/meals";
import { formatWeekRange, previousWeekStart } from "../lib/week/format";
import { weekStartFor } from "../lib/domain/weeks";

// The household defaults: Sunday starts the week, Los Angeles time.
const thisWeekStart = () => weekStartFor(new Date(), "sun", "America/Los_Angeles");
const SIGNED_PHOTO = /\/storage\/v1\/object\/sign\/meal-photos\//;

// The app now registers its service worker on every screen. WebKit lets requests from a worker-controlled page
// skip page.route, so these tests (which mock /api/recipes/search) run without the worker.
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await routeFoodImages(page);
});

async function searchFor(page: Page, query: string) {
  await page.getByLabel("What's for dinner?").fill(query);
  await page.getByRole("button", { name: "Search" }).click();
}

/** Search → pick the first card whose name matches → "Add to <Day>". */
async function addFromSearch(page: Page, day: string, dayLabel: string, query: string, card: string) {
  await page.goto(`/week/add?day=${day}&slot=dinner`);
  await searchFor(page, query);
  await page.getByRole("button", { name: card }).click();
  await expect(page.getByRole("button", { name: `Add to ${dayLabel}` })).toBeVisible();
  await page.getByRole("button", { name: `Add to ${dayLabel}` }).click();
  await expect(page).toHaveURL(/\/week$/);
}

test("this week: add a search result to Thursday, with a photo and a swap", async ({ page }, testInfo) => {
  const shots = `e2e/screenshots/${testInfo.project.name}`;
  await createHousehold(page);

  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await expect(page.getByTestId("week-range")).toHaveText(formatWeekRange(thisWeekStart()));
  await expect(page.getByRole("link", { name: /Add dinner/ })).toHaveCount(7);
  await expect(page.getByRole("region", { name: "Budget" })).toContainText("$0 of $200");
  await expect(page.getByRole("region", { name: "Budget" })).toContainText("On budget");
  const meter = page.getByRole("meter");
  await expect(meter).toHaveAttribute("aria-valuenow", "0");
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
  await expect(cards.first()).toContainText("4.7");
  await expect(cards.nth(1)).toContainText("30 min");
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
  await addFromSearch(a, "sat", "Saturday", "pot pie", "Chicken pot pie · Taste of Home");
  await addFromSearch(a, "thu", "Thursday", "tacos", "Chicken tacos · Allrecipes");

  const { context, page: b } = await joinAsPartner(a, browser);
  await b.goto("/week");
  await expect(b.locator('[data-live="on"]')).toBeAttached();
  await expect(b.getByTestId("day-row-thu")).toContainText("Chicken tacos");

  // A sets Monday to a favorite; B sees it without reloading.
  await a.goto("/week/add?day=mon&slot=dinner");
  await a.getByRole("tab", { name: "Favorites" }).click();
  await a.getByRole("button", { name: "Add Chicken tacos to Monday" }).click();
  await expect(a).toHaveURL(/\/week$/);
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
        return ta === tb && !!one && !(ta.includes("Chicken tacos") && ta.includes("Chicken pot pie"));
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

test("favorites: listed with a photo and tag, searchable, adds to the first empty day; repeat copies last week", async ({
  page,
}, testInfo) => {
  const shots = `e2e/screenshots/${testInfo.project.name}`;
  const email = await createHousehold(page);
  await addFromSearch(page, "thu", "Thursday", "tacos", "Chicken tacos · Allrecipes");

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
  await expect(confirm).toContainText("Copy last week's dinners into this week? This replaces what's planned.");
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
