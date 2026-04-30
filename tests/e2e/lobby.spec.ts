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

// ─── Resume from home ─────────────────────────────────────────────────────────

test.describe("resume from home — active-room card", () => {
  test("home page shows active-room card with Resume button after creating a room", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await seedDisplayName(page, "Resuming Duck");

    // Create a room via the Create page.
    await page.goto("/create");
    await page.getByRole("button", { name: /create room/i }).click();
    await page.waitForURL(/\/r\/[A-Z2-9]{6}/, { timeout: 15_000 });
    const roomCode = page.url().split("/r/")[1]?.slice(0, 6) ?? "";

    // Navigate back to home — the device still has an active players row.
    await page.goto("/");

    // Active-room card should be visible.
    await expect(page.getByText(/you're in a room/i)).toBeVisible({ timeout: 10_000 });

    // Resume button should navigate back to the room.
    await page.getByRole("button", { name: /resume room/i }).click();
    await page.waitForURL(new RegExp(`/r/${roomCode}`), { timeout: 10_000 });

    await ctx.close();
  });
});

// ─── Host leave: end room alone ───────────────────────────────────────────────

test.describe("host leave — end room alone", () => {
  test("host can end the room when alone and is redirected to home", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await seedDisplayName(page, "Solo Host Duck");

    await page.goto("/create");
    await page.getByRole("button", { name: /create room/i }).click();
    await page.waitForURL(/\/r\/[A-Z2-9]{6}/, { timeout: 15_000 });

    // Open the host leave modal.
    await page.getByRole("button", { name: /leave room/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });

    // Click End Room — the host is alone so only this button is present.
    await page.getByRole("button", { name: /end room/i }).click();

    // Should be redirected to the home page.
    await page.waitForURL("/", { timeout: 10_000 });

    await ctx.close();
  });
});

// ─── Host leave: handover to another player ───────────────────────────────────

test.describe("host leave — handover to another player", () => {
  let hostCtx: BrowserContext;
  let playerCtx: BrowserContext;

  test.beforeEach(async ({ browser }) => {
    hostCtx = await browser.newContext();
    playerCtx = await browser.newContext();
  });

  test.afterEach(async () => {
    await hostCtx.close();
    await playerCtx.close();
  });

  test("host can hand over to a player and is redirected to home", async () => {
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    await seedDisplayName(hostPage, "Handover Host");
    await seedDisplayName(playerPage, "Handover Player");

    // Host creates a room.
    await hostPage.goto("/create");
    await hostPage.getByRole("button", { name: /create room/i }).click();
    await hostPage.waitForURL(/\/r\/[A-Z2-9]{6}/, { timeout: 15_000 });
    const roomCode = hostPage.url().split("/r/")[1]?.slice(0, 6) ?? "";

    // Player navigates directly to the room URL.
    await playerPage.goto(`/r/${roomCode}`);
    await expect(playerPage.getByText("Handover Player")).toBeVisible({ timeout: 10_000 });

    // Host waits until the player appears in their roster (Realtime presence sync).
    await expect(hostPage.getByText("Handover Player")).toBeVisible({ timeout: 15_000 });

    // Host opens the leave modal.
    await hostPage.getByRole("button", { name: /leave room/i }).click();
    await expect(hostPage.getByRole("dialog")).toBeVisible({ timeout: 5_000 });

    // Select the player as the successor via their radio button.
    await hostPage.getByRole("radio", { name: "Handover Player" }).click();

    // Click Hand Over & Leave.
    await hostPage.getByRole("button", { name: /hand over/i }).click();

    // Host should be navigated back to home.
    await hostPage.waitForURL("/", { timeout: 10_000 });

    // Player should eventually see the "Host" badge next to their own name
    // (roster re-fetched after host's players row is removed).
    await expect(
      playerPage.getByText("Host").first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
