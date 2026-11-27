import { expect, test } from "@playwright/test";
import { createHousehold, joinAsPartner } from "./helpers/household";

// Runs against the fake sign-in (KROGER_FAKE=1): no call ever leaves the machine.
test("Fred Meyer account: connect, stays connected, disconnect, and it is per person", async ({ page, browser }, testInfo) => {
  await createHousehold(page);
  await page.goto("/household");
  const stores = page.getByRole("region", { name: "Stores and settings" });
  await expect(stores.getByText("Fred Meyer account")).toBeVisible();
  await expect(stores.getByText("You’ll sign in on Fred Meyer’s own page. Basket never sees your password.")).toBeVisible();

  await stores.getByRole("link", { name: "Connect" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Fred Meyer is connected." })).toHaveText("Fred Meyer is connected.");
  await expect(page).toHaveURL(/\/household$/); // ?fm= is taken out of the address after the notice shows
  await expect(stores.getByText("Connected", { exact: true })).toBeVisible();
  await expect(stores.getByRole("link", { name: "Connect" })).toHaveCount(0);
  await page.screenshot({ path: `e2e/screenshots/${testInfo.project.name}/fred-meyer-connected.png`, fullPage: true });

  // Tokens never reach the browser.
  const exposed = await page.evaluate(() => document.cookie + JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(exposed).not.toContain("fake-access");
  expect(exposed).not.toContain("fake-refresh");
  expect(await page.content()).not.toContain("fake-access");
  // The sign-in cookie is gone after the round trip.
  expect((await page.context().cookies()).some((c) => c.name === "kroger_oauth")).toBe(false);

  await page.goto("/household");
  await expect(stores.getByText("Connected", { exact: true })).toBeVisible();

  // A partner in the same household has their own link: still not connected.
  const partner = await joinAsPartner(page, browser);
  await partner.page.goto("/household");
  const theirs = partner.page.getByRole("region", { name: "Stores and settings" });
  await expect(theirs.getByRole("link", { name: "Connect" })).toBeVisible();
  await partner.context.close();

  await page.goto("/household");
  await stores.getByRole("button", { name: "Disconnect" }).click();
  await expect(stores.getByRole("link", { name: "Connect" })).toBeVisible();
  await page.reload();
  await expect(stores.getByRole("link", { name: "Connect" })).toBeVisible();
  await expect(stores.getByText("Connected", { exact: true })).toHaveCount(0);
});

test("a sign-in that did not start here is refused", async ({ page }) => {
  await createHousehold(page);
  const res = await page.request.get("/api/kroger/callback?code=fake-code&state=nope", { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers().location).toContain("/list/review?fm=failed");
  await page.goto("/household");
  await expect(page.getByRole("region", { name: "Stores and settings" }).getByRole("link", { name: "Connect" })).toBeVisible();
});

test("Connected is said in words, not by color", async ({ page }) => {
  await createHousehold(page);
  await page.goto("/household");
  const stores = page.getByRole("region", { name: "Stores and settings" });
  await stores.getByRole("link", { name: "Connect" }).click();
  const word = stores.getByText("Connected", { exact: true });
  await expect(word).toBeVisible();
  await expect(word.locator("svg")).toHaveCount(1);
  const [wordColor, titleColor] = await Promise.all([
    word.evaluate((el) => getComputedStyle(el).color),
    stores.getByText("Fred Meyer account").evaluate((el) => getComputedStyle(el).color),
  ]);
  expect(wordColor).toBe(titleColor); // ink, like the row's name: no green
  await expect(stores.getByRole("button", { name: "Disconnect" })).toBeVisible();
});
