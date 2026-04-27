import { expect, test } from "@playwright/test";

/**
 * Smoke test: the home route loads and renders the primary heading.
 *
 * This is the E0-T6 baseline test. It verifies the Vite preview server is
 * reachable and that the React app mounts correctly. Richer E2E scenarios
 * (multi-device join, round flow) land in Epics 2–3.
 */
test("home route renders the Quack heading", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Quack" })).toBeVisible();
});
