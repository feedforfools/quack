import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Discussion screen — new paginated UX (E5.5-T6)
 *
 * Verifies the E5.5-T7 UX improvements end-to-end:
 *   1. After game start, the role-peek modal auto-opens immediately
 *      (no separate RevealScreen page).
 *   2. The drag-lid button is inside the modal.
 *   3. Closing the modal reveals the Discussion screen (correct heading).
 *   4. "Peek at role" button reopens the modal.
 *   5. Call-to-vote section is visible for no-timer games.
 *   6. Two players calling to vote hits the threshold → VotingScreen shown.
 *   7. All players casting their vote triggers auto-resolve → ResultScreen.
 *
 * Requirements:
 *   - Local Supabase stack must be running (`supabase start`).
 *   - `vite preview` serves the build with VITE_SUPABASE_* from .env.local.
 */
test.describe.configure({ mode: "serial" });

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function seedDisplayName(page: Page, name: string) {
  await page.goto("/");
  await page.evaluate(
    (displayName) => localStorage.setItem("quack_display_name", displayName),
    name,
  );
}

/**
 * Close the role-peek modal if it is currently open (it auto-opens on game
 * start or after a reload when seenAt is null). Safe to call even if closed.
 * Retries with Escape as a fallback — the close button sits on the draggable
 * lid, so a click can occasionally be swallowed by the drag handler.
 */
async function closeModalIfOpen(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const open = await page
      .getByRole("dialog")
      .isVisible()
      .catch(() => false);
    if (!open) return;
    if (attempt === 0) {
      await page
        .getByRole("button", { name: "Close card" })
        .click({ timeout: 3_000 })
        .catch(() => {});
    } else {
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(500);
  }
  await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5_000 });
}

// ─── Test suite ───────────────────────────────────────────────────────────────

