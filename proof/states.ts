import { expect, type BrowserContext, type Page } from "@playwright/test";
import { uniqueEmail } from "../e2e/helpers/auth";
import { clientFor } from "../e2e/helpers/db";
import { addFromSearch } from "../e2e/helpers/flows-a";
import { chooseStore, openList, setBudget } from "../e2e/helpers/flows-b";
import { openReview } from "../e2e/helpers/fred-meyer";
import { FAMILY, type PersonInput } from "../e2e/helpers/household";
import { SCREENS_LATER } from "../e2e/screens/later";
import { getOrCreateWeek, setWeekMeal } from "../lib/db/queries/weeks";
import { getMyHousehold } from "../lib/db/queries/household";
import { todayIn, weekStartFor, type Day } from "../lib/domain/weeks";
import { addDays } from "../lib/week/format";
import type { Who } from "./helpers";
import { Pending } from "./pending";

export { Pending };

export interface StateCtx {
  page: Page;
  context: BrowserContext;
  /** The signed-in person's email, when there is one. */
  email: string | null;
}

export interface ProofState {
  name: string;
  /** The registry screens it shows; if any is missing or contrastPending the state is skipped with a note. */
  screens: string[];
  who: Who;
  /** Set while the state has no trigger yet: it is skipped with this reason before anything is set up (no sign-in, no household). */
  pending?: string;
  /** The household's people (five by default). */
  people?: PersonInput[];
  /** Gets the page to the state. */
  run: (ctx: StateCtx) => Promise<void>;
}

const withAllergy: PersonInput[] = FAMILY.map((p, i) => (i === 3 ? { ...p, allergies: ["chicken"] } : p));

const tacosOnThursday = (page: Page) => addFromSearch(page, { day: "thu", query: "tacos", pick: "Chicken tacos · Allrecipes" });
const searchTacos = async (page: Page, day: Day = "fri") => {
  await page.goto(`/week/add?day=${day}&slot=dinner`);
  await page.getByLabel(/What.s for dinner\?/).fill("tacos");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("button", { name: "Chicken tacos · Allrecipes" })).toBeVisible();
};
const pickTacos = async (page: Page) => {
  await searchTacos(page, "thu");
  await page.getByRole("button", { name: "Chicken tacos · Allrecipes" }).click();
  await expect(page.getByRole("button", { name: "Add to Thursday" })).toBeVisible();
};
const goto = (path: string) => async ({ page }: StateCtx) => {
  await page.goto(path);
};

