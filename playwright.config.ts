import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "fs";

// Load .env.local into process.env so E2E tests that make direct Supabase
// REST API calls (e.g., voting.spec.ts) can access VITE_SUPABASE_* vars.
// Uses only Node.js built-ins — no dotenv dependency required.
const envLocalPath = new URL(".env.local", import.meta.url).pathname;
if (existsSync(envLocalPath)) {
  for (const line of readFileSync(envLocalPath, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m?.[1] && !process.env[m[1]]) process.env[m[1]] = m[2] ?? "";
  }
}

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
  workers: process.env["CI"] ? 1 : 2,
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
