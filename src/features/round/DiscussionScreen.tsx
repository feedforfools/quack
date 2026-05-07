import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal, TimerStrip } from "@/components";
import { RoleReveal } from "./RoleReveal";
import type { RoleAssignment } from "./useRoleAssignment";
import type { VoteState } from "./useVoteState";

interface DiscussionScreenProps {
  /** The device's own role assignment — used for the peek-again modal. */
  assignment: RoleAssignment;
  /** Room code shown as a subtle anchor (helps players confirm their room). */
  roomCode?: string;
  /**
   * All players currently in the room (names only — role information is
   * never passed here; the roster never reveals assignments).
   *
   * `is_spectator` players (late joiners who arrived mid-game) are rendered
   * in a separate "joining next game" section so they don't visually mingle
   * with active participants and confuse the people currently playing.
   */
  players: { id: string; display_name: string; is_spectator?: boolean }[];
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
   * Configured timer duration in seconds from room config.
   * Used to render the full-bar pre-start state before the host starts the
   * timer. When 0 (timer disabled) the strip is hidden entirely.
   */
  configTimerSeconds?: number;
  /**
   * Called when the player holds the role lid past the peek threshold for
   * the first time (i.e. their first genuine peek). Triggers markRoleSeen.
   * Only needed when `assignment.seenAt` is null on mount.
   */
  onFirstPeek?: () => void;
  /**
   * Called once when the discussion timer reaches zero (client-side).
   * Room.tsx uses this to set `discussionTimerExpired` and transition
   * everyone to the VotingScreen.
   */
  onTimerComplete?: () => void;
  /**
   * Current voting state — only 'none' and 'requested' states are shown
   * here (and only when no discussion timer is running). 'active' transitions
   * to VotingScreen; 'resolved' to ResultScreen.
   */
  voteState?: VoteState | null;
  /**
   * Minimum number of vote-requests to transition to 'active'.
   * = CEIL(activePlayers.length × config.vote_threshold_fraction)
   */
  voteThreshold?: number;
  /** Called when player taps "Call to vote". */
  onRequestVote?: (params: {
    deviceId: string;
    gameId: string;
  }) => Promise<boolean>;
  requestVoteLoading?: boolean;
}

