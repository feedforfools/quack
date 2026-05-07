import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Voting E2E — Epic 5 acceptance criteria (E5-T10)
 *
 * Exercises the full voting flow across 4 independent browser contexts:
 *   request → reach threshold → active voting → cast → resolve → result screen
 *
 * Also verifies anonymity: live_vote_tally is off by default, so no per-player
 * tally counts appear in the civilian voting grid.
 *
 * Requirements:
 *   - Local Supabase stack must be running (`supabase start`).
 *   - `vite preview` serves the production build with VITE_SUPABASE_* from .env.local.
 *   - VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be available in process.env
 *     (playwright.config.ts loads them from .env.local automatically).
 *
 * Serial mode: creates a real Supabase room and relies on Realtime.
 */
test.describe.configure({ mode: "serial" });

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function seedDisplayName(page: Page, name: string) {
  await page.goto("/");
  await page.evaluate(
    (n) => localStorage.setItem("quack_display_name", n),
    name,
  );
}

// ─── Test ─────────────────────────────────────────────────────────────────────

test.describe("voting flow — 4 contexts", () => {
  let hostCtx: BrowserContext;
  let p1Ctx: BrowserContext;
  let p2Ctx: BrowserContext;
  let p3Ctx: BrowserContext;

  test.beforeEach(async ({ browser }) => {
    hostCtx = await browser.newContext();
    p1Ctx = await browser.newContext();
    p2Ctx = await browser.newContext();
    p3Ctx = await browser.newContext();
  });

  test.afterEach(async () => {
    await Promise.all([
      hostCtx.close(),
      p1Ctx.close(),
      p2Ctx.close(),
      p3Ctx.close(),
    ]);
  });

  test("request → threshold → cast → resolve → result screen (live_tally=false)", async () => {
    test.setTimeout(180_000);

    const hostPage = await hostCtx.newPage();
    const p1Page = await p1Ctx.newPage();
    const p2Page = await p2Ctx.newPage();
    const p3Page = await p3Ctx.newPage();

    // ── Seed display names ─────────────────────────────────────────────────
    await Promise.all([
      seedDisplayName(hostPage, "Voting Host"),
      seedDisplayName(p1Page, "Voter 1"),
      seedDisplayName(p2Page, "Voter 2"),
      seedDisplayName(p3Page, "Voter 3"),
    ]);

    // ── Host creates room ──────────────────────────────────────────────────
    await hostPage.goto("/create");
    await expect(
      hostPage.getByRole("button", { name: /create room/i }),
    ).toBeVisible();
    await hostPage.getByRole("button", { name: /create room/i }).click();
    await hostPage.waitForURL(/\/r\/[A-Z2-9]{6}/, { timeout: 15_000 });
    const roomCode =
      hostPage.url().split("/r/")[1]?.slice(0, 6).toUpperCase() ?? "";
    expect(roomCode).toMatch(/^[A-Z2-9]{6}$/);

    // ── Players join ───────────────────────────────────────────────────────
    await Promise.all([
      p1Page.goto(`/r/${roomCode}`),
      p2Page.goto(`/r/${roomCode}`),
      p3Page.goto(`/r/${roomCode}`),
    ]);
    await Promise.all([
      expect(p1Page.getByText("Voter 1")).toBeVisible({ timeout: 15_000 }),
      expect(p2Page.getByText("Voter 2")).toBeVisible({ timeout: 15_000 }),
      expect(p3Page.getByText("Voter 3")).toBeVisible({ timeout: 15_000 }),
    ]);

    // ── Players mark ready ─────────────────────────────────────────────────
    await p1Page.getByRole("button", { name: /i['’]m ready/i }).click();
    await p2Page.getByRole("button", { name: /i['’]m ready/i }).click();
    await p3Page.getByRole("button", { name: /i['’]m ready/i }).click();

    // Wait for host to see Start Game enabled (all ready). Reload as fallback.
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

    // ── Host starts game ───────────────────────────────────────────────────
    await hostPage.getByRole("button", { name: /start game/i }).click();

    // All players land on the DiscussionScreen. The role-peek modal
    // auto-opens immediately (E5.5-T7 UX: no separate RevealScreen page).
    // The "Hold & drag to peek" button is inside the modal.
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
      expect(p3Page.getByRole("button", { name: revealButton })).toBeVisible({
        timeout: 20_000,
      }),
    ]);

    // ── Dismiss the auto-opened role-peek modal for all players ───────────
    // The modal backdrop blocks clicks on elements behind it (e.g. the
    // Call to Vote button). Close it before continuing with the vote flow.
    await Promise.all([
      hostPage.getByRole("button", { name: "Close dialog" }).click(),
      p1Page.getByRole("button", { name: "Close dialog" }).click(),
      p2Page.getByRole("button", { name: "Close dialog" }).click(),
      p3Page.getByRole("button", { name: "Close dialog" }).click(),
    ]);

    // ── Verify "Call to Vote" section is visible before voting starts ──────
    // Default vote_state = 'none' → requestHint text is shown.
    await expect(
      p1Page.getByText(/think it's time to vote out the imposter\?/i),
    ).toBeVisible({ timeout: 10_000 });

    // ── P1 calls to vote (1 of 2 threshold) ────────────────────────────────
    // CEIL(4 active players × 0.5 fraction) = 2.
    await p1Page.getByRole("button", { name: /call to vote/i }).click();

    // P1 now sees the request count "1 of 2 votes to start".
    await expect(p1Page.getByText(/1 of 2 votes to start/i)).toBeVisible({
      timeout: 10_000,
    });

    // ── P2 calls to vote → threshold reached → voting becomes active ───────
    // Realtime may not have propagated the state to p2 yet — retry if needed.
    try {
      await expect(
        p2Page.getByRole("button", { name: /call to vote/i }),
      ).toBeVisible({ timeout: 10_000 });
    } catch {
      await p2Page.reload();
      // The peek modal auto-opens again after reload — close it first.
      try {
        await p2Page
          .getByRole("button", { name: "Close dialog" })
          .click({ timeout: 5_000 });
      } catch {
        // Modal wasn't open (seenAt already set) — safe to ignore.
      }
      await expect(
        p2Page.getByRole("button", { name: /call to vote/i }),
      ).toBeVisible({ timeout: 10_000 });
    }
    await p2Page.getByRole("button", { name: /call to vote/i }).click();

    // ── All pages should now show the active voting UI ─────────────────────
    const activeLabel = /voting in progress/i;
    await Promise.all([
      expect(hostPage.getByText(activeLabel)).toBeVisible({ timeout: 15_000 }),
      expect(p1Page.getByText(activeLabel)).toBeVisible({ timeout: 15_000 }),
      expect(p2Page.getByText(activeLabel)).toBeVisible({ timeout: 15_000 }),
      expect(p3Page.getByText(activeLabel)).toBeVisible({ timeout: 15_000 }),
    ]);

    // ── Verify voting grid instructions ────────────────────────────────────
    await expect(
      p1Page.getByText(/tap a player to vote them out\./i),
    ).toBeVisible({
      timeout: 5_000,
    });

    // ── Verify no tally counts are shown (live_vote_tally=false default) ───
    // The tally badge renders "{{count}}" via t("vote.tallyCount"). With
    // live_vote_tally=false the tally array is empty so no badge is rendered.
    // We confirm this by checking that no aria-label "Players" list items
    // show any numeric badge text.
    const p1List = p1Page.locator('[aria-label="Players"]').last();
    await expect(p1List).toBeVisible({ timeout: 5_000 });
    // None of the voting buttons should contain a badge with just a digit.
    const tallyBadges = p1List
      .locator("button span")
      .filter({ hasText: /^\d+$/ });
    await expect(tallyBadges).toHaveCount(0);

    // ── All 4 players cast their votes ─────────────────────────────────────
    // Each player sees all OTHER players in the grid.
    const hostVoteList = hostPage.locator('[aria-label="Players"]').last();
    const p2VoteList = p2Page.locator('[aria-label="Players"]').last();
    const p3VoteList = p3Page.locator('[aria-label="Players"]').last();

    // Host → Voter 1
    await hostVoteList.getByRole("button", { name: "Voter 1" }).click();
    await expect(
      hostVoteList.getByRole("button", { name: /voter 1.*your vote/i }),
    ).toBeVisible({
      timeout: 5_000,
    });

    // Voter 1 → Voter 2
    await p1List.getByRole("button", { name: "Voter 2" }).click();
    await expect(
      p1List.getByRole("button", { name: /voter 2.*your vote/i }),
    ).toBeVisible({
      timeout: 5_000,
    });

    // Voter 2 → Voter 3
    await p2VoteList.getByRole("button", { name: "Voter 1" }).click();
    await expect(
      p2VoteList.getByRole("button", { name: /voter 1.*your vote/i }),
    ).toBeVisible({
      timeout: 5_000,
    });

    // Voter 3 → Voting Host (last vote — auto-resolve fires immediately in
    // Room.tsx, transitioning all pages to ResultScreen via real-time
    // broadcast. Skip the "your vote" badge check for this final cast.)
    await p3VoteList.getByRole("button", { name: "Voting Host" }).click();

    // ── All pages show the result screen ───────────────────────────────────
    // The outcome is one of "Imposters caught!", "Imposters win!", "It's a tie!"
    const outcomeMatcher = /imposters caught!|imposters win!|it.s a tie!/i;
    await Promise.all([
      expect(
        hostPage.getByRole("heading", { name: outcomeMatcher }),
      ).toBeVisible({
        timeout: 20_000,
      }),
      expect(p1Page.getByRole("heading", { name: outcomeMatcher })).toBeVisible(
        {
          timeout: 20_000,
        },
      ),
      expect(p2Page.getByRole("heading", { name: outcomeMatcher })).toBeVisible(
        {
          timeout: 20_000,
        },
      ),
      expect(p3Page.getByRole("heading", { name: outcomeMatcher })).toBeVisible(
        {
          timeout: 20_000,
        },
      ),
    ]);

    // ── Verify result screen sections ──────────────────────────────────────
    // "Voted out" section — present for all outcomes (shows a player name or "Nobody").
    await expect(hostPage.getByText(/voted out/i)).toBeVisible({
      timeout: 5_000,
    });
    // "The secret word was" section.
    await expect(hostPage.getByText(/the secret word was/i)).toBeVisible({
      timeout: 5_000,
    });
    // "The imposters" section.
    await expect(hostPage.getByText(/the imposters/i)).toBeVisible({
      timeout: 5_000,
    });

    // ── Host sees "End Game" button; non-hosts do not ──────────────────────
    await expect(
      hostPage.getByRole("button", { name: /end game/i }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      p1Page.getByRole("button", { name: /end game/i }),
    ).not.toBeVisible();
  });
});
