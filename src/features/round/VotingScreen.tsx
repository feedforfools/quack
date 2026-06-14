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
import { SkipIndicator, EliminatedIndicator } from "./PlayerIndicators";
import type { RoleAssignment } from "./useRoleAssignment";
import type { VoteState, VoteTally } from "./useVoteState";
import type { PlayerRow } from "@/features/room";

interface VotingScreenProps {
  /** For game/vote context anchor (gameId for the vote RPCs). */
  assignment: RoleAssignment;
  /**
   * All players currently in the room.
   * `is_spectator` players are excluded from the voteable list.
   */
  players: PlayerRow[];
  /** Set of player IDs currently visible on the Realtime presence channel. */
  connectedIds?: Set<string>;
  /** Player ID of the room host — renders a crown icon. */
  hostPlayerId?: string | null;
  /** This device's player ID. */
  deviceId: string | null;
  /** Whether the current player is the host. Shows the kill-game button. */
  isHost?: boolean;
  /** Called when the host confirms killing the game (back to lobby). */
  onEndRound?: () => void;
  /** Whether the end-round action is in-flight. */
  endRoundLoading?: boolean;
  /**
   * Current vote state — may be 'none' or 'requested' when the discussion
   * timer has just expired (pre-vote lobby), or 'active' during live voting.
   */
  voteState: VoteState;
  /**
   * Called when this player taps "Call to Vote".
   * Present for all states so the pre-vote lobby works here too.
   */
  onRequestVote?: (params: {
    deviceId: string;
    gameId: string;
  }) => Promise<boolean>;
  requestVoteLoading?: boolean;
  /**
   * Called when a player who already requested a vote taps again to take it
   * back. Only meaningful in the pre-vote lobby; the server no-ops once
   * voting is active.
   */
  onRetractVoteRequest?: (params: {
    deviceId: string;
    gameId: string;
  }) => Promise<boolean>;
  retractVoteRequestLoading?: boolean;
  /**
   * IDs of players who have called to vote — renders the same blue
   * fast-forward indicator the Discussion roster uses.
   */
  skipRequestedIds?: Set<string>;
  /**
   * Minimum number of vote-requests to transition to 'active'.
   * = CEIL(activePlayers.length × config.vote_threshold_fraction)
   */
  voteThreshold?: number;
  /** Called when this player taps a player row to cast/change their vote. */
  onCastVote: (params: {
    deviceId: string;
    gameId: string;
    targetPlayerId: string;
  }) => Promise<boolean>;
  castVoteLoading: boolean;
  /** Called when this player taps "Retract vote". */
  onRetractVote: (params: {
    deviceId: string;
    gameId: string;
  }) => Promise<boolean>;
  retractVoteLoading: boolean;
  /**
   * Called once when the voting TimerStrip reaches zero.
   * Triggers `resolve_vote` in Room.tsx (E5-T9).
   */
  onVoteTimerComplete?: () => void;
  /**
   * Total duration of the voting countdown in seconds — from config.
   * Used to compute the initial strip fill (avoids the "already depleted"
   * bug that the old runtime approximation caused).
   */
  votingTotalSeconds: number;
  /**
   * Players voted out in earlier rounds (multi-round mode). They are excluded
   * from the ballot and rendered disabled in the pre-vote roster.
   */
  eliminatedIds?: Set<string>;
  /**
   * True when this device's player has been eliminated: they watch the vote
   * without casting one.
   */
  isEliminated?: boolean;
  /**
   * Host-only, when call-to-vote is disabled: opens the ballot directly from
   * the pre-vote lobby (after a discussion timer expires, vote_state is still
   * 'none' — without this the room would wait forever).
   */
  onStartVote?: () => void;
  startVoteLoading?: boolean;
}

/**
 * Voting phase screen — in-game redesign (E5.5).
 *
 * Shares the same vertical anatomy as the lobby and Discussion screens via
 * `GameScaffold`, so the whole game flow reads as one app:
 *
 *   1. TimerStrip — sticky header, counts down the voting window (active only).
 *   2. Short context hint above the ballot.
 *   3. Ballot — roster-styled rows; tap to cast or change your vote.
 *      Pre-vote lobby renders the regular PlayerList with call-to-vote
 *      indicators instead.
 *   4. Status card — "Voting in progress" / request-count progress.
 *   5. Sticky action bar:
 *        • Host-only kill game (red ✕) → confirm modal.
 *        • "Retract vote" (active) or "Call to Vote" (pre-vote).
 *
 * Role peeking is intentionally absent — focus is entirely on voting.
 */
