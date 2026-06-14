import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@iconify/react";
import {
  Button,
  Modal,
  TimerStrip,
  PlayerList,
  GameScaffold,
} from "@/components";
import type { PlayerModifiers } from "@/components";
import { RoleCardModal } from "./RoleCardModal";
import {
  SkipIndicator,
  SeenIndicator,
  EliminatedIndicator,
} from "./PlayerIndicators";
import type { RoleAssignment } from "./useRoleAssignment";
import type { VoteState } from "./useVoteState";
import type { PlayerRow } from "@/features/room";

interface DiscussionScreenProps {
  /** The device's own role assignment — used for the peek-again modal. */
  assignment: RoleAssignment;
  /**
   * All players currently in the room.
   * `is_spectator` players are rendered in a separate "joining next game"
   * section so they don't visually mingle with active participants.
   */
  players: PlayerRow[];
  /** Set of player IDs currently visible on the Realtime presence channel. */
  connectedIds?: Set<string>;
  /** Player ID of the room host — renders a crown icon. */
  hostPlayerId?: string | null;
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
  /** Host: pause the running discussion timer for everyone. */
  onPauseTimer?: () => Promise<boolean>;
  /** Host: resume the paused discussion timer for everyone. */
  onResumeTimer?: () => Promise<boolean>;
  /** Whether a pause/resume action is in-flight. */
  timerControlLoading?: boolean;
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
  /**
   * Called when a player who already requested a vote taps again to take it
   * back (retract their skip-to-vote). Only meaningful while voting is still
   * pending; the server no-ops once voting is active.
   */
  onRetractVoteRequest?: (params: {
    deviceId: string;
    gameId: string;
  }) => Promise<boolean>;
  retractVoteRequestLoading?: boolean;
  /**
   * IDs of players who have called to vote (skip-to-vote). Renders a blue
   * fast-forward indicator on their roster row. Sourced from the
   * get_vote_requesters RPC; only populated when call-to-vote is enabled.
   */
  skipRequestedIds?: Set<string>;
  /**
   * IDs of players who have peeked at their card at least once. Renders an
   * eye-check indicator so the host can see who is ready before starting.
   */
  seenIds?: Set<string>;
  /** True when the game runs in multi-round (elimination) mode. */
  multiRound?: boolean;
  /** Current 1-based vote round (multi-round mode). */
  roundNumber?: number;
  /** Configured round cap (multi-round mode). */
  maxRounds?: number;
  /** Players voted out in earlier rounds — rendered disabled with a skull. */
  eliminatedIds?: Set<string>;
  /**
   * True when this device's player has been eliminated: the call-to-vote
   * button is hidden and the footer hint switches to spectating copy.
   */
  isEliminated?: boolean;
  /**
   * Host-only, multi-round mode: declare that an imposter guessed the secret
   * word out loud — ends the game with an imposters win after confirmation.
   */
  onDeclareWordGuessed?: () => void;
  declareWordGuessedLoading?: boolean;
  /**
   * Host-only, when call-to-vote is disabled: opens the ballot directly via
   * the start_vote RPC. Without it the discussion would have no exit.
   */
  onStartVote?: () => void;
  startVoteLoading?: boolean;
}

/**
 * Discussion phase screen — in-game redesign.
 *
 * Shown immediately when the game starts. If the player has not yet seen their
 * role (`seenAt = null`), the card-reveal modal opens automatically on mount.
 *
 * Layout (top → bottom):
 *   1. Responsive TimerStrip — sticky header; primary visual when running.
 *   2. Short context hint (above the roster).
 *   3. Player roster — lobby-style list with per-player indicators
 *      (presence dot, host crown, seen-card eye, skip-to-vote ⏩).
 *   4. Short context hint (below the roster).
 *   5. Sticky action bar:
 *        • Host-only "kill game" (red ✕) → confirm modal.
 *        • "Your card" → reopens the card-reveal modal.
 *        • "Skip / Go to vote" (only when call-to-vote is enabled).
 *
 * The card-reveal modal is a self-contained card-shaped panel with a springy
 * lid; it is not the generic Modal chrome.
 */