/**
 * Discussion phase screen (E5.5-T5 refactor, E5.5 UX pass).
 *
 * Shown immediately when the game starts (replaces the old separate
 * RevealScreen). If the player has not yet seen their role (`seenAt = null`),
 * the "peek" modal opens automatically on mount — no separate reveal page.
 *
 * Layout:
 *   1. Game label (context anchor)
 *   2. TimerStrip — primary visual when running; triggers onTimerComplete
 *      which transitions Room.tsx to VotingScreen for everyone.
 *   3. "Start Timer" host control
 *   4. "Peek at role" button → modal with drag-lid RoleReveal card.
 *      Auto-opens when seenAt is null (first peek). Subsequent opens are
 *      the manual "peek again" button.
 *   5. Discussion heading + subtitle
 *   6. Player roster (names only)
 *   7. Room code (subtle anchor)
 *   8. Compact "Call to Vote" row — only visible when no timer is running
 *      (no-timer games); hidden once the discussion timer starts because
 *      timer-expiry transitions everyone to VotingScreen instead.
 *   9. End Game button (host only)
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
  configTimerSeconds = 0,
  onFirstPeek,
  onTimerComplete,
  voteState,
  voteThreshold = 1,
  onRequestVote,
  requestVoteLoading = false,
}: DiscussionScreenProps) {
  const { t } = useTranslation();

  // Auto-open the peek modal on first mount when the player hasn't seen their
  // role yet — replaces the old dedicated RevealScreen page (E5.5 UX pass).
  const [peekOpen, setPeekOpen] = useState(() => assignment.seenAt === null);

  // Per-device tracking so the "Call to Vote" button only turns ghost for the
  // device that pressed it, not for everyone when any one player requests.
  const [hasLocallyRequestedVote, setHasLocallyRequestedVote] = useState(false);

  const timerActive = assignment.endsAt !== null;
  // totalSeconds for the strip: use the actual round duration once running,
  // fall back to the configured value for the full-bar pre-start display.
  const effectiveTimerSeconds = assignment.timerSeconds ?? configTimerSeconds;
  const canStartTimer =
    isHost && !timerActive && allPlayersSeen && onStartTimer;

  const handleRequestVote = useCallback(() => {
    if (!deviceId || !onRequestVote) return;
    setHasLocallyRequestedVote(true);
    void onRequestVote({ deviceId, gameId: assignment.gameId }).then((ok) => {
      if (!ok) setHasLocallyRequestedVote(false); // revert on failure
    });
  }, [onRequestVote, deviceId, assignment.gameId]);

  // Call-to-vote is shown only when no discussion timer is running:
  // timer-expiry games use VotingScreen for the whole voting flow.
  const showCallToVote =
    !timerActive &&
    voteState != null &&
    (voteState.state === "none" || voteState.state === "requested") &&
    deviceId != null &&
    onRequestVote != null;

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Timer strip — sticky header ─────────────────────────────────── */}
      {effectiveTimerSeconds > 0 && (
        <div className="sticky top-0 z-10 w-full">
          <TimerStrip
            endsAt={assignment.endsAt}
            totalSeconds={effectiveTimerSeconds}
            running={timerActive}
            onToggle={
              canStartTimer && !startTimerLoading
                ? () => void onStartTimer!()
                : undefined
            }
            onComplete={onTimerComplete}
          />
          {isHost && !timerActive && !allPlayersSeen && (
            <p className="bg-bg px-4 py-2 text-center text-xs text-fg-muted">
              {t("round.waitingForAllSeen")}
            </p>
          )}
        </div>
      )}

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center px-6 py-10">
        {/* Game label */}
        <p className="text-xs font-semibold uppercase tracking-widest text-fg-subtle">
          {t("round.gameLabel", { index: assignment.roundIndex })}
        </p>

        {/* ── Peek at role — compact button; auto-opens modal on first visit ── */}
        <Button
          variant="ghost"
          size="md"
          onClick={() => setPeekOpen(true)}
          className="mt-6"
        >
          {t("round.peekAgainCta")}
        </Button>

        <Modal
          open={peekOpen}
          onClose={() => setPeekOpen(false)}
          title={t("round.peekAgainModalTitle")}
          description={t("round.dragToReveal")}
        >
          <div className="flex justify-center">
            <RoleReveal
              assignment={assignment}
              initialHasPeeked={assignment.seenAt !== null}
              onFirstPeek={onFirstPeek}
            />
          </div>
        </Modal>

        {/* ── Discussion context ────────────────────────────────────────────── */}
        <h1 className="mt-8 text-center text-2xl font-semibold text-fg">
          {t("round.neutralTitle")}
        </h1>
        <p className="mt-2 text-center text-sm text-fg-muted">
          {t("round.neutralSubtitle")}
        </p>

        {/* Player roster — names only, no role info. Active participants only. */}
        {(() => {
          const activePlayers = players.filter((p) => !p.is_spectator);
          const spectators = players.filter((p) => p.is_spectator);
          return (
            <>
              {activePlayers.length > 0 && (
                <ul
                  className="mt-6 w-full space-y-2"
                  aria-label={t("round.neutralPlayers")}
                >
                  {activePlayers.map((p) => (
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

              {/* Spectators — late joiners shown muted, set apart from the
                active roster so currently-playing players are not confused. */}
              {spectators.length > 0 && (
                <div className="mt-6 w-full">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-fg-subtle">
                    {t("room.spectatorBadge")}
                  </p>
                  <ul
                    className="space-y-2"
                    aria-label={t("room.spectatorBadge")}
                  >
                    {spectators.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center rounded-xl border border-dashed border-fg-subtle/30 bg-bg-raised/50 px-4 py-3 text-fg-muted"
                      >
                        <span className="flex-1 truncate font-medium">
                          {p.display_name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          );
        })()}

        {/* Room code — subtle anchor */}
        {roomCode && (
          <p className="mt-6 font-mono text-xs text-fg-subtle">
            {roomCode.toUpperCase()}
          </p>
        )}

        {/* ── Compact call-to-vote — only for no-timer games ───────────────── */}
        {showCallToVote && (
          <div className="mt-6 flex w-full items-center gap-3 rounded-xl bg-bg-raised px-4 py-3">
            <p className="flex-1 text-sm text-fg-muted">
              {voteState!.state === "requested"
                ? t("vote.requestCount", {
                    count: voteState!.requestCount,
                    threshold: voteThreshold,
                  })
                : t("vote.requestHint")}
            </p>
            <Button
              variant={hasLocallyRequestedVote ? "ghost" : "primary"}
              size="sm"
              onClick={handleRequestVote}
              disabled={requestVoteLoading || hasLocallyRequestedVote}
              className="shrink-0"
            >
              {requestVoteLoading
                ? t("vote.requestLoading")
                : t("vote.callToVoteCta")}
            </Button>
          </div>
        )}

        {/* End Game — host-only action */}
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
    </div>
  );
}
