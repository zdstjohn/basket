import { expect, test, type Page } from "@playwright/test";
import { clientFor } from "./helpers/db";
import { setLook } from "./helpers/look";
import { routeFoodImages } from "./helpers/fixtures";
import { createHousehold, joinAsPartner } from "./helpers/household";
import { chooseStore, dollarsToCents, openReview, planTacos } from "./helpers/fred-meyer";

// Runs against the fake sign-in and the fake cart (KROGER_FAKE=1): no call ever leaves the machine.
// The send route is stubbed in one test: a service worker would answer before the stub does.
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await routeFoodImages(page);
});

const sendButton = (page: Page) => page.getByTestId("send-cart");
const lineNamed = (page: Page, name: string) => page.getByTestId("review-line").filter({ hasText: name });

async function sumOfLines(page: Page): Promise<number> {
  let sum = 0;
  for (const t of await page.getByTestId("review-total").allTextContents()) sum += dollarsToCents(t);
  return sum;
}

async function sendRows(email: string) {
  const sb = await clientFor(email);
  const { data, error } = await sb.from("cart_sends").select("status, modality, items, created_at").order("created_at");
  expect(error).toBeNull();
  return data ?? [];
}

/** A household with the tacos planned, on the review screen and connected to the fake Fred Meyer account. */
async function readyToSend(page: Page, label = "cart"): Promise<string> {
  const email = await createHousehold(page, label);
  await chooseStore(page);
  await planTacos(page);
  await openReview(page);
  await page.getByRole("link", { name: "Connect Fred Meyer" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Fred Meyer is connected." })).toBeVisible();
  await expect(page).toHaveURL(/\/list\/review$/);
  await expect(page.getByTestId("review-line").first()).toBeVisible();
  return email;
}

test("review and fill the Fred Meyer cart, then send only what is new", async ({ page }, testInfo) => {
  const shots = `e2e/screenshots/${testInfo.project.name}`;
  const email = await createHousehold(page, "cart");
  await chooseStore(page);
  await planTacos(page);

  // 1. Not connected: the screen says so, and connecting brings the family back here.
  await openReview(page);
  await expect(page.getByText("You’ll sign in on Fred Meyer’s own page. Basket never sees your password.")).toBeVisible();
  await expect(sendButton(page)).toBeDisabled();
  await page.getByRole("link", { name: "Connect Fred Meyer" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Fred Meyer is connected." })).toBeVisible();
  await expect(page).toHaveURL(/\/list\/review$/); // ?fm= is taken out of the address after the notice shows
  await expect(page.getByRole("link", { name: "Connect Fred Meyer" })).toHaveCount(0);

  // 2. Lines, totals, and a count that sticks.
  await expect(page.getByTestId("review-line").first()).toBeVisible();
  await expect(lineNamed(page, "Heritage Farm Boneless Skinless Chicken Thighs")).toBeVisible();
  const beans = lineNamed(page, "Simple Truth Organic Black Beans");
  await expect(beans).toBeVisible();
  await expect(beans.getByTestId("review-count")).toHaveText("1");
  await expect(page.getByTestId("not-in-order").getByText("Corn tortillas")).toBeVisible();
  await expect(page.getByTestId("not-in-order").getByRole("button", { name: "Find a product for Corn tortillas" })).toBeVisible();
  await expect(page.getByText("Basket never places an order. You check out at Fred Meyer.")).toBeVisible();
  await expect(page.getByText(/a new week .*add items again/i)).toBeVisible();
  const before = dollarsToCents(await page.getByTestId("fm-total").textContent());
  expect(before).toBeGreaterThan(0);
  expect(await sumOfLines(page)).toBe(before);
  const beansBefore = dollarsToCents(await beans.getByTestId("review-total").textContent());
  const weekBefore = dollarsToCents(await page.getByTestId("week-total").textContent());
  await page.screenshot({ path: `${shots}/review.png`, fullPage: true });

  await page.getByRole("button", { name: "One more Simple Truth Organic Black Beans" }).click();
  await expect(beans.getByTestId("review-count")).toHaveText("2");
  await expect.poll(async () => dollarsToCents(await page.getByTestId("fm-total").textContent())).toBeGreaterThan(before);
  expect(dollarsToCents(await beans.getByTestId("review-total").textContent())).toBeGreaterThan(beansBefore);
  expect(dollarsToCents(await page.getByTestId("week-total").textContent())).toBeGreaterThan(weekBefore);
  expect(await sumOfLines(page)).toBe(dollarsToCents(await page.getByTestId("fm-total").textContent()));
  await page.reload();
  await expect(lineNamed(page, "Simple Truth Organic Black Beans").getByTestId("review-count")).toHaveText("2");

  // 3. Delivery, then send. Nothing is sent before this tap.
  expect(await sendRows(email)).toHaveLength(0);
  await page.getByRole("radio", { name: "Delivery" }).check();
  const lineCount = await page.getByTestId("review-line").count();
  await expect(sendButton(page)).toHaveText(`Add ${lineCount} items to my Fred Meyer cart`);
  await sendButton(page).click();
  await expect(page.getByTestId("send-result")).toContainText("Added. Check out in the Fred Meyer app.");
  const cart = page.getByRole("link", { name: "Open my Fred Meyer cart" });
  await expect(cart).toHaveAttribute("href", "https://www.fredmeyer.com/cart");
  await expect(cart).toHaveAttribute("target", "_blank");
  await expect.poll(async () => (await sendRows(email)).length).toBe(1);
  const first = (await sendRows(email))[0];
  expect(first.status).toBe("sent");
  expect(first.modality).toBe("DELIVERY");
  expect((first.items as unknown[]).length).toBe(lineCount);

  // 4. Back later: what was sent is remembered, and there is nothing new.
  await page.reload();
  await expect(page.getByTestId("last-send")).toHaveText(new RegExp(`^Sent by you at \\d{1,2}:\\d{2} (am|pm) on \\w+\\. ${lineCount} items\\.$`));
  await expect(sendButton(page)).toHaveText("Nothing new to send");
  await expect(sendButton(page)).toBeDisabled();
  await expect(page.getByRole("radio", { name: "Delivery" })).toBeChecked(); // saved for the household
  await expect(page.getByTestId("already-sent")).toBeVisible();
  await page.screenshot({ path: `${shots}/review-sent.png`, fullPage: true });

  // 5. A new staple shows up as the only new line.
  await page.goto("/household");
  const staples = page.getByRole("region", { name: "Staples" });
  await staples.getByRole("button", { name: "+ Add staple" }).click();
  await staples.getByLabel("Name").fill("Milk");
  await staples.getByLabel("Amount").fill("1");
  await staples.getByLabel("Unit").fill("gallon");
  await staples.getByLabel("Type").selectOption({ label: "Dairy" });
  await staples.getByRole("button", { name: "Save staple" }).click();
  await expect(staples.getByTestId("staple-row").filter({ hasText: "Milk" })).toBeVisible();
  await openReview(page);
  await expect(page.getByTestId("to-send").getByRole("heading", { name: "New since then" })).toBeVisible();
  await expect(page.getByTestId("to-send").getByTestId("review-line")).toHaveCount(1);
  await expect(sendButton(page)).toHaveText("Add 1 item to my Fred Meyer cart");
  await sendButton(page).click();
  await expect(page.getByTestId("send-result")).toContainText("Added. Check out in the Fred Meyer app.");
  await expect.poll(async () => (await sendRows(email)).length).toBe(2);

  // 6. A sent item the family already has goes to the "take out" list.
  await page.getByRole("button", { name: "I have it: Black beans" }).click();
  await expect(page.getByTestId("to-remove").getByRole("heading", { name: "Take these out in the Fred Meyer app" })).toBeVisible();
  await expect(page.getByTestId("to-remove")).toContainText("Simple Truth Organic Black Beans");

  // 7. Sending again asks first, and adds a second time. (The server stands a resend down if another send
  // landed in the last few seconds, so let the milk send settle first.)
  await page.waitForTimeout(6000);
  await page.getByRole("button", { name: "Send these again" }).click();
  const warning = page.getByRole("dialog", { name: "Send these again" });
  await expect(warning.getByText("This adds them a second time. Fred Meyer can’t tell Basket what’s already in your cart.")).toBeVisible();
  await warning.getByRole("button", { name: "Add again" }).click();
  await expect(sendButton(page)).toHaveText(/^Add \d+ items? to my Fred Meyer cart$/);
  await sendButton(page).click();
  await expect(page.getByTestId("send-result")).toContainText("Added. Check out in the Fred Meyer app.");
  await expect.poll(async () => (await sendRows(email)).length).toBe(3);
});

test("a partner sees what the other phone sent, once connected", async ({ page, browser }) => {
  const email = await readyToSend(page, "cartowner");
  const lineCount = await page.getByTestId("review-line").count();
  await sendButton(page).click();
  await expect(page.getByTestId("send-result")).toContainText("Added.");
  await expect.poll(async () => (await sendRows(email)).length).toBe(1);

  const partner = await joinAsPartner(page, browser);
  await routeFoodImages(partner.page);
  await partner.page.goto("/list/review");
  await expect(partner.page.getByRole("link", { name: "Connect Fred Meyer" })).toBeVisible();
  await partner.page.getByRole("link", { name: "Connect Fred Meyer" }).click();
  await expect(partner.page.getByRole("status").filter({ hasText: "Fred Meyer is connected." })).toBeVisible();
  // The fake gives both phones the same Fred Meyer account, so the first phone's send counts here too.
  await expect(partner.page.getByTestId("last-send")).toHaveText(
    new RegExp(`^Sent by someone else in your family at \\d{1,2}:\\d{2} (am|pm) on \\w+\\. ${lineCount} items\\.$`),
  );
  await expect(partner.page.getByRole("button", { name: "Nothing new to send" })).toBeDisabled();
  await partner.context.close();
});

test("over budget: the family is asked first, and Go back sends nothing", async ({ page }) => {
  const email = await readyToSend(page, "cartbudget");
  await page.goto("/household");
  const budget = page.getByRole("region", { name: "Budget" });
  await budget.getByLabel("Target").fill("1");
  await budget.getByLabel("Wiggle room").fill("0");
  await budget.getByLabel("Wiggle room").press("Tab");
  const sb = await clientFor(email);
  await expect
    .poll(async () => {
      const { data } = await sb.from("households").select("budget_cents, cushion_cents");
      return `${data?.[0]?.budget_cents}/${data?.[0]?.cushion_cents}`;
    })
    .toBe("100/0");
  await page.goto("/list/review");
  await expect(page.getByTestId("review-line").first()).toBeVisible();

  await sendButton(page).click();
  const ask = page.getByRole("dialog", { name: "Over budget" });
  await expect(ask.getByText(/^You’re \$[\d,.]+ over your budget\. Add to cart anyway\?$/)).toBeVisible();
  await ask.getByRole("button", { name: "Go back" }).click();
  await expect(ask).toBeHidden();
  expect(await sendRows(email)).toHaveLength(0);

  await sendButton(page).click();
  await page.getByRole("dialog", { name: "Over budget" }).getByRole("button", { name: "Add anyway" }).click();
  await expect(page.getByTestId("send-result")).toContainText("Added.");
  await expect.poll(async () => (await sendRows(email)).length).toBe(1);
});

test("a double tap sends once", async ({ page }) => {
  const email = await readyToSend(page, "cartdouble");
  await sendButton(page).dblclick();
  await expect(page.getByTestId("send-result")).toContainText("Added.");
  await page.waitForTimeout(500);
  expect(await sendRows(email)).toHaveLength(1);
});

test("what the family is told when a send does not simply work", async ({ page }) => {
  await readyToSend(page, "cartstates");
  const upcs = await page.getByTestId("review-line").evaluateAll((els) => els.map((e) => e.getAttribute("data-upc") ?? ""));
  expect(upcs.length).toBeGreaterThan(1);
  const first = lineNamed(page, "Heritage Farm Boneless Skinless Chicken Thighs");
  const firstUpc = await first.getAttribute("data-upc");
  const secondName = "Simple Truth Organic Black Beans";
  const secondKey = "black beans";
  const bodies: { lines: { upc: string }[]; resend: boolean }[] = [];
  let step = 0;
  await page.route("**/api/kroger/cart", async (route) => {
    bodies.push(route.request().postDataJSON());
    step++;
    if (step === 1) return route.fulfill({ status: 409, json: { error: "already_sending" } });
    if (step === 2) {
      return route.fulfill({ status: 504, json: { error: "unsure", ok: [firstUpc], rejected: [{ key: secondKey, name: secondName }] } });
    }
    if (step === 3) return route.fulfill({ status: 200, json: { sent: 1, rejected: [] } });
    return route.fulfill({ status: 409, json: { error: "not_connected" } });
  });

  // Someone else is sending: said plainly, with no error styling.
  await sendButton(page).click();
  const result = page.getByTestId("send-result");
  await expect(result).toContainText("A send for this list is already in progress. Wait a moment, then check the Fred Meyer app.");
  await expect(result.getByRole("alert")).toHaveCount(0); // no error styling

  // Unsure: the advice, what was added, what was not.
  await sendButton(page).click();
  await expect(result).toContainText("Wait about 5 minutes and check the cart in the Fred Meyer app before sending again.");
  await expect(result).toContainText(`Not added: ${secondName}.`);
  await expect(first).toContainText("Sent");
  await expect(lineNamed(page, secondName)).toContainText("Not added");

  // A retry after an unsure send asks first, and sends nothing until it is confirmed. It leaves out what was added.
  await sendButton(page).click();
  const warning = page.getByRole("dialog", { name: "Send these again" });
  await expect(warning.getByText("This adds them a second time. Fred Meyer can’t tell Basket what’s already in your cart.")).toBeVisible();
  expect(bodies).toHaveLength(2);
  await warning.getByRole("button", { name: "Add again" }).click();
  await expect(result).toContainText("Added.");
  expect(bodies[2].resend).toBe(true);
  expect(bodies[2].lines.map((l) => l.upc)).not.toContain(firstUpc);
  expect(bodies[2].lines.length).toBe(upcs.length - 1);

  // The account was disconnected elsewhere.
  await sendButton(page).click();
  await expect(result).toContainText("Connect Fred Meyer again.");
  await expect(page.getByRole("link", { name: "Connect Fred Meyer" })).toBeVisible();
});

/** The body the route sends back when a send may or may not have reached the cart. */
const UNSURE_BODY = { error: "unsure", ok: [] as string[], rejected: [] as { key: string; name: string }[] };
const ADVICE = "Basket couldn’t confirm every item reached your Fred Meyer cart. Wait about 5 minutes and check the cart in the Fred Meyer app before sending again.";

for (const look of ["light", "dark"] as const) {
  test(`the unsure-send warning stays on screen in both looks (${look})`, async ({ page }) => {
    await setLook(page, look);
    await readyToSend(page, `cartunsure${look}`);
    await page.route("**/api/kroger/cart", (route) => route.fulfill({ status: 504, json: UNSURE_BODY }));
    await sendButton(page).click();
    const warning = page.getByTestId("send-result").getByRole("alert");
    await expect(warning).toContainText(ADVICE);
    await expect(warning).toBeInViewport();
    // It stays until the next send: a tap elsewhere or a reload of the lines does not clear it.
    await page.getByRole("radio", { name: "Pickup" }).click();
    await expect(warning).toContainText(ADVICE);
  });
}

test("in the send-again sheet the filled button is Cancel", async ({ page }) => {
  await readyToSend(page, "cartagain");
  const bodies: unknown[] = [];
  await page.route("**/api/kroger/cart", (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 504, json: UNSURE_BODY });
  });
  await sendButton(page).click();
  await expect(page.getByTestId("send-result")).toContainText(ADVICE);
  await sendButton(page).click(); // a retry after an unsure send asks first
  const sheet = page.getByRole("dialog", { name: "Send these again" });
  const cancel = sheet.getByRole("button", { name: "Cancel" });
  const addAgain = sheet.getByRole("button", { name: "Add again" });
  const fill = (b: typeof cancel) => b.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await fill(addAgain)).toBe("rgba(0, 0, 0, 0)");
  expect(await fill(cancel)).not.toBe("rgba(0, 0, 0, 0)");
  expect(bodies).toHaveLength(1); // nothing is sent until "Add again"
  await cancel.click();
  await expect(sheet).toBeHidden();
  expect(bodies).toHaveLength(1);
});

test("a long product name keeps the stepper and total on screen at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await readyToSend(page, "cartlong");
  const line = page.getByTestId("review-line").first();
  await line.getByTestId("review-name").evaluate((el) => {
    el.textContent = "Extra Long Name Organic Free Range Boneless Skinless Chicken Thighs Family Value Pack With A Very Long Description Indeed";
  });
  const width = 360;
  for (const box of [
    await line.getByTestId("review-total").boundingBox(),
    await line.getByRole("button", { name: /^One more / }).boundingBox(),
    await line.getByRole("button", { name: /^One fewer / }).boundingBox(),
  ]) {
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test("every warning from the cart plan is still present", async ({ page }) => {
  await readyToSend(page, "cartwarnings");
  const rejectedName = "Simple Truth Organic Black Beans";
  // Each tap gets the next answer from the route; nothing reaches Fred Meyer.
  const answers: { status: number; json: unknown; text: string }[] = [
    { status: 409, json: { error: "already_sending" }, text: "A send for this list is already in progress. Wait a moment, then check the Fred Meyer app." },
    { status: 200, json: { sent: 1, rejected: [{ key: "black beans", name: rejectedName }] }, text: `Fred Meyer wouldn’t take: ${rejectedName}.` },
    { status: 409, json: { error: "already_sent" }, text: "Everything here is already in your cart." },
    { status: 502, json: { error: "rejected" }, text: "Fred Meyer wouldn’t take these items. Try swapping them." },
    { status: 429, json: { error: "too_many" }, text: "You’ve sent this list a lot today. Try again tomorrow." },
    { status: 429, json: { error: "slow_down" }, text: "Fred Meyer is busy. Try again in a minute." },
    { status: 429, json: { error: "allowance_spent" }, text: "Basket has looked up a lot of Fred Meyer prices today. Try again tomorrow." },
    { status: 409, json: { error: "unavailable" }, text: "That didn’t go through. Nothing was added." },
    { status: 500, json: {}, text: ADVICE },
    { status: 409, json: { error: "not_connected" }, text: "Connect Fred Meyer again." },
  ];
  let step = 0;
  await page.route("**/api/kroger/cart", (route) => {
    const a = answers[step++];
    return route.fulfill({ status: a.status, json: a.json });
  });
  const result = page.getByTestId("send-result");
  for (const a of answers) {
    await expect(sendButton(page)).toBeEnabled();
    await sendButton(page).click();
    await expect(result).toContainText(a.text);
  }
  expect(step).toBe(answers.length);
  // The words that stand beside the screen.
  await expect(page.getByText("You’ll sign in on Fred Meyer’s own page. Basket never sees your password.")).toBeVisible();
  await expect(page.getByText("Basket never places an order. You check out at Fred Meyer.")).toBeVisible();
  await expect(page.getByText("A new week starts a new list, so Basket may add items again that you didn’t buy last week.")).toBeVisible();
});