export function DiscussionScreen({
  assignment,
  players,
  connectedIds = new Set(),
  hostPlayerId = null,
  deviceId,
  isHost = false,
  onEndRound,
  endRoundLoading = false,
  onStartTimer,
  startTimerLoading = false,
  onPauseTimer,
  onResumeTimer,
  timerControlLoading = false,
  allPlayersSeen = false,
  configTimerSeconds = 0,
  onFirstPeek,
  onTimerComplete,
  voteState,
  voteThreshold = 1,
  onRequestVote,
  requestVoteLoading = false,
  onRetractVoteRequest,
  retractVoteRequestLoading = false,
  skipRequestedIds = new Set(),
  seenIds = new Set(),
  multiRound = false,
  roundNumber = 1,
  maxRounds = 1,
  eliminatedIds = new Set(),
  isEliminated = false,
  onDeclareWordGuessed,
  declareWordGuessedLoading = false,
  onStartVote,
  startVoteLoading = false,
}: DiscussionScreenProps) {
  const { t } = useTranslation();

  // Auto-open the card-reveal modal on first mount when the player hasn't seen
  // their role yet. Reopened manually via the "Your card" action afterwards.
  const [cardOpen, setCardOpen] = useState(() => assignment.seenAt === null);
  const [showKillConfirm, setShowKillConfirm] = useState(false);
  const [showWordGuessConfirm, setShowWordGuessConfirm] = useState(false);

  // ── Timer state ────────────────────────────────────────────────────────────
  // running : a server ends_at is set and counting down.
  // paused  : not running, but a frozen remaining was captured by the host.
  // started : either of the above (i.e. not the pre-start "full bar" state).
  const timerRunning = assignment.endsAt !== null;
  const timerPaused = !timerRunning && (assignment.pausedSeconds ?? 0) > 0;
  const timerActive = timerRunning || timerPaused;
  // totalSeconds for the strip: the configured round duration (so the bar
  // always begins completely filled), falling back to the room config value.
  // Round mode never runs a discussion timer — the host paces the rounds.
  const effectiveTimerSeconds = multiRound
    ? 0
    : (assignment.timerSeconds ?? configTimerSeconds);

  // The single host control on the timer strip. Maps the current timer state
  // to the right action: start → pause → resume.
  const hostTimerAction: "start" | "pause" | "resume" | null = !isHost
    ? null
    : timerRunning
      ? onPauseTimer
        ? "pause"
        : null
      : timerPaused
        ? onResumeTimer
          ? "resume"
          : null
        : allPlayersSeen && onStartTimer
          ? "start"
          : null;
  const timerToggleLoading = startTimerLoading || timerControlLoading;

  const handleTimerToggle = useCallback(() => {
    switch (hostTimerAction) {
      case "start":
        void onStartTimer?.();
        break;
      case "pause":
        void onPauseTimer?.();
        break;
      case "resume":
        void onResumeTimer?.();
        break;
    }
  }, [hostTimerAction, onStartTimer, onPauseTimer, onResumeTimer]);

  // ── Skip-to-vote state ─────────────────────────────────────────────────────
  // Source of truth is the server set `skipRequestedIds`, so the pressed state
  // survives a refresh. A short-lived optimistic override gives instant button
  // feedback before the refetch lands; it clears once the server agrees.
  const serverRequestedVote =
    deviceId != null && skipRequestedIds.has(deviceId);
  const [optimisticVote, setOptimisticVote] = useState<boolean | null>(null);
  const hasRequestedVote = optimisticVote ?? serverRequestedVote;
  useEffect(() => {
    if (optimisticVote !== null && optimisticVote === serverRequestedVote) {
      setOptimisticVote(null);
    }
  }, [optimisticVote, serverRequestedVote]);

  const handleVoteButton = useCallback(() => {
    if (!deviceId || !onRequestVote) return;
    if (hasRequestedVote) {
      if (!onRetractVoteRequest) return;
      setOptimisticVote(false);
      void onRetractVoteRequest({ deviceId, gameId: assignment.gameId }).then(
        (ok) => {
          if (!ok) setOptimisticVote(true); // revert on failure
        },
      );
      return;
    }
    setOptimisticVote(true);
    void onRequestVote({ deviceId, gameId: assignment.gameId }).then((ok) => {
      if (!ok) setOptimisticVote(false); // revert on failure
    });
  }, [
    onRequestVote,
    onRetractVoteRequest,
    hasRequestedVote,
    deviceId,
    assignment.gameId,
  ]);

  const activePlayers = players.filter((p) => !p.is_spectator);
  const spectators = players.filter((p) => p.is_spectator);

  // Discussion order (item 4) — who opens the round and which way it rotates.
  // Server-randomised per game so every device shows the same starter.
  const starter = assignment.starterPlayerId
    ? (activePlayers.find((p) => p.id === assignment.starterPlayerId) ?? null)
    : null;
  const starterIsYou =
    starter != null && deviceId != null && starter.id === deviceId;
  const direction = assignment.discussionDirection;

  // Per-player indicator slots — reuses the same PlayerList contract as the
  // lobby. Eliminated players render disabled with a skull; their other
  // indicators are dropped since they no longer participate.
  const modifiers: Record<string, PlayerModifiers> = Object.fromEntries(
    activePlayers.map((p) => {
      const eliminated = eliminatedIds.has(p.id);
      return [
        p.id,
        eliminated
          ? {
              mainModifier: (
                <EliminatedIndicator label={t("roundResult.eliminatedLabel")} />
              ),
              disabled: true,
            }
          : {
              firstModifier: seenIds.has(p.id) ? (
                <SeenIndicator label={t("round.seenIndicatorLabel")} />
              ) : null,
              mainModifier: skipRequestedIds.has(p.id) ? (
                <SkipIndicator label={t("round.skipIndicatorLabel")} />
              ) : null,
            },
      ];
    }),
  );

  // Vote button is shown only when call-to-vote is enabled (onRequestVote set)
  // and this player is still in the game. Label switches: "Skip to vote" while
  // a timer runs, "Go to vote" otherwise.
  const showVoteButton =
    onRequestVote != null && deviceId != null && !isEliminated;
  // Call-to-vote disabled → only the host can open the ballot.
  const showStartVoteButton = onStartVote != null;
  const voteRequested = voteState?.state === "requested";

  // The multi-round host footer carries up to four controls (kill, word
  // guessed, card, vote) — collapse "Your card" to an icon so it fits.
  const crowdedFooter = isHost && multiRound;

  // Below-button hint. Eliminated players get spectating copy; for the host
  // before the timer starts this is explicit start-timer guidance; with
  // call-to-vote off the hint explains who opens the ballot; otherwise a
  // generic discussion nudge.
  const footerHint = isEliminated
    ? t("round.eliminatedHint")
    : timerPaused && isHost
      ? t("round.timerPausedHint")
      : isHost && !timerActive && effectiveTimerSeconds > 0
        ? allPlayersSeen
          ? t("round.startReadyHint")
          : t("round.startWaitHint")
        : showStartVoteButton
          ? t("round.startVoteHint")
          : onRequestVote == null
            ? t("round.hostStartsVoteHint")
            : t("round.discussionHint");

  return (
    <>
      <GameScaffold
        scrollList
        header={
          effectiveTimerSeconds > 0 ? (
            <TimerStrip
              endsAt={assignment.endsAt}
              totalSeconds={effectiveTimerSeconds}
              running={timerRunning}
              pausedSeconds={assignment.pausedSeconds}
              onToggle={
                hostTimerAction && !timerToggleLoading
                  ? handleTimerToggle
                  : undefined
              }
              onComplete={onTimerComplete}
            />
          ) : null
        }
        belowHeader={
          multiRound ? (
            <>
              <span className="font-bold uppercase tracking-wider text-fg">
                {t("round.roundBadge", { round: roundNumber, max: maxRounds })}
              </span>
              {" · "}
              {t("round.gamePhaseHintTop")}
            </>
          ) : (
            t("round.gamePhaseHintTop")
          )
        }
        list={
          <>
            {/* Player roster — lobby-style list with in-game indicators. */}
            {activePlayers.length > 0 && (
              <PlayerList
                players={activePlayers}
                connectedIds={connectedIds}
                hostPlayerId={hostPlayerId}
                deviceId={deviceId}
                modifiers={modifiers}
              />
            )}

            {/* Spectators — late joiners shown muted, set apart from roster. */}
            {spectators.length > 0 && (
              <div className="mt-5 w-full">
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-fg-subtle">
                  {t("room.spectatorBadge")}
                </p>
                <ul className="space-y-2" aria-label={t("room.spectatorBadge")}>
                  {spectators.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center rounded-2xl border border-dashed border-fg-subtle/30 bg-bg-raised/50 px-4 py-3 text-fg-muted"
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
        }
        extra={
          starter ? (
            <div className="rounded-2xl bg-bg-raised px-3 py-3 shadow-sm ring-1 ring-border/60">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15">
                  <Icon
                    icon="mdi:bullhorn-variant-outline"
                    className="h-6 w-6 text-accent"
                    aria-hidden="true"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-fg-subtle">
                    {t("round.starterCardLabel")}
                  </span>
                  <span className="truncate text-sm font-bold leading-none text-fg">
                    {starterIsYou
                      ? t("round.starterYou")
                      : t("round.starterStarts", {
                          name: starter.display_name,
                        })}
                  </span>
                  {direction && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className="inline-flex items-center gap-1 rounded-full bg-fg/10 px-2 py-0.5 text-[11px] text-fg-muted">
                        <Icon
                          icon={
                            direction === "clockwise"
                              ? "lucide:rotate-cw"
                              : "lucide:rotate-ccw"
                          }
                          className="h-3 w-3"
                          aria-hidden="true"
                        />
                        {direction === "clockwise"
                          ? t("round.directionClockwise")
                          : t("round.directionCounterclockwise")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : undefined
        }
        aboveFooter={
          <>
            {t("round.gamePhaseHintBottom")}
            {/* Vote-progress caption — once anyone has called to vote. */}
            {showVoteButton && voteRequested && (
              <span className="mt-0.5 block text-fg-subtle">
                {t("vote.requestCount", {
                  count: voteState!.requestCount,
                  threshold: voteThreshold,
                })}
              </span>
            )}
          </>
        }
        footer={
          <div
            className={`flex items-center ${crowdedFooter ? "gap-2" : "gap-3"}`}
          >
            {/* Host: kill game — square, red (matches lobby's exit button). */}
            {isHost && onEndRound && (
              <Button
                variant="danger"
                size="md"
                aria-label={t("round.killGameCta")}
                disabled={endRoundLoading}
                onClick={() => setShowKillConfirm(true)}
                style={{ aspectRatio: "1 / 1", padding: 0, minWidth: "44px" }}
              >
                <Icon icon="lucide:x" className="h-5 w-5" aria-hidden="true" />
              </Button>
            )}

            {/* Host, multi-round: an imposter guessed the word → end game. */}
            {multiRound && isHost && onDeclareWordGuessed && (
              <Button
                variant="ghost"
                size="md"
                aria-label={t("round.wordGuessedCta")}
                disabled={declareWordGuessedLoading}
                onClick={() => setShowWordGuessConfirm(true)}
                style={{ aspectRatio: "1 / 1", padding: 0, minWidth: "44px" }}
              >
                <Icon
                  icon="mdi:target"
                  className="h-5 w-5 text-danger"
                  aria-hidden="true"
                />
              </Button>
            )}

            {/* Open the card-reveal modal — collapses to an icon when the
                host footer already carries several controls. */}
            {crowdedFooter ? (
              <Button
                variant="ghost"
                size="md"
                aria-label={t("round.openCardCta")}
                onClick={() => setCardOpen(true)}
                style={{ aspectRatio: "1 / 1", padding: 0, minWidth: "44px" }}
              >
                <Icon
                  icon="mdi:cards-playing-outline"
                  className="h-5 w-5 text-accent"
                  aria-hidden="true"
                />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="md"
                onClick={() => setCardOpen(true)}
                className="min-w-0 flex-1"
              >
                <Icon
                  icon="mdi:cards-playing-outline"
                  className="h-5 w-5 shrink-0 text-accent"
                  aria-hidden="true"
                />
                {t("round.openCardCta")}
              </Button>
            )}

            {/* Skip / Go to vote — only when call-to-vote is enabled.
                Tapping again retracts a pending request (item 3). */}
            {showVoteButton && (
              <Button
                variant={hasRequestedVote ? "ghost" : "primary"}
                size="md"
                onClick={handleVoteButton}
                disabled={requestVoteLoading || retractVoteRequestLoading}
                className="min-w-0 flex-1"
              >
                {requestVoteLoading || retractVoteRequestLoading
                  ? t("vote.requestLoading")
                  : hasRequestedVote
                    ? t("round.retractVoteCta")
                    : timerActive
                      ? t("round.skipToVoteCta")
                      : t("round.goToVoteCta")}
              </Button>
            )}

            {/* Call-to-vote disabled → the host opens the ballot directly. */}
            {showStartVoteButton && (
              <Button
                variant="primary"
                size="md"
                onClick={onStartVote}
                disabled={startVoteLoading}
                loading={startVoteLoading}
                className="min-w-0 flex-1"
              >
                {t("round.startVoteCta")}
              </Button>
            )}
          </div>
        }
        belowFooter={footerHint}
      />

      {/* ── Card-reveal modal ───────────────────────────────────────────── */}
      <RoleCardModal
        open={cardOpen}
        onClose={() => setCardOpen(false)}
        assignment={assignment}
        initialHasPeeked={assignment.seenAt !== null}
        onFirstPeek={onFirstPeek}
      />

      {/* ── Host kill-game confirmation ─────────────────────────────────── */}
      {isHost && onEndRound && (
        <Modal
          open={showKillConfirm}
          onClose={() => setShowKillConfirm(false)}
          title={t("round.killGameConfirmTitle")}
          description={t("round.killGameConfirmBody")}
        >
          <div className="mt-2 flex gap-3">
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setShowKillConfirm(false)}
              className="flex-1"
            >
              {t("round.cancelCta")}
            </Button>
            <Button
              variant="danger"
              size="lg"
              onClick={onEndRound}
              disabled={endRoundLoading}
              className="flex-1"
            >
              {endRoundLoading ? "…" : t("round.killGameConfirmCta")}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Host word-guessed confirmation (multi-round mode) ───────────── */}
      {multiRound && isHost && onDeclareWordGuessed && (
        <Modal
          open={showWordGuessConfirm}
          onClose={() => setShowWordGuessConfirm(false)}
          title={t("round.wordGuessedConfirmTitle")}
          description={t("round.wordGuessedConfirmBody")}
        >
          <div className="mt-2 flex gap-3">
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setShowWordGuessConfirm(false)}
              className="flex-1"
            >
              {t("round.cancelCta")}
            </Button>
            <Button
              variant="danger"
              size="lg"
              onClick={() => {
                setShowWordGuessConfirm(false);
                onDeclareWordGuessed();
              }}
              disabled={declareWordGuessedLoading}
              className="flex-1"
            >
              {declareWordGuessedLoading
                ? "…"
                : t("round.wordGuessedConfirmCta")}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
