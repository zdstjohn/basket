import { expect, test, type Page } from "@playwright/test";
import { createHousehold, joinAsPartner } from "./helpers/household";
import { routeFoodImages } from "./helpers/fixtures";
import { clientFor } from "./helpers/db";
import { cookDouble, getOrCreateWeek, listWeekMeals, setWeekMeal } from "../lib/db/queries/weeks";
import { getMyHousehold } from "../lib/db/queries/household";
import { listFavorites } from "../lib/db/queries/meals";
import { doubleServings } from "../lib/domain/leftovers";
import { previousWeekStart } from "../lib/week/format";
import { weekStartFor } from "../lib/domain/weeks";

// Requests from a worker-controlled page can skip page.route on WebKit; keep parity with the other add-meal specs.
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await routeFoodImages(page);
});

const thisWeekStart = () => weekStartFor(new Date(), "sun", "America/Los_Angeles");

async function plan(page: Page, day: string, dayLabel: string, query = "tacos", card = "Chicken tacos · Allrecipes") {
  await page.goto(`/week/add?day=${day}&slot=dinner`);
  await page.getByLabel("What's for dinner?").fill(query);
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: card }).click();
  await page.getByRole("button", { name: `Add to ${dayLabel}` }).click();
  await expect(page).toHaveURL(/\/week$/);
}

const dayRow = (page: Page, day: string) => page.getByTestId(`day-row-${day}`);
const sheet = (page: Page) => page.getByRole("dialog");
const picker = (page: Page) => page.getByTestId("night-picker");
const open = async (page: Page, day: string) => {
  await dayRow(page, day).getByRole("button").click();
  await expect(sheet(page)).toBeVisible();
};
const night = (page: Page, label: string) => picker(page).locator("label", { hasText: label });

/** What the list buys: each row's first amount, and how many rows there are. */
async function readList(page: Page): Promise<{ rows: number; amount: (food: string) => Promise<number> }> {
  await page.goto("/list");
  await expect(page.getByTestId("list-row").first()).toBeVisible();
  const rows = page.getByTestId("list-row");
  return {
    rows: await rows.count(),
    amount: async (food) => {
      const need = await rows.filter({ hasText: food }).first().locator("button span.mt-px").first().innerText();
      const m = /([\d.]+)\s*(oz|lb|g|kg)?/.exec(need);
      if (!m) throw new Error(`no amount in "${need}"`);
      const n = Number(m[1]);
      return m[2] === "lb" ? n * 16 : m[2] === "kg" ? n * 1000 : n;
    },
  };
}

type ListReading = Awaited<ReturnType<typeof readList>>;
/** Waits for the list to show `want` (within 2%) for this food. */
async function expectAmount(list: ListReading, food: string, want: number) {
  await expect.poll(async () => Math.abs((await list.amount(food)) / want - 1), { timeout: 10_000 }).toBeLessThan(0.02);
}

async function backToWeek(page: Page) {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Week" }).click();
  await expect(page).toHaveURL(/\/week$/);
}

/** Chicken tacos on Wednesday; the cook double flow up to the picker. */
async function openPicker(page: Page) {
  await open(page, "wed");
  await page.getByTestId("cook-double").getByRole("button", { name: "Cook double" }).click();
  await expect(picker(page)).toBeVisible();
}

async function cookDoubleTo(page: Page, label: string) {
  await openPicker(page);
  await night(page, label).click();
  await picker(page).getByRole("button", { name: "Cook double", exact: true }).click();
  await expect(page.getByTestId("cook-double")).toContainText("Cooking double");
}

