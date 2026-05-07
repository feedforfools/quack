import { expect, test, type Page } from "@playwright/test";

async function seedDisplayName(page: Page, name: string) {
  await page.goto("/");
  await page.evaluate(
    (displayName) => localStorage.setItem("quack_display_name", displayName),
    name,
  );
}

test.describe("create room basic settings", () => {
  test("persists selected basic settings into the created room", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await seedDisplayName(page, "Create Config Duck");

    await page.goto("/create");
    await expect(page.getByText(/set the basics now/i)).toBeVisible();
    await expect(page.getByText(/more rules wait in the lobby/i)).toBeVisible();

    await page
      .getByLabel("Language", { exact: true })
      .getByRole("button", { name: "IT" })
      .click();
    await page.getByRole("button", { name: /animals/i }).click();
    await page.getByRole("button", { name: "+" }).click();
    await page.selectOption("#create-setting-timer", "120");
    await page.getByRole("button", { name: /create room/i }).click();
    await page.waitForURL(/\/r\/[A-Z2-9]{6}/, { timeout: 15_000 });

    await page.getByRole("button", { name: /game settings/i }).click();
    const settings = page.locator("#settings-body");

    await expect(settings.getByRole("button", { name: "IT" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      settings.getByRole("button", { name: /animals/i }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(settings.locator("#setting-timer")).toHaveValue("120");

    await context.close();
  });
});
