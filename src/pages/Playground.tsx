import { useState } from "react";
import { Icon } from "@iconify/react";
import { TimerStrip, PlayerList } from "@/components";
import type { PlayerModifiers } from "@/components";
import type { PlayerRow } from "@/features/room";

/**
 * UI Playground — `/dev`
 *
 * Dev-only page (Vite strips it from production builds via the router guard).
 * The TimerStrip lives at the very top as a sticky header so it's always
 * visible while scrolling through component demos below.
 *
 * To add a new component demo: append a <section> inside the scrollable area.
 */

const DEMO_TOTAL_SECONDS = 90;

// ─── Mock players (13 — triggers two-column layout) ───────────────────────────

const MOCK_HOST_ID = "p1";
const MOCK_DEVICE_ID = "p3";

function mkPlayer(
  id: string,
  display_name: string,
  overrides: Partial<PlayerRow> = {},
): PlayerRow {
  return {
    id,
    display_name,
    room_id: "mock-room",
    is_ready: false,
    is_connected: true,
    is_spectator: false,
    joined_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    ...overrides,
  };
}

const MOCK_PLAYERS: PlayerRow[] = [
  mkPlayer("p1", "Alice"),
  mkPlayer("p2", "Bob", { is_ready: true }),
  mkPlayer("p3", "Charlie"), // "you"
  mkPlayer("p4", "Diana", { is_ready: true }),
  mkPlayer("p5", "Ethan", { is_connected: false }),
  mkPlayer("p6", "Fiona", { is_ready: true }),
  mkPlayer("p7", "George"),
  mkPlayer("p8", "Hannah", { is_connected: false }),
  mkPlayer("p9", "Ivan", { is_ready: true }),
  mkPlayer("p10", "Julia"),
  mkPlayer("p11", "Kevin", { is_ready: true }),
  mkPlayer("p12", "Lena", { is_connected: false }),
  mkPlayer("p13", "VeryLongDisplayNamePlayer", { is_ready: true }),
];

const MOCK_CONNECTED = new Set(
  MOCK_PLAYERS.filter((p) => p.is_connected).map((p) => p.id),
);