const DAY_IDS: Day[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Puts yesterday's dinner on the week straight in the database, so the "how was dinner" card shows. */
async function seedYesterdaysDinner(email: string): Promise<void> {
  const sb = await clientFor(email);
  const household = (await getMyHousehold(sb))!;
  const date = addDays(todayIn(household.time_zone), -1);
  const { data: meal, error } = await sb
    .from("meals")
    .insert({ household_id: household.id, name: "Tuscan white bean soup", base_servings: 4, photo_url: "https://images.example.test/soup.jpg" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const start = weekStartFor(new Date(`${date}T12:00:00Z`), household.week_start as Day, household.time_zone);
  const week = await getOrCreateWeek(sb, household.id, start);
  await setWeekMeal(sb, week.id, DAY_IDS[new Date(`${date}T00:00:00Z`).getUTCDay()], "dinner", meal.id);
}

const row = (page: Page, name: string) => page.getByTestId("list-row").filter({ hasText: name });

const listWithTacos = async (page: Page) => {
  await chooseStore(page);
  await tacosOnThursday(page);
  await openList(page);
  await expect(page.getByTestId("list-row").first()).toBeVisible();
};

const BUILT_IN: ProofState[] = [
  { name: "week", screens: ["week"], who: "household", run: async ({ page }) => { await tacosOnThursday(page); } },
  { name: "week-empty", screens: ["week"], who: "household", run: goto("/week") },
  {
    name: "week-over-budget",
    screens: ["week"],
    who: "household",
    run: async ({ page }) => {
      await tacosOnThursday(page);
      await setBudget(page, { target: 5, wiggle: 1 });
      await page.goto("/week");
    },
  },
  {
    name: "week-long-names",
    screens: ["week"],
    who: "household",
    pending: "no long-named dish fixture exists yet; add one to the fake recipe search with the week task",
    run: async () => {},
  },
  {
    name: "week-loading",
    screens: ["week"],
    who: "household",
    run: async ({ page }) => {
      await page.goto("/household");
      // Hold the week's server render so the loading screen stays up long enough to shoot.
      await page.route((url) => url.pathname === "/week", async (route) => {
        await new Promise((r) => setTimeout(r, 6000));
        await route.continue();
      });
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /week/i }).click();
      await page.waitForTimeout(700);
    },
  },
  {
    name: "week-error",
    screens: ["week"],
    who: "household",
    pending: "the week's error screen has no trigger yet",
    run: async () => {},
  },
  {
    name: "week-verdict-card",
    screens: ["week"],
    who: "household",
    run: async ({ page, email }) => {
      await seedYesterdaysDinner(email!);
      await page.goto("/week");
      await expect(page.getByTestId("verdict-card")).toBeVisible();
    },
  },
  { name: "week-allergy", screens: ["week"], who: "household", people: withAllergy, run: async ({ page }) => { await tacosOnThursday(page); } },
  { name: "add-meal", screens: ["add-meal"], who: "household", run: goto("/week/add?day=thu&slot=dinner") },
  { name: "search", screens: ["add-meal"], who: "household", run: async ({ page }) => searchTacos(page, "thu") },
  {
    name: "search-fits",
    screens: ["add-meal"],
    who: "household",
    run: async ({ page }) => {
      await tacosOnThursday(page);
      await searchTacos(page, "fri");
    },
  },
  { name: "search-flags", screens: ["add-meal"], who: "household", people: withAllergy, run: async ({ page }) => searchTacos(page, "thu") },
  { name: "recipe", screens: ["add-meal"], who: "household", run: async ({ page }) => pickTacos(page) },
  { name: "recipe-allergy", screens: ["add-meal"], who: "household", people: withAllergy, run: async ({ page }) => pickTacos(page) },
  {
    name: "favorites",
    screens: ["favorites"],
    who: "household",
    run: async ({ page }) => {
      await tacosOnThursday(page);
      await page.goto("/favorites");
      await expect(page.getByTestId("favorite-row").first()).toBeVisible();
    },
  },
  { name: "favorites-empty", screens: ["favorites"], who: "household", run: goto("/favorites") },
  {
    name: "list",
    screens: ["list"],
    who: "household",
    run: async ({ page }) => {
      await tacosOnThursday(page);
      await openList(page);
      await expect(page.getByTestId("list-row").first()).toBeVisible();
    },
  },
  {
    name: "list-products",
    screens: ["list"],
    who: "household",
    run: async ({ page }) => {
      await listWithTacos(page);
      await expect(page.getByText("Fred Meyer price").first()).toBeVisible();
    },
  },
  {
    name: "list-offline",
    screens: ["list"],
    who: "household",
    run: async ({ page, context }) => {
      await tacosOnThursday(page);
      await openList(page);
      await expect(page.getByTestId("list-row").first()).toBeVisible();
      await context.setOffline(true);
      await page.reload();
      await expect(page.getByText(/Offline/)).toBeVisible();
    },
  },
  {
    name: "list-stale",
    screens: ["list"],
    who: "household",
    pending: "the list's stale-prices state has no trigger yet",
    run: async () => {},
  },
  { name: "list-empty", screens: ["list"], who: "household", run: goto("/list") },
  {
    name: "swap",
    screens: ["swap"],
    who: "household",
    run: async ({ page }) => {
      await listWithTacos(page);
      await row(page, "Black beans").getByRole("button", { name: "Swap Black beans product" }).click();
      await expect(page.getByRole("dialog", { name: "Swap black beans" })).toBeVisible();
    },
  },
  {
    name: "review",
    screens: ["review"],
    who: "household",
    run: async ({ page }) => {
      await chooseStore(page);
      await tacosOnThursday(page);
      await openReview(page);
      await expect(page.getByTestId("review-line").first()).toBeVisible();
    },
  },
  {
    name: "review-sent",
    screens: ["review"],
    who: "household",
    pending: "the sent-to-Fred-Meyer confirmation has no stable trigger yet",
    run: async () => {},
  },
  { name: "household", screens: ["household"], who: "household", run: goto("/household") },
  {
    name: "person-editor",
    screens: ["household"],
    who: "household",
    run: async ({ page }) => {
      await page.goto("/household");
      await page.getByTestId("person-row").nth(1).click();
      await expect(page.getByRole("form", { name: "Edit Mom" })).toBeVisible();
    },
  },
  {
    name: "household-stores",
    screens: ["household"],
    who: "household",
    run: async ({ page }) => {
      await chooseStore(page);
      await page.goto("/household");
    },
  },
  { name: "onboarding", screens: ["onboarding"], who: "fresh", run: goto("/onboarding") },
  { name: "login", screens: ["login"], who: "out", run: goto("/login") },
  {
    name: "login-code",
    screens: ["login"],
    who: "out",
    run: async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel("Email").fill(uniqueEmail("proof-code"));
      await page.getByRole("button", { name: "Email me a sign-in link" }).click();
      await expect(page.getByText("We sent a link and a 6-digit code to")).toBeVisible();
    },
  },
  {
    name: "invite",
    screens: ["invite-failed"],
    who: "household",
    run: async ({ page }) => {
      await page.goto(`/invite/${"0".repeat(64)}`);
    },
  },
];

/** The screens a later phase registers in e2e/screens/later.ts each get one shot, as a signed-in household. */
const LATER: ProofState[] = SCREENS_LATER.map((s) => ({
  name: s.name,
  screens: [s.name],
  who: s.signedOut ? "out" : s.fresh ? "fresh" : "household",
  run: async ({ page }) => {
    await page.goto(s.path);
    await s.setup?.(page);
  },
}));

const taken = new Set(BUILT_IN.map((s) => s.name));
export const STATES: ProofState[] = [...BUILT_IN, ...LATER.filter((s) => !taken.has(s.name))];

