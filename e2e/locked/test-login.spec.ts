import { expect, test } from "@playwright/test";

// Runs under playwright.locked.config.ts, whose server starts with E2E unset.
test("the test-only login route does not exist without E2E=1", async ({
  request,
}) => {
  expect((await request.get("/api/test/login")).status()).toBe(404);
  const post = await request.post("/api/test/login", {
    data: { email: "someone@example.test" },
  });
  expect(post.status()).toBe(404);
});