test.describe("discussion screen — paginated UX (E5.5-T6)", () => {
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

  test("modal auto-opens on game start; discussion → voting → auto-resolve → result", async () => {
    test.setTimeout(180_000);

    const hostPage = await hostCtx.newPage();
    const p1Page = await p1Ctx.newPage();
    const p2Page = await p2Ctx.newPage();

    // ── Seed display names ─────────────────────────────────────────────
    await Promise.all([
      seedDisplayName(hostPage, "Disc Host"),
      seedDisplayName(p1Page, "Disc P1"),
      seedDisplayName(p2Page, "Disc P2"),
    ]);

    // ── Host creates room ──────────────────────────────────────────────
    // The Create page is a game picker — tapping the Imposter card creates
    // the room immediately with the default config.
    await hostPage.goto("/create");
    await expect(
      hostPage.getByRole("button", { name: /^imposter/i }),
    ).toBeVisible({ timeout: 10_000 });
    await hostPage.getByRole("button", { name: /^imposter/i }).click();
    await hostPage.waitForURL(/\/r\/[A-Z2-9]{6}/, { timeout: 15_000 });
    const roomCode =
      hostPage.url().split("/r/")[1]?.slice(0, 6).toUpperCase() ?? "";
    expect(roomCode).toMatch(/^[A-Z2-9]{6}$/);

    // ── Players join ───────────────────────────────────────────────────
    await Promise.all([
      p1Page.goto(`/r/${roomCode}`),
      p2Page.goto(`/r/${roomCode}`),
    ]);
    await Promise.all([
      expect(p1Page.getByText("Disc P1")).toBeVisible({ timeout: 15_000 }),
      expect(p2Page.getByText("Disc P2")).toBeVisible({ timeout: 15_000 }),
    ]);

    // ── Players mark ready ─────────────────────────────────────────────
    await p1Page.getByRole("button", { name: "Ready", exact: true }).click();
    await p2Page.getByRole("button", { name: "Ready", exact: true }).click();

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

    // ── Host starts game ───────────────────────────────────────────────
    await hostPage.getByRole("button", { name: /start game/i }).click();

    // ── 1. Role-peek modal auto-opens immediately ──────────────────────
    // No separate RevealScreen; DiscussionScreen opens the modal on mount
    // when seenAt = null.  The "Hold & drag to peek" button lives in the
    // modal (inside RoleReveal).
    await Promise.all([
      expect(hostPage.getByRole("dialog")).toBeVisible({ timeout: 20_000 }),
      expect(p1Page.getByRole("dialog")).toBeVisible({ timeout: 20_000 }),
      expect(p2Page.getByRole("dialog")).toBeVisible({ timeout: 20_000 }),
    ]);

    // Modal carries the correct title and the drag-lid button.
    await expect(
      p1Page.getByRole("heading", { name: /your role/i }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      p1Page.getByRole("button", { name: /hold & drag to peek/i }),
    ).toBeVisible({ timeout: 5_000 });

    // ── 2. Page URL stays on /r/<code> — no separate /reveal route ─────
    expect(p1Page.url()).toMatch(/\/r\/[A-Z2-9]{6}$/i);

    // ── 3. Closing the modal reveals the Discussion screen ────────────
    await Promise.all([
      closeModalIfOpen(hostPage),
      closeModalIfOpen(p1Page),
      closeModalIfOpen(p2Page),
    ]);

    // The Discussion screen action bar ("Your card") is now interactive.
    await Promise.all([
      expect(hostPage.getByRole("button", { name: /your card/i })).toBeVisible({
        timeout: 5_000,
      }),
      expect(p1Page.getByRole("button", { name: /your card/i })).toBeVisible({
        timeout: 5_000,
      }),
      expect(p2Page.getByRole("button", { name: /your card/i })).toBeVisible({
        timeout: 5_000,
      }),
    ]);

    // ── 4. "Your card" button reopens the modal ────────────────────────
    await p1Page.getByRole("button", { name: /your card/i }).click();
    await expect(p1Page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    await closeModalIfOpen(p1Page);
    await expect(p1Page.getByRole("dialog")).not.toBeVisible({
      timeout: 3_000,
    });

    // ── 5. Call-to-vote affordance is visible (timer not started) ──────
    await expect(
      p1Page.getByText(/call a vote when you.re ready\./i),
    ).toBeVisible({ timeout: 5_000 });

    // ── 6. Two players call to vote → threshold met → VotingScreen ─────
    // 3 active players, vote_threshold_fraction = 0.5 → CEIL(3 × 0.5) = 2.
    // With the discussion timer not started, the button reads "Go to vote".
    await p1Page.getByRole("button", { name: /go to vote/i }).click();

    // p2 may need a nudge if Realtime hasn't propagated yet.
    try {
      await expect(
        p2Page.getByRole("button", { name: /go to vote/i }),
      ).toBeVisible({ timeout: 10_000 });
    } catch {
      await p2Page.reload();
      await closeModalIfOpen(p2Page);
      await expect(
        p2Page.getByRole("button", { name: /go to vote/i }),
      ).toBeVisible({ timeout: 10_000 });
    }
    await p2Page.getByRole("button", { name: /go to vote/i }).click();

    // All pages should show VotingScreen.
    const activeLabel = /voting in progress/i;
    await Promise.all([
      expect(hostPage.getByText(activeLabel)).toBeVisible({
        timeout: 15_000,
      }),
      expect(p1Page.getByText(activeLabel)).toBeVisible({ timeout: 15_000 }),
      expect(p2Page.getByText(activeLabel)).toBeVisible({ timeout: 15_000 }),
    ]);

    // ── 7. All players cast a vote → auto-resolve → ResultScreen ────────
    // Auto-resolve fires in Room.tsx after the last castVote succeeds
    // (E5.5-T7 improvement #4). No external REST trigger needed.
    // The first two votes can be confirmed in VotingScreen before the last
    // vote triggers auto-resolve and transitions the screen to ResultScreen.
    const hostVoteList = hostPage.locator('[aria-label="Players"]').last();
    const p1VoteList = p1Page.locator('[aria-label="Players"]').last();
    const p2VoteList = p2Page.locator('[aria-label="Players"]').last();

    // Host → Disc P1
    await hostVoteList.getByRole("button", { name: "Disc P1" }).click();
    await expect(
      hostVoteList.getByRole("button", { name: /Disc P1.*your vote/i }),
    ).toBeVisible({ timeout: 8_000 });

    // Disc P1 → Disc P2
    await p1VoteList.getByRole("button", { name: "Disc P2" }).click();
    await expect(
      p1VoteList.getByRole("button", { name: /Disc P2.*your vote/i }),
    ).toBeVisible({ timeout: 8_000 });

    // Disc P2 → Disc Host (last vote — auto-resolve fires immediately,
    // transitioning all pages to ResultScreen before "your vote" appears).
    await p2VoteList.getByRole("button", { name: "Disc Host" }).click();

    // All pages should land on the ResultScreen.
    const outcomeMatcher = /imposters caught!|imposters win!|it.s a tie!/i;
    await Promise.all([
      expect(
        hostPage.getByRole("heading", { name: outcomeMatcher }),
      ).toBeVisible({ timeout: 20_000 }),
      expect(p1Page.getByRole("heading", { name: outcomeMatcher })).toBeVisible(
        { timeout: 20_000 },
      ),
      expect(p2Page.getByRole("heading", { name: outcomeMatcher })).toBeVisible(
        { timeout: 20_000 },
      ),
    ]);

    // "The secret word was" section confirms result data is loaded.
    await expect(hostPage.getByText(/the secret word was/i)).toBeVisible({
      timeout: 5_000,
    });
  });
});
