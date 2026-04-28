import { expect, test } from "@playwright/test";

/**
 * Smoke tests for the home route.
 *
 * E0-T6 baseline: app mounts and heading is visible.
 * E1-T6 extension: full home page renders name field and both CTAs.
 */
test("home route renders the Quack heading", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Quack" })).toBeVisible();
});

test("home page renders name field and both CTAs", async ({ page }) => {
  await page.goto("/");

  // Name input is labelled
  await expect(page.getByLabel(/your name/i)).toBeVisible();

  // Both CTAs present
  await expect(page.getByRole("button", { name: /create room/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /join room/i })).toBeVisible();

  // Privacy footer link present
  await expect(page.getByRole("link", { name: /privacy/i })).toBeVisible();
});

test("clicking Create Room without a name shows the name prompt", async ({
  page,
}) => {
  await page.goto("/");

  // Ensure localStorage is empty (fresh visit)
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: /create room/i }).click();

  // The prompt overlay should appear
  await expect(
    page.getByRole("dialog", { name: /what.s your name/i }),
  ).toBeVisible();
});

