import { expect, test, type Page } from "@playwright/test";
import { createHousehold, joinAsPartner } from "./helpers/household";
import { routeFoodImages } from "./helpers/fixtures";
import { clientFor } from "./helpers/db";
import { getOrCreateWeek, setWeekMeal } from "../lib/db/queries/weeks";
import { getMyHousehold } from "../lib/db/queries/household";
import { todayIn, weekStartFor, type Day } from "../lib/domain/weeks";
import { addDays } from "../lib/week/format";

// The app registers its service worker on every screen; WebKit lets requests from a worker-controlled
// page skip page.route, and one test below fails a request on purpose.
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await routeFoodImages(page);
});

const DAY_IDS: Day[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const weekday = (ymd: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`));

/** Puts a dinner on the week `daysAgo` days back from today (in the household's time zone), straight in the database. */
async function seedDinner(email: string, name: string, daysAgo: number) {
  const sb = await clientFor(email);
  const household = (await getMyHousehold(sb))!;
  const date = addDays(todayIn(household.time_zone), -daysAgo);
  const { data: meal, error } = await sb
    .from("meals")
    .insert({ household_id: household.id, name, base_servings: 4, photo_url: "https://images.example.test/soup.jpg" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const start = weekStartFor(new Date(`${date}T12:00:00Z`), household.week_start as Day, household.time_zone);
  const week = await getOrCreateWeek(sb, household.id, start);
  const day = DAY_IDS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  await setWeekMeal(sb, week.id, day, "dinner", meal.id);
  return { sb, household, meal, date };
}

const card = (page: Page) => page.getByTestId("verdict-card");

test("how was dinner: one tap for everyone, then Saved, then the card is gone for good", async ({ page }, testInfo) => {
  const shots = `e2e/screenshots/${testInfo.project.name}`;
  const email = await createHousehold(page);
  const { sb, date } = await seedDinner(email, "Tuscan white bean soup", 1);
  await page.reload();

  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText(`How was ${weekday(date)}’s dinner?`);
  await expect(card(page)).toContainText("Tuscan white bean soup");
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await page.screenshot({ path: `${shots}/verdict-card.png`, fullPage: true });

  await card(page).getByRole("button", { name: "Everyone liked it" }).click();
  const saved = page.getByTestId("verdict-saved");
  await expect(saved).toContainText("Saved. Everyone liked Tuscan white bean soup.");
  await expect(card(page)).toHaveCount(0);
  await page.screenshot({ path: `${shots}/verdict-saved.png` });

  // One row for the dinner, everybody up.
  const { data } = await sb.from("meal_verdicts").select("eaten_on, status, votes");
  expect(data).toHaveLength(1);
  expect(data![0]).toMatchObject({ eaten_on: date, status: "answered" });
  expect(Object.values(data![0].votes as Record<string, string>)).toEqual(["up", "up", "up", "up", "up"]);

  // "Saved." lets go after about six seconds, and the dinner is not asked about again.
  await expect(saved).toHaveCount(0, { timeout: 12_000 });
  await expect(card(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Dinners" })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test("not everyone: an answer for each person, the live line, Save, and Change", async ({ page }, testInfo) => {
  const shots = `e2e/screenshots/${testInfo.project.name}`;
  const email = await createHousehold(page);
  const { sb } = await seedDinner(email, "Tuscan white bean soup", 1);
  await page.reload();

  await card(page).getByRole("button", { name: "Not everyone" }).click();
  const sheet = page.getByRole("dialog", { name: "Tuscan white bean soup" });
  await expect(sheet).toContainText("Who liked it? Answer for the kids too.");
  // Two people share a name, so each is written with their age.
  for (const name of ["Dad", "Mom", "Son", "Daughter (6)", "Daughter (4)"]) {
    const group = sheet.getByRole("radiogroup", { name, exact: true });
    await expect(group).toBeVisible();
    await expect(group.getByRole("radio", { name: "Liked it" })).toBeChecked();
  }
  await expect(sheet.locator("[aria-live=polite]")).toHaveText("Everyone liked it");

  await sheet.getByRole("radiogroup", { name: "Daughter (4)" }).getByRole("radio", { name: "Didn’t like" }).click();
  await expect(sheet.locator("[aria-live=polite]")).toHaveText("4 of 5 liked it");
  await sheet.getByRole("radiogroup", { name: "Son" }).getByRole("radio", { name: "Didn’t try" }).click();
  await expect(sheet.locator("[aria-live=polite]")).toHaveText("3 of 4 liked it · 1 didn’t try");
  await page.screenshot({ path: `${shots}/verdict-sheet.png` });

  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("verdict-saved")).toContainText("Saved. Tuscan white bean soup: 3 of 4 liked it · 1 didn’t try.");
  const { data } = await sb.from("meal_verdicts").select("votes");
  expect(Object.values(data![0].votes as Record<string, string>).sort()).toEqual(["down", "skip", "up", "up", "up"]);

  // Change reopens the sheet with what was saved, and the new answer replaces the old one.
  await page.getByTestId("verdict-saved").getByRole("button", { name: "Change" }).click();
  const again = page.getByRole("dialog", { name: "Tuscan white bean soup" });
  await expect(again.getByRole("radiogroup", { name: "Daughter (4)" }).getByRole("radio", { name: "Didn’t like" })).toBeChecked();
  await again.getByRole("radiogroup", { name: "Daughter (4)" }).getByRole("radio", { name: "Liked it" }).click();
  await again.getByRole("radiogroup", { name: "Son" }).getByRole("radio", { name: "Liked it" }).click();
  await again.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("verdict-saved")).toContainText("Saved. Everyone liked Tuscan white bean soup.");
  const { data: after } = await sb.from("meal_verdicts").select("votes");
  expect(after).toHaveLength(1);
  expect(Object.values(after![0].votes as Record<string, string>)).toEqual(["up", "up", "up", "up", "up"]);
});

test("the meal sheet remembers: Last time, and Change", async ({ page }) => {
  const email = await createHousehold(page);
  const { sb, household, meal, date } = await seedDinner(email, "Tuscan white bean soup", 3);
  // Today's week row holds the same meal, so it can be opened from the week.
  const weekStart = weekStartFor(new Date(), household.week_start as Day, household.time_zone);
  const week = await getOrCreateWeek(sb, household.id, weekStart);
  const today = DAY_IDS[new Date(`${todayIn(household.time_zone)}T00:00:00Z`).getUTCDay()];
  await setWeekMeal(sb, week.id, today, "dinner", meal.id);
  const people = (await sb.from("people").select("id").eq("household_id", household.id)).data!;
  const votes = Object.fromEntries(people.map((p, i) => [p.id, i === 0 ? "down" : "up"]));
  await sb.from("meal_verdicts").insert({ household_id: household.id, meal_id: meal.id, eaten_on: date, status: "answered", votes });
  await page.reload();
  await expect(card(page)).toHaveCount(0);

  await page.getByTestId(`day-row-${today}`).getByRole("button").click();
  const sheet = page.getByRole("dialog", { name: "Tuscan white bean soup" });
  await expect(sheet.getByTestId("last-time")).toHaveText("Last time: 4 of 5 liked it");
  await sheet.getByRole("button", { name: "Change", exact: true }).click();
  const change = page.getByRole("dialog").last();
  await change.getByRole("radiogroup", { name: "Dad" }).getByRole("radio", { name: "Liked it" }).click();
  await change.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByTestId("last-time")).toHaveText("Last time: Everyone liked it");
  const { data } = await sb.from("meal_verdicts").select("eaten_on");
  expect(data).toEqual([{ eaten_on: date }]);
});

test("skip: the card goes, the skip is kept, and it does not come back", async ({ page }) => {
  const email = await createHousehold(page);
  const { sb } = await seedDinner(email, "Tuscan white bean soup", 1);
  await page.reload();
  await card(page).getByRole("button", { name: "Skip" }).click();
  await expect(card(page)).toHaveCount(0);
  await expect.poll(async () => (await sb.from("meal_verdicts").select("status")).data).toEqual([{ status: "skipped" }]);
  await page.reload();
  await expect(page.getByRole("region", { name: "Dinners" })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test("nothing to ask: tonight's dinner and an old one show no card, and the week looks as before", async ({ page }) => {
  const email = await createHousehold(page);
  await seedDinner(email, "Tonight soup", 0);
  await seedDinner(email, "Old soup", 5);
  await page.reload();
  await expect(page.getByRole("region", { name: "Dinners" })).toBeVisible();
  await expect(page.getByTestId(/^day-row-/).first()).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByTestId("verdict-saved")).toHaveCount(0);
});

test("a save that fails puts the question back", async ({ page }) => {
  const email = await createHousehold(page);
  await seedDinner(email, "Tuscan white bean soup", 1);
  await page.reload();
  await page.route("**/rest/v1/meal_verdicts*", (route) =>
    route.request().method() === "POST" ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" }) : route.continue(),
  );
  await card(page).getByRole("button", { name: "Everyone liked it" }).click();
  await expect(card(page).getByRole("alert")).toHaveText("That didn’t save. Try again.");
  await expect(card(page).getByRole("button", { name: "Everyone liked it" })).toBeEnabled();

  // Back on the network, the same button works.
  await page.unroute("**/rest/v1/meal_verdicts*");
  await card(page).getByRole("button", { name: "Everyone liked it" }).click();
  await expect(page.getByTestId("verdict-saved")).toContainText("Saved.");
});

test("no signal: both answers are off and the card says so", async ({ page, context }) => {
  const email = await createHousehold(page);
  await seedDinner(email, "Tuscan white bean soup", 1);
  await page.reload();
  await expect(card(page)).toBeVisible();
  await context.setOffline(true);
  await expect(card(page)).toContainText("You’re offline. This will keep until you’re back.");
  await expect(card(page).getByRole("button", { name: "Everyone liked it" })).toBeDisabled();
  await expect(card(page).getByRole("button", { name: "Not everyone" })).toBeDisabled();
  await context.setOffline(false);
  await expect(card(page).getByRole("button", { name: "Everyone liked it" })).toBeEnabled();
});

test("two phones: one answers, and the other phone's card goes without a reload", async ({ page, browser }) => {
  const email = await createHousehold(page);
  await seedDinner(email, "Tuscan white bean soup", 1);
  const partner = await joinAsPartner(page, browser);
  try {
    await page.goto("/week");
    await expect(card(page)).toBeVisible();
    await expect(card(partner.page)).toBeVisible();
    // The other phone has to be listening before the answer goes in.
    await expect(partner.page.locator("[data-live=on]")).toBeVisible();

    await card(page).getByRole("button", { name: "Everyone liked it" }).click();
    await expect(page.getByTestId("verdict-saved")).toContainText("Saved.");
    await expect(card(partner.page)).toHaveCount(0);
    await expect(partner.page.getByTestId("verdict-saved")).toHaveCount(0);
  } finally {
    await partner.context.close();
  }
});

test("both phones answer the same dinner: one row, no error on either", async ({ page, browser }) => {
  const email = await createHousehold(page);
  const { sb } = await seedDinner(email, "Tuscan white bean soup", 1);
  const partner = await joinAsPartner(page, browser);
  try {
    await page.goto("/week");
    await expect(card(page)).toBeVisible();
    await expect(card(partner.page)).toBeVisible();
    await expect(page.locator("[data-live=on]")).toBeVisible();
    await expect(partner.page.locator("[data-live=on]")).toBeVisible();
    // Both phones have the card up when each taps: neither may show an error.
    await Promise.all([
      card(page).getByRole("button", { name: "Everyone liked it" }).click(),
      card(partner.page).getByRole("button", { name: "Skip" }).click(),
    ]);
    await expect(page.getByText("That didn’t save")).toHaveCount(0);
    await expect(partner.page.getByText("That didn’t save")).toHaveCount(0);
    await expect.poll(async () => (await sb.from("meal_verdicts").select("status")).data).toHaveLength(1);
    // The answer wins over the skip, whichever came first.
    await expect.poll(async () => (await sb.from("meal_verdicts").select("status")).data?.[0]?.status).toBe("answered");
  } finally {
    await partner.context.close();
  }
});

test("layout: the card and its sheet fit, with every control at least 44px", async ({ page }) => {
  const email = await createHousehold(page);
  await seedDinner(email, "Slow-cooker three-bean chili with cornbread dumplings and quick-pickled red onions", 1);
  await page.reload();
  await expect(card(page)).toBeVisible();

  const fits = async (scope: ReturnType<Page["locator"]>) => {
    const width = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(width.doc).toBeLessThanOrEqual(width.win);
    for (const b of await scope.getByRole("button").all()) {
      const box = await b.boundingBox();
      if (!box) continue;
      expect(box.width, await b.innerText()).toBeGreaterThanOrEqual(44);
      expect(box.height, await b.innerText()).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(width.win + 0.5);
    }
  };
  await fits(card(page));
  await card(page).getByRole("button", { name: "Not everyone" }).click();
  await fits(page.getByRole("dialog"));
});
