import { expect, test, type Page } from "@playwright/test";

async function seedDisplayName(page: Page, name: string) {
  await page.goto("/");
  await page.evaluate(
    (displayName) => localStorage.setItem("quack_display_name", displayName),
    name,
  );
}

test.describe("host settings grouping", () => {
  test("keeps basic settings visible and reveals advanced settings on demand", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await seedDisplayName(page, "Settings Duck");

    await page.goto("/create");
    await page.getByRole("button", { name: /create room/i }).click();
    await page.waitForURL(/\/r\/[A-Z2-9]{6}/, { timeout: 15_000 });

    await page.getByRole("button", { name: /game settings/i }).click();

    await expect(page.getByText(/basic settings/i)).toBeVisible();
    await expect(page.getByText(/^language$/i)).toBeVisible();
    await expect(page.getByText(/word categories/i)).toBeVisible();
    await expect(page.getByText(/^imposters$/i)).toBeVisible();
    await expect(page.getByText(/discussion timer/i)).toBeVisible();
    await expect(page.getByText(/imposters see each other/i)).toBeHidden();

    await page.getByRole("button", { name: /advanced settings/i }).click();

    await expect(page.getByText(/imposters see each other/i)).toBeVisible();
    await expect(page.getByText(/imposter hints/i)).toBeVisible();
    await expect(page.getByText(/^voting$/i)).toBeVisible();
    await expect(page.getByText(/call-to-vote threshold/i)).toBeVisible();
    await expect(page.getByText(/voting timer/i)).toBeVisible();
    await expect(page.getByText(/show live vote count/i)).toBeVisible();

    await context.close();
  });
});
