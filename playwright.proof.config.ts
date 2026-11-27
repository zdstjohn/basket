import { defineConfig, devices } from "@playwright/test";

/**
 * The visual proof: before/after shots, motion clips and measurements.
 * Run with `npm run proof` (builds and serves against the local Supabase). Output goes to /proof-out/.
 * Two workers, so the WebKit (iPhone 17) and Chromium (Pixel 7) projects run at the same time.
 */
export default defineConfig({
  testDir: "./proof",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./proof/page.ts",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 90_000,
  outputDir: "proof-out/.raw",
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    // Motion clips are recorded by proof/record.spec.ts in a context of its own, after setup, so the clip holds only the motion.
    video: "off",
  },
  projects: [
    {
      name: "iphone-17",
      use: {
        ...devices["iPhone 15 Pro"],
        browserName: "webkit",
        viewport: { width: 402, height: 874 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "pixel-7",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
