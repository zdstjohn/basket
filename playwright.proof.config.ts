import { defineConfig, devices } from "@playwright/test";

/**
 * The visual proof: before/after shots, motion clips and measurements.
 * Run with `npm run proof` (builds and serves against the local Supabase). Output goes to /proof-out/.
 * Two workers. They are not guaranteed to be one per browser: for WebKit and Chromium at the same time use `npm run proof:parallel`.
 */
export default defineConfig({
  testDir: "./proof",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./proof/page.ts",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 90_000,
  // Each process of scripts/proof-run.sh gets its own, since Playwright empties it at the start of a run.
  outputDir: process.env.PROOF_OUT_DIR ?? "proof-out/.raw",
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
    // scripts/proof-run.sh starts the server once and shares it between its two Playwright processes.
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
