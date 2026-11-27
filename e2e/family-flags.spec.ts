import { expect, test, type Locator, type Page } from "@playwright/test";
import { createHousehold, FAMILY, type PersonInput } from "./helpers/household";
import { routeFoodImages } from "./helpers/fixtures";
import { setLook } from "./helpers/look";
import { pinToday } from "./helpers/clock";

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
  await page.getByLabel("What’s for dinner?").fill(query);
  await page.getByRole("button", { name: "Search" }).click();
}

const youngest = (page: Page) => page.getByTestId("person-row").last();

test("household: a sixth person can be added and deleted in two taps; won't-eat and allergies fit a phone", async ({ page }) => {
  await createHousehold(page, "family-flags-household");
  await page.goto("/household");
  await expect(page.getByTestId("person-row")).toHaveCount(5);

  // Add a sixth person, open them, and delete them: the first tap only asks.
  await page.getByRole("region", { name: "Who's eating" }).getByRole("button", { name: "+ Add", exact: true }).click();
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
  await expect(other.getByTestId("day-row-thu")).toContainText("Add dinner");
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
  return mushroomAmountNow(page);
}

/** Reads the amount on the list that is already open, without reloading it. */
async function mushroomAmountNow(page: Page): Promise<number> {
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
  // Wait for the saved change to clear before leaving the sheet.
  await expect(sheet.getByTestId("dislike-box")).toHaveAttribute("data-state", "ask");
  await sheet.getByRole("button", { name: "Keep it as is" }).click();
  await expect(sheet.getByTestId("dislike-box")).toHaveCount(0);
  await sheet.getByRole("button", { name: "Close" }).click();
  // The list opens on its offline copy (still the cut amount) and swaps in the fresh one once it loads,
  // so poll the open list until it shows the full amount rather than trusting the first paint.
  await page.goto("/list");
  await expect.poll(() => mushroomAmountNow(page)).toBeGreaterThan(cut);

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

const PILAF = /^Broccolini quinoa pilaf with toasted almonds · Example Kitchen/;

/**
 * Everything that could hide a word of this element: its own box and every descendant (a clamp, an ellipsis,
 * overflow that cuts text), and every ancestor up to the page (a clamp, an ellipsis, or overflow that hides it).
 * Scrolling containers are fine: a sheet scrolls, it does not cut.
 */
async function clippedBy(target: Locator): Promise<string[]> {
  return target.evaluate((el) => {
    const out: string[] = [];
    const name = (e: Element) => `${e.tagName.toLowerCase()}${e.getAttribute("data-testid") ? `[${e.getAttribute("data-testid")}]` : ""}.${[...e.classList].slice(0, 3).join(".")}`;
    const style = (e: Element) => getComputedStyle(e);
    const lineClamped = (e: Element) => {
      const s = style(e);
      const c = s.getPropertyValue("-webkit-line-clamp");
      return (c && c !== "none") || s.textOverflow === "ellipsis";
    };
    const cuts = (v: string) => v === "hidden" || v === "clip";

    for (const e of [el, ...el.querySelectorAll("*")]) {
      if (lineClamped(e)) out.push(`${name(e)} is clamped or ellipsized`);
      const s = style(e);
      if (s.display === "inline" || s.display === "contents") continue;
      if (e.scrollHeight > e.clientHeight + 0.5) out.push(`${name(e)} is taller inside (${e.scrollHeight} > ${e.clientHeight})`);
      if (e.scrollWidth > e.clientWidth + 0.5) out.push(`${name(e)} is wider inside (${e.scrollWidth} > ${e.clientWidth})`);
    }

    const box = el.getBoundingClientRect();
    // Past a scroller, what lies beyond the edge is reached by scrolling, so only clamps count from there up.
    let inScroller = false;
    for (let up = el.parentElement; up && up !== document.documentElement; up = up.parentElement) {
      if (lineClamped(up)) out.push(`ancestor ${name(up)} is clamped or ellipsized`);
      const s = up.tagName === "BODY" ? null : style(up);
      if (!s) continue;
      if (!inScroller && (s.overflowY === "auto" || s.overflowY === "scroll")) {
        inScroller = true;
        continue;
      }
      if (inScroller) continue;
      const r = up.getBoundingClientRect();
      const hidesX = cuts(s.overflowX) && (box.left < r.left - 0.5 || box.right > r.right + 0.5);
      const hidesY = cuts(s.overflowY) && (box.top < r.top - 0.5 || box.bottom > r.bottom + 0.5);
      if (hidesX || hidesY) out.push(`ancestor ${name(up)} hides part of it`);
      if (s.maxHeight !== "none" && cuts(s.overflowY) && box.height > parseFloat(s.maxHeight)) out.push(`ancestor ${name(up)} caps its height`);
    }
    return out;
  });
}

async function allClipped(locator: Locator): Promise<string[]> {
  const found: string[] = [];
  const n = await locator.count();
  expect(n, "something to measure").toBeGreaterThan(0);
  for (let i = 0; i < n; i++) found.push(...(await clippedBy(locator.nth(i))));
  return found;
}

/** A sheet is still sliding in when it first shows, so a moving box is measured again until it settles; a real clip never clears. */
async function expectUnclipped(locator: Locator): Promise<void> {
  await expect.poll(() => allClipped(locator), { timeout: 5000 }).toEqual([]);
}

for (const look of ["light", "dark"] as const) {
  test(`an allergy line is never clipped, in either look, at 360 px (${look})`, async ({ page }) => {
    await setLook(page, look);
    await createHousehold(page, `family-flags-clip-${look}`, WITH_LISTS);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/week/add?day=thu&slot=dinner");
    await expect(page.locator("html")).toHaveAttribute("data-look", look);
    await searchFor(page, "soup");

    // Every flag line on every result card.
    await expect(page.getByTestId("result-flag").first()).toBeVisible();
    await expectUnclipped(page.getByTestId("result-flag"));

    // The box on the draft.
    await page.getByRole("button", { name: PILAF }).click();
    await expect(page.getByTestId("allergy-box")).toBeVisible();
    await expectUnclipped(page.getByTestId("allergy-box"));
    await page.getByRole("button", { name: "Add to Thursday anyway" }).click();
    await expect(page).toHaveURL(/\/week$/);

    // The week row, and the dinner sheet's box.
    const thursday = page.getByTestId("day-row-thu");
    const weekLine = thursday.getByText(/Tree nut allergy: Daughter \(4\)/);
    await expect(weekLine).toBeVisible();
    await expectUnclipped(weekLine);
    await thursday.getByRole("button").click();
    const sheet = page.getByRole("dialog", { name: "Broccolini quinoa pilaf with toasted almonds" });
    await expect(sheet.getByTestId("allergy-box")).toBeVisible();
    await expectUnclipped(sheet.getByTestId("allergy-box"));
    await sheet.getByRole("button", { name: "Close" }).click();

    // Favorites.
    await page.goto("/favorites");
    const row = page.getByTestId("favorite-row").filter({ hasText: "Broccolini quinoa pilaf" });
    await expect(row.getByTestId("result-flag")).toBeVisible();
    await expectUnclipped(row.getByTestId("result-flag"));

    // The swap sheet's allergy box (a walnut swap for the daughter who is allergic to tree nuts).
    await addSoupToFriday(page);
    await page.getByTestId("day-row-fri").getByRole("button").click();
    const soup = page.getByRole("dialog", { name: "White bean and mushroom soup" });
    await soup.getByTestId("dislike-box").getByRole("button", { name: "Swap them" }).click();
    const swap = page.getByRole("dialog", { name: "Instead of mushrooms" });
    await swap.getByLabel("Or something else").fill("walnuts");
    await expect(swap.getByTestId("allergy-box")).toBeVisible();
    await expectUnclipped(swap.getByTestId("allergy-box"));
  });

  test(`a card with an allergy shows the whole warning at 360 px (${look})`, async ({ page }) => {
    await setLook(page, look);
    await createHousehold(page, `family-flags-card-${look}`, WITH_LISTS);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/week/add?day=thu&slot=dinner");
    await expect(page.locator("html")).toHaveAttribute("data-look", look);
    await searchFor(page, "soup");
    const card = page.getByRole("button", { name: PILAF });
    const line = card.getByTestId("result-flag");
    await expect(line).toBeVisible();
    // The whole warning: the allergy, whose it is, what lists it, and the reminder, with its icon.
    await expect(line).toContainText("Tree nut allergy: Daughter (4)");
    await expect(line).toContainText("Lists almonds. Check labels.");
    await expect(line.locator("svg.lucide-triangle-alert")).toHaveCount(1);
    await expectUnclipped(line);
    // Inside the card, all of it, and the card does not cut it off.
    const [c, l] = [(await card.boundingBox())!, (await line.boundingBox())!];
    expect(l.x).toBeGreaterThanOrEqual(c.x);
    expect(l.x + l.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
    expect(l.y + l.height).toBeLessThanOrEqual(c.y + c.height + 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    expect(await card.innerText()).not.toMatch(SAFE_WORDS);
  });

  test(`the allergy box has an edge and an icon in both looks (${look})`, async ({ page }) => {
    await setLook(page, look);
    await createHousehold(page, `family-flags-edge-${look}`, WITH_LISTS);
    await page.goto("/week/add?day=thu&slot=dinner");
    await expect(page.locator("html")).toHaveAttribute("data-look", look);
    await searchFor(page, "soup");
    await page.getByRole("button", { name: PILAF }).click();
    const box = page.getByTestId("allergy-box");
    await expect(box).toBeVisible();
    const edge = await box.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: parseFloat(s.borderTopWidth), style: s.borderTopStyle, color: s.borderTopColor, ground: s.backgroundColor };
    });
    expect(edge.width).toBeGreaterThanOrEqual(1);
    expect(edge.style).toBe("solid");
    expect(edge.color).not.toBe(edge.ground);
    await expect(box.locator("svg.lucide-triangle-alert")).toHaveCount(1);
  });
}

async function addSoupToFriday(page: Page) {
  await page.goto("/week/add?day=fri&slot=dinner");
  await searchFor(page, "soup");
  await page.getByRole("button", { name: /^White bean and mushroom soup · Budget Bytes/ }).click();
  await page.getByRole("button", { name: "Add to Friday" }).click();
  await expect(page).toHaveURL(/\/week$/);
}

test("the swap sheet will not swap in a food someone is allergic to", async ({ page }) => {
  await createHousehold(page, "family-flags-swap-block", WITH_LISTS);
  await addSoupToFriday(page);
  await page.getByTestId("day-row-fri").getByRole("button").click();
  const soup = page.getByRole("dialog", { name: "White bean and mushroom soup" });
  await soup.getByTestId("dislike-box").getByRole("button", { name: "Swap them" }).click();
  const swap = page.getByRole("dialog", { name: "Instead of mushrooms" });
  const go = swap.getByRole("button", { name: "Swap for Daughter (4)" });
  await expect(go).toBeDisabled();

  await swap.getByLabel("Or something else").fill("walnuts");
  await expect(swap.getByTestId("allergy-box")).toContainText("check every label");
  await expect(go).toBeDisabled();
  expect(await swap.innerText()).not.toMatch(SAFE_WORDS);

  // A food with no allergy behind it is allowed again.
  await swap.getByLabel("Or something else").fill("zucchini");
  await expect(swap.getByTestId("allergy-box")).toHaveCount(0);
  await expect(go).toBeEnabled();
});

test("a dinner added despite an allergy keeps its warning on the tile and on the hero", async ({ page }) => {
  // The pilaf's picture is wide enough to lead the week once tonight is its day.
  await routeFoodImages(page, { wide: /quinoa-pilaf/ });
  await pinToday(page, "fri");
  await createHousehold(page, "family-flags-week-warning", WITH_LISTS);
  await page.goto("/week/add?day=thu&slot=dinner");
  await searchFor(page, "soup");
  await page.getByRole("button", { name: PILAF }).click();
  await page.getByRole("button", { name: "Add to Thursday anyway" }).click();
  await expect(page).toHaveURL(/\/week$/);

  // Thursday is a tile while tonight is Friday.
  const tile = page.getByTestId("day-row-thu");
  await expect(tile).toContainText("Tree nut allergy: Daughter (4)");
  await expect(tile).toContainText(/check (every )?labels?/i);
  await expect(tile.locator("svg.lucide-triangle-alert")).toHaveCount(1);
  await expect(page.locator("[data-tonight]")).toHaveCount(0);

  // Tonight is Thursday: the picture is wide, so it is the hero once its width is known, with the warning in full.
  await pinToday(page, "thu");
  await page.reload();
  const hero = page.locator("[data-tonight]");
  await expect(hero).toContainText("Tonight · Thursday");
  await expect(hero).toContainText("Tree nut allergy: Daughter (4)");
  await expect(hero).toContainText(/check (every )?labels?/i);
  await expect(hero.locator("svg.lucide-triangle-alert")).toHaveCount(1);
  await expectUnclipped(hero.getByText(/Tree nut allergy: Daughter \(4\)/));
  expect(await hero.innerText()).not.toMatch(SAFE_WORDS);
});
