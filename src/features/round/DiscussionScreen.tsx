import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components";
import { CountdownDial } from "@/components";
import { RoleReveal } from "./RoleReveal";
import type { RoleAssignment } from "./useRoleAssignment";

interface DiscussionScreenProps {
  /** The device's own role assignment — powers the drag-lid card. */
  assignment: RoleAssignment;
  /** Room code shown as a subtle anchor (helps players confirm their room). */
  roomCode?: string;
  /**
   * All players currently in the room (names only — role information is
   * never passed here; the roster never reveals assignments).
   */
  players: { id: string; display_name: string }[];
  /** The calling device's UUID — used to render the "You" badge. */
  deviceId: string | null;
  /** Whether the current player is the host. Shows End Round + Start Timer. */
  isHost?: boolean;
  /** Called when the host taps End Round. */
  onEndRound?: () => void;
  /** Whether the end-round action is in-flight. */
  endRoundLoading?: boolean;
  /** Called when the host taps Start Timer — returns success boolean. */
  onStartTimer?: () => Promise<boolean>;
  /** Whether the start-timer action is in-flight. */
  startTimerLoading?: boolean;
  /** Whether all players have seen their role (enables Start Timer). */
  allPlayersSeen?: boolean;
  /**
   * Called exactly once the first time the player holds the lid past the
   * peek threshold. Wired to `mark_role_seen` in E3-T11.
   */
  onFirstPeek?: () => void;
}

/**
 * Merged discussion + reveal screen (E3-T6).
 *
 * Replaces the two-step "flip card → dismiss → neutral screen" flow.
 * The drag-lid card is always present so players can re-peek at any point
 * during the discussion; outside of an active peek the screen is glance-safe
 * (the lid covers the role).
 *
 * Layout (top-to-bottom):
 *  1. Round label (context anchor)
 *  2. Drag-lid card (via RoleReveal sub-component)
 *  3. "Discussion" heading + subtitle
 *  4. Player roster (names only)
 *  5. Room code (subtle)
 *  6. End Round button (host only)
 *
 * E3-T7 will insert the countdown timer as the primary visual between the
 * round label and the drag-lid card.
 */
export function DiscussionScreen({
  assignment,
  roomCode,
  players,
  deviceId,
  isHost = false,
  onEndRound,
  endRoundLoading = false,
  onStartTimer,
  startTimerLoading = false,
  allPlayersSeen = false,
  onFirstPeek,
}: DiscussionScreenProps) {
  const { t } = useTranslation();
  const [_isPeeking, setIsPeeking] = useState(false);

  const handlePeekChange = useCallback((v: boolean) => {
    setIsPeeking(v);
  }, []);

  const timerActive = assignment.endsAt !== null;
  const canStartTimer = isHost && !timerActive && allPlayersSeen && onStartTimer;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center px-6 py-10">
      {/* Round label */}
      <p className="text-xs font-semibold uppercase tracking-widest text-fg-subtle">
        {t("round.gameLabel", { index: assignment.roundIndex + 1 })}
      </p>

      {/* ── Countdown timer — primary visual when running ────────────────── */}
      {timerActive && assignment.timerSeconds !== null && (
        <div className="mt-6">
          <CountdownDial
            endsAt={assignment.endsAt!}
            totalSeconds={assignment.timerSeconds}
            size={200}
          />
        </div>
      )}

      {/* ── Start Timer — host control (visible until timer is running) ───── */}
      {isHost && !timerActive && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <Button
            variant="primary"
            size="lg"
            onClick={onStartTimer ? () => void onStartTimer() : undefined}
            disabled={!canStartTimer || startTimerLoading}
            className="w-full max-w-xs"
          >
            {startTimerLoading
              ? t("round.startTimerLoading")
              : t("round.startTimerCta")}
          </Button>
          {!allPlayersSeen && (
            <p className="text-center text-xs text-fg-muted">
              {t("round.waitingForAllSeen")}
            </p>
          )}
        </div>
      )}

      {/* ── Drag-lid card — always visible, glance-safe ──────────────────── */}
      <div className="mt-6 flex flex-col items-center">
        <RoleReveal
          assignment={assignment}
          onFirstPeek={onFirstPeek}
          onPeekChange={handlePeekChange}
        />
      </div>

      {/* ── Discussion context ────────────────────────────────────────────── */}
      <h1 className="mt-8 text-center text-2xl font-semibold text-fg">
        {t("round.neutralTitle")}
      </h1>
      <p className="mt-2 text-center text-sm text-fg-muted">
        {t("round.neutralSubtitle")}
      </p>

      {/* Player roster — names only, no role info */}
      {players.length > 0 && (
        <ul
          className="mt-6 w-full space-y-2"
          aria-label={t("round.neutralPlayers")}
        >
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center rounded-xl bg-bg-raised px-4 py-3"
            >
              <span className="flex-1 truncate font-medium text-fg">
                {p.display_name}
              </span>
              {p.id === deviceId && (
                <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
                  {t("room.you")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Room code — subtle anchor */}
      {roomCode && (
        <p className="mt-6 font-mono text-xs text-fg-subtle">
          {roomCode.toUpperCase()}
        </p>
      )}

      {/* End Round — host-only action */}
      {isHost && onEndRound && (
        <Button
          variant="danger"
          size="lg"
          onClick={onEndRound}
          disabled={endRoundLoading}
          className="mt-8 w-full max-w-xs"
        >
          {endRoundLoading ? "…" : t("round.endGameCta")}
        </Button>
      )}
    </main>
  );
}