test("cook double, move it, take it off: the week, the sheet and the list agree", async ({ page }, testInfo) => {
  const shots = `e2e/screenshots/${testInfo.project.name}`;
  await createHousehold(page);
  await plan(page, "wed", "Wednesday");
  const first = await readList(page);
  const chicken0 = await first.amount("chicken");
  const tortillas0 = await first.amount("tortillas");
  await backToWeek(page);

  await open(page, "wed");
  await expect(page.getByRole("button", { name: "Fewer leftovers" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "More leftovers" })).toHaveCount(0);
  await expect(page.getByTestId("cook-double")).toContainText("Leftovers night");
  await page.getByTestId("cook-double").getByRole("button", { name: "Cook double" }).click();

  await expect(picker(page)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1); // one dialog at a time
  await expect(picker(page).getByRole("radio")).toHaveCount(4);
  for (const label of ["Thursday", "Friday", "Saturday", "No set night"]) await expect(night(page, label)).toBeVisible();
  await expect(picker(page).getByRole("heading", { name: "Cook double" })).toBeFocused();
  await expect(picker(page).getByRole("radio", { name: /^Thursday/ })).toBeChecked();
  await expect(picker(page).getByText("Mom’s black beans double too.")).toBeVisible();
  await expect(picker(page).getByText("Leftovers are best within 3 to 4 days.")).toBeVisible();
  for (const control of [picker(page).getByRole("button", { name: "Cook double", exact: true }), ...(await night(page, "").all())]) {
    const box = (await control.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: `${shots}/leftovers-picker.png` });

  await night(page, "Friday").click();
  await expect(picker(page).getByText("Friday adds nothing to the list and nothing to the budget.")).toBeVisible();
  await picker(page).getByRole("button", { name: "Cook double", exact: true }).click();
  await expect(page.getByTestId("cook-double")).toContainText("Cooking double");
  await expect(page.getByTestId("cook-double")).toContainText("Leftovers on Friday");
  await page.screenshot({ path: `${shots}/leftovers-done-box.png` });
  await page.getByRole("button", { name: "Close" }).click();
  await expect(dayRow(page, "wed")).toContainText("cooking double");
  await expect(dayRow(page, "fri")).toContainText("Leftovers");
  await expect(dayRow(page, "fri")).toContainText("Chicken tacos, from Wednesday");
  await page.screenshot({ path: `${shots}/leftovers-week.png`, fullPage: true });

  const doubled = await readList(page);
  // The list may show the copy it kept from the last visit for a moment, so read until it has caught up.
  await expectAmount(doubled, "chicken", 2 * chicken0);
  // Counts are bought whole: 12 tortillas for one dinner is 11.4 rounded up; twice that is 22.8, so 23.
  expect(tortillas0).toBe(12);
  await expectAmount(doubled, "tortillas", 23);
  expect(doubled.rows).toBe(first.rows);
  await backToWeek(page);

  // Move it to Saturday from the leftovers sheet.
  await open(page, "fri");
  await expect(sheet(page)).toContainText("Nothing to buy for Friday. It’s all on Wednesday’s list, Mom’s black beans too.");
  await expect(sheet(page)).toContainText("Cooked Wednesday, 2 days before");
  await expect(sheet(page).getByRole("button", { name: "Take off Friday" })).toHaveCSS("color", "rgb(166, 38, 27)");
  await sheet(page).getByRole("button", { name: "Move to another night" }).click();
  await expect(picker(page)).toContainText("Move the leftovers");
  await page.screenshot({ path: `${shots}/leftovers-move-picker.png` });
  // Back returns to the leftovers sheet with focus on the button that opened the picker.
  await picker(page).getByRole("button", { name: "Back", exact: true }).click();
  await expect(sheet(page).getByRole("button", { name: "Move to another night" })).toBeFocused();
  await sheet(page).getByRole("button", { name: "Move to another night" }).click();
  await expect(picker(page).getByRole("radio", { name: /^Friday/ })).toBeChecked();
  await expect(night(page, "Friday")).toContainText("where they are now");
  await night(page, "Saturday").click();
  await picker(page).getByRole("button", { name: "Move", exact: true }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(dayRow(page, "sat")).toContainText("Leftovers");
  await expect(dayRow(page, "fri")).toContainText("Add dinner");

  // Take it off: the cooking night goes back to the usual amount.
  await open(page, "sat");
  await expect(sheet(page)).toContainText("Taking it off puts Wednesday back to the usual amount.");
  await sheet(page).getByRole("button", { name: "Take off Saturday" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(dayRow(page, "sat")).toContainText("Add dinner");
  await expect(dayRow(page, "wed")).not.toContainText("cooking double");
  const back = await readList(page);
  await expectAmount(back, "chicken", chicken0);
  await expectAmount(back, "tortillas", tortillas0);
  expect(back.rows).toBe(first.rows);
});

test("cook double with no set night, and back to the usual amount", async ({ page }) => {
  await createHousehold(page);
  await plan(page, "wed", "Wednesday");
  const before = await (await readList(page)).amount("chicken");
  await backToWeek(page);

  await cookDoubleTo(page, "No set night");
  await expect(page.getByTestId("cook-double")).toContainText("No leftovers night. Extra for lunches.");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("day-row-wed")).toContainText("cooking double");
  await expect(page.locator('[data-testid^="day-row-"]').filter({ hasText: "Leftovers" })).toHaveCount(0);
  await expectAmount(await readList(page), "chicken", 2 * before);
  await backToWeek(page);

  await open(page, "wed");
  await page.getByTestId("cook-double").getByRole("button", { name: "Change" }).click();
  await picker(page).getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByTestId("cook-double").getByRole("button", { name: "Change" })).toBeFocused();
  await page.getByTestId("cook-double").getByRole("button", { name: "Change" }).click();
  await picker(page).getByRole("button", { name: "Back to the usual amount" }).click();
  await expect(page.getByTestId("cook-double")).toContainText("Leftovers night");
  await expect(page.getByTestId("cook-double").getByRole("button", { name: "Cook double" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expectAmount(await readList(page), "chicken", before);
});

test("taking the cooking night off takes its leftovers night too", async ({ page }) => {
  await createHousehold(page);
  await plan(page, "wed", "Wednesday");
  await cookDoubleTo(page, "Friday");
  await page.getByRole("button", { name: "Close" }).click();

  await open(page, "wed");
  const note = page.getByText("Friday’s leftovers come off too.");
  const button = page.getByRole("button", { name: "Take off Wednesday" });
  await expect(note).toBeVisible();
  await expect(button).toHaveCSS("color", "rgb(166, 38, 27)");
  expect((await note.boundingBox())!.y).toBeLessThan((await button.boundingBox())!.y);
  await button.click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(dayRow(page, "wed")).toContainText("Add dinner");
  await expect(dayRow(page, "fri")).toContainText("Add dinner");
});

test("on the last night of the week there is only no set night", async ({ page }) => {
  await createHousehold(page);
  await plan(page, "sat", "Saturday");
  await open(page, "sat");
  await page.getByTestId("cook-double").getByRole("button", { name: "Cook double" }).click();
  await expect(picker(page).getByRole("radio")).toHaveCount(1);
  await expect(night(page, "No set night")).toBeVisible();
  await expect(picker(page)).toContainText(
    "Saturday is the last night of this week, so there’s no later night for leftovers. You can still cook double for lunches.",
  );
});

test("a night with a dinner cannot be chosen", async ({ page }) => {
  await createHousehold(page);
  await plan(page, "wed", "Wednesday");
  await plan(page, "thu", "Thursday", "lasagna", "Easy lasagna · Spoonacular");
  await openPicker(page);
  const thursday = picker(page).getByRole("radio", { name: /^Thursday/ });
  await expect(thursday).toBeDisabled();
  await expect(thursday).toHaveAccessibleName(/Easy lasagna is planned/);
  await expect(night(page, "Thursday")).toContainText("Easy lasagna is planned");
  // The first free night is chosen instead.
  await expect(picker(page).getByRole("radio", { name: /^Friday/ })).toBeChecked();
});

test("two phones: each change shows on the other phone, and a night taken in between is explained", async ({ page, browser }) => {
  // Phone 1 hears nothing from the server while this is set, so its picker can go stale on purpose.
  let hold = false;
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => {
      if (!hold) ws.send(m);
    });
  });

  const email = await createHousehold(page);
  await plan(page, "wed", "Wednesday");
  const { context, page: b } = await joinAsPartner(page, browser);
  await page.goto("/week");
  await expect(page.locator('[data-live="on"]')).toBeAttached();
  await expect(b.locator('[data-live="on"]')).toBeAttached();
  await expect(dayRow(b, "wed")).toContainText("Chicken tacos");

  await cookDoubleTo(page, "Friday");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(dayRow(b, "fri")).toContainText("Leftovers", { timeout: 5000 });
  await expect(dayRow(b, "wed")).toContainText("cooking double", { timeout: 5000 });

  // Phone 1 opens the picker to move it; phone 2 puts a dinner on Saturday meanwhile.
  await open(page, "fri");
  await page.getByRole("button", { name: "Move to another night" }).click();
  await expect(night(page, "Saturday")).toBeVisible();
  hold = true;
  const sb = await clientFor(email);
  const household = (await getMyHousehold(sb))!;
  const [meal] = await listFavorites(sb, household.id);
  const week = await getOrCreateWeek(sb, household.id, thisWeekStart());
  await setWeekMeal(sb, week.id, "sat", "dinner", meal.id);
  await expect(dayRow(b, "sat")).toContainText("Chicken tacos", { timeout: 5000 });
  await night(page, "Saturday").click();
  await picker(page).getByRole("button", { name: "Move", exact: true }).click();
  await expect(picker(page).getByRole("alert")).toHaveText("Saturday was just taken. Pick another night.");
  hold = false;
  // The choices were rebuilt from fresh rows: Saturday cannot be chosen now, nothing is picked behind the person's back,
  // and the leftovers are still on Friday.
  await expect(picker(page).getByRole("radio", { name: /^Saturday/ })).toBeDisabled();
  await expect(picker(page).getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(picker(page).getByRole("alert")).toHaveText("Saturday was just taken. Pick another night.");
  await expect(dayRow(b, "fri")).toContainText("Leftovers");

  // Move to Thursday instead: phone 2 sees it.
  await night(page, "Thursday").click();
  await picker(page).getByRole("button", { name: "Move", exact: true }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(dayRow(b, "thu")).toContainText("Leftovers", { timeout: 5000 });
  await expect(dayRow(b, "fri")).toContainText("Add dinner", { timeout: 5000 });

  // Phone 1 takes it off: phone 2 sees both rows go back.
  await open(page, "thu");
  await sheet(page).getByRole("button", { name: "Take off Thursday" }).click();
  await expect(dayRow(b, "thu")).toContainText("Add dinner", { timeout: 5000 });
  await expect(dayRow(b, "wed")).not.toContainText("cooking double", { timeout: 5000 });
  await context.close();
});

test("cook double again after someone leaves the household keeps the leftovers night", async ({ page }) => {
  const email = await createHousehold(page);
  await plan(page, "wed", "Wednesday");
  const single = await (await readList(page)).amount("chicken");
  await backToWeek(page);
  await cookDoubleTo(page, "Friday");
  await page.getByRole("button", { name: "Close" }).click();

  // The youngest leaves: 3.8 servings become 3.3.
  const sb = await clientFor(email);
  await sb.from("people").delete().eq("age", 4);
  await page.goto("/week");
  await expect(page.getByRole("heading", { name: /Dinners · 3\.3 servings each/ })).toBeVisible();

  await open(page, "wed");
  await page.getByTestId("cook-double").getByRole("button", { name: "Change" }).click();
  await expect(picker(page).getByRole("radio", { name: /^Friday/ })).toBeChecked();
  await picker(page).getByRole("button", { name: "Cook double", exact: true }).click();
  await expect(page.getByTestId("cook-double")).toContainText("Leftovers on Friday");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(dayRow(page, "fri")).toContainText("Leftovers");
  const list = await readList(page);
  // Twice a dinner for the smaller household is less than twice the old dinner (and not the stale copy of it).
  await expect.poll(() => list.amount("chicken"), { timeout: 10_000 }).toBeLessThan(2 * single * 0.95);
});

test("repeat keeps a doubled dinner and its leftovers night", async ({ page }) => {
  const email = await createHousehold(page);
  await plan(page, "thu", "Thursday"); // gives the household a meal
  const sb = await clientFor(email);
  const household = (await getMyHousehold(sb))!;
  const [meal] = await listFavorites(sb, household.id);
  const last = await getOrCreateWeek(sb, household.id, previousWeekStart(thisWeekStart()));
  await setWeekMeal(sb, last.id, "mon", "dinner", meal.id);
  const [mon] = await listWeekMeals(sb, last.id);
  await cookDouble(sb, mon, doubleServings(3.8), "wed");

  await page.goto("/week");
  await page.getByRole("button", { name: /Repeat/ }).click();
  await page.getByRole("button", { name: "Copy dinners" }).click();
  await expect(dayRow(page, "mon")).toContainText("cooking double");
  await expect(dayRow(page, "wed")).toContainText("Leftovers");
  await expect(dayRow(page, "wed")).toContainText("Chicken tacos, from Monday");
  await expect(dayRow(page, "thu")).toContainText("Add dinner");
});

test("favorites: a leftovers night counts as a planned night", async ({ page }) => {
  const email = await createHousehold(page);
  await plan(page, "mon", "Monday");
  const sb = await clientFor(email);
  const household = (await getMyHousehold(sb))!;
  const [meal] = await listFavorites(sb, household.id);
  const week = await getOrCreateWeek(sb, household.id, thisWeekStart());
  const [mon] = await listWeekMeals(sb, week.id);
  await cookDouble(sb, mon, doubleServings(3.8), "tue");

  await page.goto("/favorites");
  await page.getByRole("button", { name: "Add Chicken tacos to this week" }).click();
  await expect(page.getByText("Added Chicken tacos to Sunday.")).toBeVisible();

  for (const day of ["wed", "thu", "fri", "sat"] as const) await setWeekMeal(sb, week.id, day, "dinner", meal.id);
  await page.getByRole("button", { name: "Add Chicken tacos to this week" }).click();
  await expect(page.getByText("This week's dinners are all planned.")).toBeVisible();
});

test("offline: the leftovers buttons are off, with a line that says why", async ({ page, context }) => {
  await createHousehold(page);
  await plan(page, "wed", "Wednesday");
  await open(page, "wed");
  await expect(page.getByTestId("cook-double").getByRole("button", { name: "Cook double" })).toBeEnabled();
  await context.setOffline(true);
  await expect(page.getByTestId("cook-double").getByRole("button", { name: "Cook double" })).toBeDisabled();
  await expect(page.getByText("You’re offline. Connect to change this week.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Take off Wednesday" })).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByTestId("cook-double").getByRole("button", { name: "Cook double" })).toBeEnabled();
});

test("a dinner that is gone is explained on the week once the sheet closes", async ({ page }) => {
  // The page hears nothing live, so its sheet is stale when the dinner is taken off elsewhere.
  let hold = false;
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => {
      if (!hold) ws.send(m);
    });
  });
  const email = await createHousehold(page);
  await plan(page, "wed", "Wednesday");
  await page.goto("/week");
  await expect(page.locator('[data-live="on"]')).toBeAttached();
  await openPicker(page);
  hold = true;
  const sb = await clientFor(email);
  const household = (await getMyHousehold(sb))!;
  const week = await getOrCreateWeek(sb, household.id, thisWeekStart());
  await setWeekMeal(sb, week.id, "wed", "dinner", null);
  await picker(page).getByRole("button", { name: "Cook double", exact: true }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("That dinner is gone.");
  await expect(dayRow(page, "wed")).toContainText("Add dinner");
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
});