export default function Playground() {
  const [running, setRunning] = useState(false);
  // PlayerList demo state
  const [kickLoading, setKickLoading] = useState(false);
  const [kickedIds, setKickedIds] = useState<Set<string>>(new Set());
  const [lobbyReady, setLobbyReady] = useState<Set<string>>(
    new Set(MOCK_PLAYERS.filter((p) => p.is_ready).map((p) => p.id)),
  );

  function handleToggle() {
    setRunning((prev) => !prev);
  }

  function handleComplete() {
    setRunning(false);
  }

  function handleKick(playerId: string) {
    setKickLoading(true);
    setTimeout(() => {
      setKickedIds((prev) => new Set([...prev, playerId]));
      setKickLoading(false);
    }, 600);
  }

  const visiblePlayers = MOCK_PLAYERS.filter((p) => !kickedIds.has(p.id));

  // Lobby modifiers: green check for ready, empty slot otherwise
  const lobbyModifiers: Record<string, PlayerModifiers> = Object.fromEntries(
    visiblePlayers.map((p) => [
      p.id,
      {
        mainModifier: lobbyReady.has(p.id) ? (
          <Icon
            icon="lucide:check"
            className="h-3 w-3 text-success"
            aria-hidden="true"
          />
        ) : null,
      },
    ]),
  );

  // Discussion modifiers: skip icon for first 4 players (voted to fast-forward)
  const SKIP_VOTERS = new Set(["p2", "p4", "p6", "p9"]);
  const discussionModifiers: Record<string, PlayerModifiers> =
    Object.fromEntries(
      visiblePlayers.map((p) => [
        p.id,
        {
          firstModifier:
            p.id === "p5" ? <span className="text-fg-muted">2</span> : null,
          mainModifier: SKIP_VOTERS.has(p.id) ? (
            <Icon
              icon="lucide:skip-forward"
              className="h-3 w-3 text-accent"
              aria-label="voted to skip"
            />
          ) : null,
        },
      ]),
    );

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* ── Timer strip — sticky header ──────────────────────────────────── */}
      <div className="sticky top-0 z-10 w-full">
        <TimerStrip
          endsAt={null}
          totalSeconds={DEMO_TOTAL_SECONDS}
          running={running}
          onToggle={handleToggle}
          onComplete={handleComplete}
        />
      </div>

      {/* ── Scrollable demo area ─────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-md flex-1 space-y-10 px-4 py-8">
        <header>
          <h1 className="text-2xl font-bold text-accent">UI Playground</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Dev-only. Tap the bar above to start/pause the timer.
          </p>
        </header>

        {/* ── Section: TimerStrip ──────────────────────────────────────────── */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-fg-subtle">
            TimerStrip
          </h2>

          {/* Display-only variant (no toggle) */}
          <p className="mb-2 text-xs text-fg-muted">
            Display-only (mirrors header state)
          </p>
          <TimerStrip
            endsAt={null}
            totalSeconds={DEMO_TOTAL_SECONDS}
            running={running}
          />

          <p className="mb-2 mt-6 text-xs text-fg-muted">
            Static pre-start (always full bar)
          </p>
          <TimerStrip
            endsAt={null}
            totalSeconds={DEMO_TOTAL_SECONDS}
            running={false}
          />

          <p className="mb-2 mt-6 text-xs text-fg-muted">
            Interactive (with toggle — independent instance)
          </p>
          <TimerStrip
            endsAt={null}
            totalSeconds={DEMO_TOTAL_SECONDS}
            running={running}
            onToggle={handleToggle}
            onComplete={handleComplete}
          />
        </section>

        {/* ── Add more component sections below ───────────────────────────── */}

        {/* ── Section: PlayerList — Lobby ─────────────────────────────────── */}
        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-fg-subtle">
            PlayerList — Lobby (13 players, 2-col)
          </h2>
          <p className="mb-3 text-xs text-fg-muted">
            You are <span className="text-accent">Charlie</span>. Host is Alice.
            Long-press any other player to kick them (600 ms hold). Kicked
            players disappear.
          </p>
          <div className="flex items-center gap-3 mb-3">
            <button
              type="button"
              onClick={() =>
                setLobbyReady((prev) => {
                  const next = new Set(prev);
                  visiblePlayers.forEach((p) => {
                    if (next.has(p.id)) next.delete(p.id);
                    else next.add(p.id);
                  });
                  return next;
                })
              }
              className="rounded-lg bg-bg-raised px-3 py-1.5 text-xs text-fg-muted hover:text-fg transition-colors"
            >
              Toggle all ready
            </button>
            <button
              type="button"
              onClick={() => setKickedIds(new Set())}
              className="rounded-lg bg-bg-raised px-3 py-1.5 text-xs text-fg-muted hover:text-fg transition-colors"
            >
              Reset kicked players
            </button>
          </div>
          <PlayerList
            players={visiblePlayers}
            connectedIds={MOCK_CONNECTED}
            hostPlayerId={MOCK_HOST_ID}
            deviceId={MOCK_DEVICE_ID}
            isHost
            onKick={handleKick}
            kickLoading={kickLoading}
            modifiers={lobbyModifiers}
          />
        </section>

        {/* ── Section: PlayerList — Discussion ────────────────────────────── */}
        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-fg-subtle">
            PlayerList — Discussion phase (skip votes + vote count)
          </h2>
          <p className="mb-3 text-xs text-fg-muted">
            Yellow skip icon = voted to fast-forward to voting. &ldquo;2&rdquo;
            next to Ethan = 2 votes received. No kick affordance (non-host
            view).
          </p>
          <PlayerList
            players={visiblePlayers}
            connectedIds={MOCK_CONNECTED}
            hostPlayerId={MOCK_HOST_ID}
            deviceId={MOCK_DEVICE_ID}
            isHost={false}
            modifiers={discussionModifiers}
          />
        </section>
      </main>
    </div>
  );
}
