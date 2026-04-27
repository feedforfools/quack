import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Quack E2E tests.
 *
 * - Smoke tests run against a local Vite preview server.
 * - Only Chromium is used at this stage (mobile Chrome viewport for mobile-first QA).
 * - Firefox and WebKit will be added when multi-device E2E scenarios land in Epics 2–3.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: process.env["CI"] ? 1 : undefined,
  reporter: process.env["CI"] ? "github" : "list",

  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],

  /* Spin up `vite preview` (serves the production build) before tests. */
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env["CI"],
    timeout: 30_000,
  },
});
