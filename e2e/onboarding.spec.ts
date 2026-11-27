import { expect, test } from "@playwright/test";
import { signInAs, uniqueEmail } from "./helpers/auth";
import { FAMILY, onboard } from "./helpers/household";

test("a new family signs in, sets up the household and sees it", async ({
  page,
}, testInfo) => {
  const shots = `e2e/screenshots/${testInfo.project.name}`;
  await signInAs(page, uniqueEmail("onboard"));
  await onboard(page);

  await expect(page.getByLabel("Weekly budget target")).toHaveValue("$200");
  await expect(page.getByLabel("Wiggle room")).toHaveValue("+$25");
  await expect(page.getByText("3.8 servings").first()).toBeVisible();
  await page.screenshot({ path: `${shots}/onboarding.png`, fullPage: true });

  await page.getByRole("button", { name: "Start planning" }).click();
  await expect(page).toHaveURL(/\/week$/);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();

  await page.getByRole("link", { name: "Household" }).click();
  await expect(page).toHaveURL(/\/household$/);
  await expect(
    page.getByRole("heading", { name: "Who’s eating · 3.8 servings" }),
  ).toBeVisible();
  const rows = page.getByTestId("person-row");
  await expect(rows).toHaveCount(FAMILY.length);
  await expect(rows.filter({ hasText: "Mom" })).toContainText("Vegetarian");
  await expect(rows.filter({ hasText: "Dad" })).toContainText("No restrictions");
  await expect(page.getByLabel("Target")).toHaveValue("$200");
  await expect(page.getByLabel("Wiggle room")).toHaveValue("+$25");
  await page.screenshot({ path: `${shots}/household.png`, fullPage: true });
});

test("onboarding shows one person editor at a time", async ({ page }) => {
  await signInAs(page, uniqueEmail("onboard-one"));
  await onboard(page, FAMILY.slice(0, 2));
  await expect(page.getByRole("group", { name: /^Person/ })).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Person 2" })).toBeVisible();
  await expect(page.getByTestId("person-row")).toHaveCount(1);
  await expect(page.getByTestId("person-row").first()).toContainText("Dad");

  await page.getByTestId("person-row").first().click();
  await expect(page.getByRole("group", { name: "Person 1" })).toBeVisible();
  await expect(page.getByRole("group", { name: /^Person/ })).toHaveCount(1);
  await expect(page.getByTestId("person-row").first()).toContainText("Mom");
});

test("Start planning keeps the person still being edited", async ({ page }) => {
  await signInAs(page, uniqueEmail("onboard-open"));
  await onboard(page, FAMILY.slice(0, 2));
  await expect(page.getByRole("group", { name: "Person 2" })).toBeVisible();
  await page.getByRole("button", { name: "Start planning" }).click();
  await expect(page).toHaveURL(/\/week$/);

  await page.goto("/household");
  const rows = page.getByTestId("person-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Mom" })).toBeVisible();
});

test("someone with no session is sent to sign in", async ({ page }) => {
  await page.goto("/week");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("button", { name: "Email me a sign-in link" }),
  ).toBeVisible();
});

test("an owner invites a partner who joins the same household", async ({
  page,
  browser,
}) => {
  await signInAs(page, uniqueEmail("owner"));
  await onboard(page);
  await page.getByRole("button", { name: "Start planning" }).click();
  await expect(page).toHaveURL(/\/week$/);

  await page.goto("/household");
  await page.getByRole("button", { name: "Invite" }).click();
  const link = page.getByLabel("Invite link");
  await expect(link).toHaveValue(/\/invite\/[0-9a-f]{64}$/);
  const url = await link.inputValue();
  await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();

  const baseURL = test.info().project.use.baseURL;
  const partner = await browser.newContext({ baseURL });
  const partnerPage = await partner.newPage();
  await signInAs(partnerPage, uniqueEmail("partner"));
  await partnerPage.goto(url);
  await expect(partnerPage).toHaveURL(/\/week$/);
  await partnerPage.goto("/household");
  await expect(
    partnerPage.getByRole("heading", { name: "Who’s eating · 3.8 servings" }),
  ).toBeVisible();
  await expect(partnerPage.getByTestId("person-row")).toHaveCount(FAMILY.length);
  await expect(partnerPage.getByRole("button", { name: "Invite" })).toHaveCount(0);
  await partner.close();

  const stranger = await browser.newContext({ baseURL });
  const strangerPage = await stranger.newPage();
  await signInAs(strangerPage, uniqueEmail("stranger"));
  await strangerPage.goto(url);
  await expect(strangerPage.getByText("This invite was already used")).toBeVisible();
  await stranger.close();
});

test("a signed-out invite visitor signs in first and comes back", async ({
  page,
}) => {
  await page.goto("/invite/abc");
  await expect(page).toHaveURL(/\/login\?next=%2Finvite%2Fabc$/);
});
