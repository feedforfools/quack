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

/**
 * Call resolve_vote for the player associated with `page`.
 *
 * Uses the Supabase REST API directly so that we can trigger resolution without
 * having to wait for the 60 s voting timer. This exercises the
 * "all participants have voted" precondition rather than the timer path.
 *
 * Steps:
 *  1. Read device_id from localStorage on `page`.
 *  2. Fetch the game_id from role_assignments (caller's own row via RLS).
 *  3. POST to resolve_vote RPC.
 */
async function triggerResolveVote(
  page: Page,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<void> {
  const deviceId = await page.evaluate(
    () => localStorage.getItem("quack_device_id") ?? "",
  );

  // Step 1: get game ID from role_assignments.
  const raResp = await page.request.get(
    `${supabaseUrl}/rest/v1/role_assignments?select=game_id&limit=1`,
    {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        "x-device-id": deviceId,
        Prefer: "count=none",
      },
    },
  );
  const raRows = (await raResp.json()) as { game_id: string }[];
  const gameId = raRows[0]?.game_id ?? "";

  // Step 2: call resolve_vote.
  await page.request.post(`${supabaseUrl}/rest/v1/rpc/resolve_vote`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "x-device-id": deviceId,
      "Content-Type": "application/json",
    },
    data: { p_game_id: gameId },
  });
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

    const supabaseUrl =
      process.env["VITE_SUPABASE_URL"] ?? "http://127.0.0.1:54321";
    const supabaseAnonKey = process.env["VITE_SUPABASE_ANON_KEY"] ?? "";

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
    await p1Page.getByRole("button", { name: /i'm ready/i }).click();
    await p2Page.getByRole("button", { name: /i'm ready/i }).click();
    await p3Page.getByRole("button", { name: /i'm ready/i }).click();

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

    // All players land on the discussion screen (role reveal lid visible).
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
    const p1List = p1Page.getByRole("list", { name: /players/i });
    await expect(p1List).toBeVisible({ timeout: 5_000 });
    // None of the voting buttons should contain a badge with just a digit.
    const tallyBadges = p1Page.locator(
      '[aria-label="Players"] button span:has-text(/^\\d+$/)',
    );
    await expect(tallyBadges).toHaveCount(0);

    // ── All 4 players cast their votes ─────────────────────────────────────
    // Each player sees all OTHER players in the grid.
    // Host → Voter 1
    await hostPage
      .getByRole("list", { name: /players/i })
      .getByRole("button", { name: "Voter 1" })
      .click();
    await expect(hostPage.getByText(/your vote/i)).toBeVisible({
      timeout: 5_000,
    });

    // Voter 1 → Voter 2
    await p1Page
      .getByRole("list", { name: /players/i })
      .getByRole("button", { name: "Voter 2" })
      .click();
    await expect(p1Page.getByText(/your vote/i)).toBeVisible({
      timeout: 5_000,
    });

    // Voter 2 → Voter 3
    await p2Page
      .getByRole("list", { name: /players/i })
      .getByRole("button", { name: "Voter 3" })
      .click();
    await expect(p2Page.getByText(/your vote/i)).toBeVisible({
      timeout: 5_000,
    });

    // Voter 3 → Voting Host
    await p3Page
      .getByRole("list", { name: /players/i })
      .getByRole("button", { name: "Voting Host" })
      .click();
    await expect(p3Page.getByText(/your vote/i)).toBeVisible({
      timeout: 5_000,
    });

    // ── Trigger resolve_vote via Supabase REST API ─────────────────────────
    // All 4 participants have voted, so the precondition is satisfied.
    // We use the host page's credentials to call resolve_vote.
    await triggerResolveVote(hostPage, supabaseUrl, supabaseAnonKey);

    // ── Reload pages so they fetch the resolved state from the DB ──────────
    // (The external REST call does not trigger the in-app broadcast, so we
    // reload to drive the result-screen render path.)
    await Promise.all([
      hostPage.reload(),
      p1Page.reload(),
      p2Page.reload(),
      p3Page.reload(),
    ]);

    // ── All pages show the result screen ───────────────────────────────────
    // The outcome is one of "Imposters caught!", "Imposters win!", "It's a tie!"
    const outcomeMatcher = /imposters caught!|imposters win!|it's a tie!/i;
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
