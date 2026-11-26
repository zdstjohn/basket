import { defineConfig, devices } from "@playwright/test";

// Starts the built app with E2E unset to prove the test-only login route is
// closed. Run with: npx playwright test -c playwright.locked.config.ts
export default defineConfig({
  testDir: "./e2e/locked",
  outputDir: "./test-results/locked",
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100" },
  projects: [{ name: "locked", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run start -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { E2E: "", VERCEL: "" },
  },
});
