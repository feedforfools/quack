import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Resilience E2E — Epic 4 acceptance criteria (E4-T8)
 *
 * Tests:
 *  1. Reload mid-lobby: roster is restored without ghost duplicates.
 *  2. Reload mid-discussion: player stays on discussion screen (phase reconciliation).
 *  3. Kicked client lands on home with the "kicked" toast visible.
 *
 * Requirements:
 *   - Local Supabase stack must be running (`supabase start`).
 *   - `vite preview` serves the production build with VITE_SUPABASE_* from .env.local.
 *
 * Serial mode: these tests create real Supabase rooms and rely on Realtime.
 * Running them in parallel against the local stack causes contention and flakiness.
 */

// Run all tests in this file one at a time to avoid Realtime contention.
test.describe.configure({ mode: "serial" });

async function seedDisplayName(page: Page, name: string) {
  await page.goto("/");
  await page.evaluate(
    (n) => localStorage.setItem("quack_display_name", n),
    name,
  );
}

// ─── 1. Reload mid-lobby — no ghost duplicates ────────────────────────────────

test.describe("reload mid-lobby — no ghost duplicates", () => {
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

  test("player reload restores exactly one roster entry — no duplicates", async () => {
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    await seedDisplayName(hostPage, "Reload Host");
    await seedDisplayName(playerPage, "Reload Player");

    // Host creates a room.
    await hostPage.goto("/create");
    await hostPage.getByRole("button", { name: /create room/i }).click();
    await hostPage.waitForURL(/\/r\/[A-Z2-9]{6}/, { timeout: 15_000 });
    const roomCode = hostPage.url().split("/r/")[1]?.slice(0, 6) ?? "";

    // Player joins.
    await playerPage.goto(`/r/${roomCode}`);
    await expect(playerPage.getByText("Reload Player")).toBeVisible({
      timeout: 10_000,
    });

    // Host sees player in the roster.
    // Realtime presence sync can be flaky when running multiple E2E tests
    // serially against the local Supabase stack; reload the host as a
    // fallback if the player hasn't propagated within 15 s.
    try {
      await expect(hostPage.getByText("Reload Player")).toBeVisible({
        timeout: 15_000,
      });
    } catch {
      await hostPage.reload();
      await expect(hostPage.getByText("Reload Player")).toBeVisible({
        timeout: 15_000,
      });
    }

    // Player reloads the page.
    await playerPage.reload();

    // Player sees their own name again after reload.
    await expect(playerPage.getByText("Reload Player")).toBeVisible({
      timeout: 15_000,
    });

    // Host should still see exactly ONE entry for "Reload Player" (no ghost).
    // Wait long enough for any Realtime sync to settle.
    await expect(hostPage.getByText("Reload Player")).toBeVisible({
      timeout: 30_000,
    });
    const hostRosterEntries = hostPage.getByText("Reload Player");
    await expect(hostRosterEntries).toHaveCount(1, { timeout: 10_000 });

    // Player page itself must also show exactly one entry for their own name.
    const playerRosterEntries = playerPage.getByText("Reload Player");
    await expect(playerRosterEntries).toHaveCount(1, { timeout: 5_000 });
  });
});

// ─── 2. Reload mid-discussion — phase reconciliation ─────────────────────────
//
// After a page reload while roomState = "round_active", the player is placed
// back on the discussion screen — NOT bounced to the lobby.  This validates
// the E4-T1 server-state-driven phase reconciliation.  The seen_at-based
// initialHasPeeked suppression is covered by unit tests on RoleReveal.