export function VotingScreen({
  assignment,
  players,
  connectedIds = new Set(),
  hostPlayerId = null,
  deviceId,
  isHost = false,
  onEndRound,
  endRoundLoading = false,
  voteState,
  onRequestVote,
  requestVoteLoading = false,
  onRetractVoteRequest,
  retractVoteRequestLoading = false,
  skipRequestedIds = new Set(),
  voteThreshold = 1,
  onCastVote,
  castVoteLoading,
  onRetractVote,
  retractVoteLoading,
  onVoteTimerComplete,
  votingTotalSeconds,
  eliminatedIds = new Set(),
  isEliminated = false,
  onStartVote,
  startVoteLoading = false,
}: VotingScreenProps) {
  const { t } = useTranslation();
  const { state, voteEndsAt, myVoteTargetId, tally } = voteState;
  const isPreVote = state === "none" || state === "requested";

  const [showKillConfirm, setShowKillConfirm] = useState(false);

  const tallyMap = new Map<string, number>(
    (tally as VoteTally[]).map((e) => [e.targetPlayerId, e.voteCount]),
  );

  const activePlayers = players.filter((p) => !p.is_spectator);
  // Only alive players appear on the ballot and count towards the vote.
  const alivePlayers = activePlayers.filter((p) => !eliminatedIds.has(p.id));
  const ballotPlayers = alivePlayers.filter((p) => p.id !== deviceId);

  // ── Pre-vote call-to-vote state ────────────────────────────────────────────
  // Mirrors DiscussionScreen: server set `skipRequestedIds` is the source of
  // truth (survives refresh); a short-lived optimistic override gives instant
  // button feedback and clears once the server agrees.
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

  const handleCastVote = useCallback(
    (targetPlayerId: string) => {
      if (!deviceId) return;
      void onCastVote({ deviceId, gameId: assignment.gameId, targetPlayerId });
    },
    [onCastVote, deviceId, assignment.gameId],
  );

  const handleRetractVote = useCallback(() => {
    if (!deviceId) return;
    void onRetractVote({ deviceId, gameId: assignment.gameId });
  }, [onRetractVote, deviceId, assignment.gameId]);

  // Pre-vote roster indicators — who has already called to vote; eliminated
  // players render disabled with a skull.
  const preVoteModifiers: Record<string, PlayerModifiers> = Object.fromEntries(
    activePlayers.map((p) => [
      p.id,
      eliminatedIds.has(p.id)
        ? {
            mainModifier: (
              <EliminatedIndicator label={t("roundResult.eliminatedLabel")} />
            ),
            disabled: true,
          }
        : {
            mainModifier: skipRequestedIds.has(p.id) ? (
              <SkipIndicator label={t("round.skipIndicatorLabel")} />
            ) : null,
          },
    ]),
  );

  // Roster for an eliminated player watching an active vote: live tally chips
  // (when visible) on alive players, disabled rows for the fallen.
  const watchingModifiers: Record<string, PlayerModifiers> = Object.fromEntries(
    activePlayers.map((p) => {
      if (eliminatedIds.has(p.id)) {
        return [
          p.id,
          {
            mainModifier: (
              <EliminatedIndicator label={t("roundResult.eliminatedLabel")} />
            ),
            disabled: true,
          },
        ];
      }
      const count = tallyMap.get(p.id);
      return [
        p.id,
        {
          mainModifier:
            count !== undefined && count > 0 ? (
              <span className="rounded-full bg-fg/10 px-2 py-0.5 text-xs tabular-nums text-fg-muted">
                {t("vote.tallyCount", { count })}
              </span>
            ) : null,
        },
      ];
    }),
  );

  // Votes cast so far — only known when the live tally is on.
  const votesCast = (tally as VoteTally[]).reduce(
    (sum, e) => sum + e.voteCount,
    0,
  );

  return (
    <>
      <GameScaffold
        scrollList
        header={
          state === "active" && voteEndsAt ? (
            <TimerStrip
              endsAt={voteEndsAt}
              totalSeconds={votingTotalSeconds}
              running={true}
              onComplete={onVoteTimerComplete}
            />
          ) : null
        }
        belowHeader={
          isEliminated
            ? t("vote.eliminatedHint")
            : isPreVote
              ? t("round.timerDone")
              : myVoteTargetId
                ? t("vote.changeVoteHint")
                : t("vote.castVoteHint")
        }
        list={
          isPreVote || isEliminated ? (
            /* Pre-vote lobby, or an eliminated player watching the vote —
               regular roster with the phase indicators, never a ballot. */
            <PlayerList
              players={activePlayers}
              connectedIds={connectedIds}
              hostPlayerId={hostPlayerId}
              deviceId={deviceId}
              modifiers={isPreVote ? preVoteModifiers : watchingModifiers}
            />
          ) : (
            /* Ballot — roster-styled rows, tap to cast/change your vote. */
            <ul
              className="flex flex-col gap-2"
              aria-label={t("vote.playerListLabel")}
            >
              {ballotPlayers.map((p) => {
                const isMyVote = myVoteTargetId === p.id;
                const count = tallyMap.get(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handleCastVote(p.id)}
                      disabled={castVoteLoading}
                      aria-pressed={isMyVote}
                      className={[
                        "flex w-full items-center gap-2.5 rounded-2xl px-3 py-3 text-left shadow-sm",
                        "transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.98]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        isMyVote
                          ? "bg-danger/15 ring-2 ring-inset ring-danger/70"
                          : "bg-bg-raised ring-1 ring-inset ring-border/50 hover:bg-bg-raised/70",
                      ].join(" ")}
                    >
                      {/* Presence dot — same idiom as the roster rows. */}
                      <span
                        aria-hidden="true"
                        className={[
                          "h-2 w-2 shrink-0 rounded-full",
                          connectedIds.has(p.id)
                            ? "bg-success"
                            : "bg-fg-subtle",
                        ].join(" ")}
                      />

                      {/* Name + host crown */}
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="text-base truncate font-medium leading-none text-fg">
                          {p.display_name}
                        </span>
                        {p.id === hostPlayerId && (
                          <Icon
                            icon="mdi:crown"
                            className="h-3.5 w-3.5 shrink-0 text-accent"
                            aria-hidden="true"
                          />
                        )}
                      </span>

                      {/* Right-side indicators */}
                      <span className="flex shrink-0 items-center gap-1.5">
                        {isMyVote && (
                          <span className="rounded-full bg-danger/20 px-2 py-0.5 text-xs font-semibold text-danger">
                            {t("vote.yourVote")}
                          </span>
                        )}
                        {count !== undefined && (
                          <span className="rounded-full bg-fg/10 px-2 py-0.5 text-xs tabular-nums text-fg-muted">
                            {t("vote.tallyCount", { count })}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        }
        extra={
          /* Vote status card — same card idiom as the lobby's game card. */
          <div className="rounded-2xl bg-bg-raised px-3 py-3 shadow-sm ring-1 ring-border/60">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/15">
                <Icon
                  icon="mdi:vote"
                  className="h-6 w-6 text-danger"
                  aria-hidden="true"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-fg-subtle">
                  {t("vote.sectionLabel")}
                </span>
                <span className="truncate text-sm font-bold leading-none text-fg">
                  {isPreVote
                    ? t("vote.requestCount", {
                        count: voteState.requestCount,
                        threshold: voteThreshold,
                      })
                    : t("vote.activeLabel")}
                </span>
                {/* Votes-cast chip — only when the live tally is visible. */}
                {!isPreVote && votesCast > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-fg/10 px-2 py-0.5 text-[11px] tabular-nums text-fg-muted">
                      <Icon
                        icon="lucide:check"
                        className="h-3 w-3"
                        aria-hidden="true"
                      />
                      {votesCast}/{alivePlayers.length}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        }
        footer={
          <div className="flex items-center gap-3">
            {/* Host: kill game — square, red (matches Discussion screen). */}
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

            {isEliminated ? (
              /* Eliminated players watch — no vote actions. */
              <p className="flex min-h-[44px] flex-1 items-center justify-center text-center text-sm text-fg-muted">
                {t("vote.eliminatedFooter")}
              </p>
            ) : isPreVote && onStartVote ? (
              /* Call-to-vote disabled → the host opens the ballot. */
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
            ) : isPreVote && !onRequestVote ? (
              /* Call-to-vote disabled, not the host — wait for the host. */
              <p className="flex min-h-[44px] flex-1 items-center justify-center text-center text-sm text-fg-muted">
                {t("vote.waitingForHostStart")}
              </p>
            ) : isPreVote ? (
              /* Call to vote / take it back — pre-vote lobby. */
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
                    : t("vote.callToVoteCta")}
              </Button>
            ) : (
              /* Retract vote — enabled once a vote has been cast. */
              <Button
                variant="ghost"
                size="md"
                onClick={handleRetractVote}
                disabled={!myVoteTargetId || retractVoteLoading}
                className="flex-1"
              >
                {retractVoteLoading
                  ? t("vote.retractLoading")
                  : t("vote.retractCta")}
              </Button>
            )}
          </div>
        }
        belowFooter={
          isEliminated
            ? undefined
            : isPreVote
              ? onStartVote
                ? t("round.startVoteHint")
                : onRequestVote
                  ? t("vote.requestHint")
                  : undefined
              : t("vote.votingHintBottom")
        }
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
    </>
  );
}
