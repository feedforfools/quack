import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Lobby E2E — Epic 2 acceptance criteria
 *
 * Two independent browser contexts (separate localStorage) join the same room
 * and verify they can see each other in the roster.
 *
 * Requirements:
 *   - Local Supabase stack must be running (`supabase start`).
 *   - `vite preview` serves the production build with VITE_SUPABASE_* from .env.local.
 *
 * The test creates a real room via the Create page and joins it via the Room
 * page. No network mocking — full integration against the local Supabase stack.
 */

/**
 * Seed a display name into localStorage on the given page.
 * Navigation to "/" first ensures we're on the same origin before touching
 * localStorage.
 */
async function seedDisplayName(page: Page, name: string) {
  await page.goto("/");
  await page.evaluate((n) => localStorage.setItem("quack_display_name", n), name);
}

test.describe("lobby roster — two players", () => {
  let hostContext: BrowserContext;
  let playerContext: BrowserContext;

  test.beforeEach(async ({ browser }) => {
    hostContext = await browser.newContext();
    playerContext = await browser.newContext();
  });

  test.afterEach(async () => {
    await hostContext.close();
    await playerContext.close();
  });

  test("host and joining player see each other in the lobby roster", async () => {
    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    // ── Host: set display name, create room ──────────────────────────────────
    await seedDisplayName(hostPage, "Host Duck");

    await hostPage.goto("/create");
    await expect(
      hostPage.getByRole("button", { name: /create room/i }),
    ).toBeVisible();
    await hostPage.getByRole("button", { name: /create room/i }).click();

    // Wait for navigation to the lobby /r/:code
    await hostPage.waitForURL(/\/r\/[A-Z2-9]{6}/, { timeout: 15_000 });
    const roomUrl = hostPage.url();
    const code = roomUrl.split("/r/")[1]?.slice(0, 6) ?? "";
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    // Host's own name appears in their roster
    await expect(hostPage.getByText("Host Duck")).toBeVisible({ timeout: 10_000 });

    // ── Player: set display name, navigate to the room URL ───────────────────
    await seedDisplayName(playerPage, "Player Duck");
    await playerPage.goto(`/r/${code}`);

    // Player sees the lobby (their own name appears first — from initial DB fetch)
    await expect(playerPage.getByText("Player Duck")).toBeVisible({ timeout: 10_000 });

    // Player can also see the host in their roster
    await expect(playerPage.getByText("Host Duck")).toBeVisible({ timeout: 10_000 });

    // ── Host sees the player (via Realtime presence sync → HTTP re-fetch) ────
    await expect(hostPage.getByText("Player Duck")).toBeVisible({ timeout: 15_000 });
  });

  test("navigating to a non-existent room code shows the stale-room screen", async () => {
    const page = await hostContext.newPage();

    await seedDisplayName(page, "Lost Duck");

    // Navigate to a code that could never exist in the DB (invalid alphabet char)
    await page.goto("/r/ZZZZZZ");

    // The stale-room heading should appear
    await expect(
      page.getByRole("heading", { name: /this room has ended/i }),
    ).toBeVisible({ timeout: 10_000 });

    // The Create CTA should be present
    await expect(
      page.getByRole("button", { name: /create a new room/i }),
    ).toBeVisible();
  });
});