test.describe("reload mid-discussion — phase reconciliation", () => {
  let hostCtx: BrowserContext;
  let p1Ctx: BrowserContext;
  let p2Ctx: BrowserContext;

  test.beforeEach(async ({ browser }) => {
    hostCtx = await browser.newContext();
    p1Ctx = await browser.newContext();
    p2Ctx = await browser.newContext();
  });

  test.afterEach(async () => {
    await Promise.all([hostCtx.close(), p1Ctx.close(), p2Ctx.close()]);
  });

  test("player reload during round_active shows the discussion screen, not lobby", async () => {
    // Increase timeout for this full-round-setup test.
    test.setTimeout(120_000);

    const hostPage = await hostCtx.newPage();
    const p1Page = await p1Ctx.newPage();
    const p2Page = await p2Ctx.newPage();

    await seedDisplayName(hostPage, "Peek Host");
    await seedDisplayName(p1Page, "Peek Player 1");
    await seedDisplayName(p2Page, "Peek Player 2");

    // Host creates room.
    await hostPage.goto("/create");
    await hostPage.getByRole("button", { name: /create room/i }).click();
    await hostPage.waitForURL(/\/r\/[A-Z2-9]{6}/, { timeout: 15_000 });
    const roomCode = hostPage.url().split("/r/")[1]?.slice(0, 6) ?? "";

    // Players join.
    await Promise.all([
      p1Page.goto(`/r/${roomCode}`),
      p2Page.goto(`/r/${roomCode}`),
    ]);
    // Each player sees their own name (confirms join completed).
    await Promise.all([
      expect(p1Page.getByText("Peek Player 1")).toBeVisible({
        timeout: 15_000,
      }),
      expect(p2Page.getByText("Peek Player 2")).toBeVisible({
        timeout: 15_000,
      }),
    ]);

    // All non-host players ready up (sequentially to avoid flaky parallel clicks).
    // The ready toggle broadcasts a refetch event so the host will see all players.
    // We click ready BEFORE waiting on the host so the broadcast is in-flight,
    // and we use a reload fallback if Realtime is flaky.
    await p1Page.getByRole("button", { name: /i\u2019m ready/i }).click();
    await p2Page.getByRole("button", { name: /i\u2019m ready/i }).click();

    // Wait for Start Game to become enabled — this confirms the host sees all
    // players as ready. Reload the host once if Realtime didn't propagate.
    try {
      await expect(
        hostPage.getByRole("button", { name: /start game/i }),
      ).toBeEnabled({ timeout: 15_000 });
    } catch {
      await hostPage.reload();
      await expect(
        hostPage.getByRole("button", { name: /start game/i }),
      ).toBeEnabled({ timeout: 15_000 });
    }

    // Host starts the game.
    await hostPage.getByRole("button", { name: /start game/i }).click();

    // All players land on the discussion screen (role reveal card visible).
    // The drag-lid button always shows "Hold & drag to peek" (t("round.dragToReveal")).
    const revealButton = /hold & drag to peek/i;
    await Promise.all([
      expect(hostPage.getByRole("button", { name: revealButton })).toBeVisible({
        timeout: 20_000,
      }),
      expect(p1Page.getByRole("button", { name: revealButton })).toBeVisible({
        timeout: 20_000,
      }),
      expect(p2Page.getByRole("button", { name: revealButton })).toBeVisible({
        timeout: 20_000,
      }),
    ]);

    // p1 reloads the page mid-discussion.
    await p1Page.reload();

    // After reload p1 MUST be on the discussion screen — NOT the lobby.
    // The presence of the role-reveal card confirms round_active phase was restored.
    await expect(
      p1Page.getByRole("button", { name: revealButton }),
    ).toBeVisible({
      timeout: 20_000,
    });

    // p1 must still be in the room roster (not evicted by the reload).
    await expect(p1Page.getByText("Peek Player 1")).toBeVisible();

    // Confirm p1 is NOT on the lobby (Start Game / I'm Ready buttons absent).
    await expect(
      p1Page.getByRole("button", { name: /i\u2019m ready/i }),
    ).not.toBeVisible();
    await expect(
      p1Page.getByRole("button", { name: /start game/i }),
    ).not.toBeVisible();
  });
});

// ─── 3. Kicked client lands on home with toast ────────────────────────────────

test.describe("kick — kicked client lands on home with toast", () => {
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

  test("host kicks a player; kicked player is navigated home with a toast", async () => {
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    await seedDisplayName(hostPage, "Kicking Host");
    await seedDisplayName(playerPage, "Kicked Player");

    // Host creates room.
    await hostPage.goto("/create");
    await hostPage.getByRole("button", { name: /create room/i }).click();
    await hostPage.waitForURL(/\/r\/[A-Z2-9]{6}/, { timeout: 15_000 });
    const roomCode = hostPage.url().split("/r/")[1]?.slice(0, 6) ?? "";

    // Player joins.
    await playerPage.goto(`/r/${roomCode}`);
    await expect(playerPage.getByText("Kicked Player")).toBeVisible({
      timeout: 10_000,
    });

    // Host waits for the player to appear in their roster.
    // Realtime presence sync can be flaky when the local Supabase stack has
    // accumulated WebSocket churn from prior tests in the same run; if the
    // player hasn't propagated within 15 s, force a host reload so the room
    // page re-fetches the roster from the DB on mount.
    try {
      await expect(hostPage.getByText("Kicked Player")).toBeVisible({
        timeout: 15_000,
      });
    } catch {
      await hostPage.reload();
      await expect(hostPage.getByText("Kicked Player")).toBeVisible({
        timeout: 15_000,
      });
    }

    // Host clicks the kick (✕) button next to the player's name.
    // aria-label is t("room.kickCta") which is "Kick".
    await hostPage.getByRole("button", { name: /^kick$/i }).click();

    // Kicked player is navigated to home.
    await playerPage.waitForURL("/", { timeout: 15_000 });

    // The "kicked" toast should be visible on the player's home page.
    await expect(
      playerPage.getByText(/you were removed from the room/i),
    ).toBeVisible({ timeout: 5_000 });

    // Host's roster no longer shows the kicked player.
    await expect(hostPage.getByText("Kicked Player")).not.toBeVisible({
      timeout: 10_000,
    });
  });
});
