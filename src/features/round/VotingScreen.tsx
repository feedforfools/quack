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
import { SkipIndicator } from "./PlayerIndicators";
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
}: VotingScreenProps) {
  const { t } = useTranslation();
  const { state, voteEndsAt, myVoteTargetId, tally } = voteState;
  const isPreVote = state === "none" || state === "requested";

  const [showKillConfirm, setShowKillConfirm] = useState(false);

  const tallyMap = new Map<string, number>(
    (tally as VoteTally[]).map((e) => [e.targetPlayerId, e.voteCount]),
  );

  const activePlayers = players.filter((p) => !p.is_spectator);
  const otherPlayers = activePlayers.filter((p) => p.id !== deviceId);

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

  // Pre-vote roster indicators — who has already called to vote.
  const preVoteModifiers: Record<string, PlayerModifiers> = Object.fromEntries(
    activePlayers.map((p) => [
      p.id,
      {
        mainModifier: skipRequestedIds.has(p.id) ? (
          <SkipIndicator label={t("round.skipIndicatorLabel")} />
        ) : null,
      },
    ]),
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
          isPreVote
            ? t("round.timerDone")
            : myVoteTargetId
              ? t("vote.changeVoteHint")
              : t("vote.castVoteHint")
        }
        list={
          isPreVote ? (
            /* Pre-vote lobby — regular roster with call-to-vote indicators. */
            <PlayerList
              players={activePlayers}
              connectedIds={connectedIds}
              hostPlayerId={hostPlayerId}
              deviceId={deviceId}
              modifiers={preVoteModifiers}
            />
          ) : (
            /* Ballot — roster-styled rows, tap to cast/change your vote. */
            <ul
              className="flex flex-col gap-2"
              aria-label={t("vote.playerListLabel")}
            >
              {otherPlayers.map((p) => {
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
                        "flex w-full items-center gap-2.5 rounded-xl px-3 py-3 text-left transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        isMyVote
                          ? "bg-danger/15 ring-1 ring-inset ring-danger"
                          : "bg-bg-raised hover:bg-bg-raised/70 active:opacity-80",
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
                        <span className="text-md truncate font-medium leading-none text-fg">
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
                          <span className="rounded-full bg-fg/8 px-2 py-0.5 text-xs tabular-nums text-fg-muted">
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
          <div className="rounded-xl bg-bg-raised px-3 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger/15">
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
                    <span className="inline-flex items-center gap-1 rounded-full bg-fg/8 px-2 py-0.5 text-[11px] tabular-nums text-fg-muted">
                      <Icon
                        icon="lucide:check"
                        className="h-3 w-3"
                        aria-hidden="true"
                      />
                      {votesCast}/{activePlayers.length}
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

            {isPreVote ? (
              /* Call to vote / take it back — pre-vote lobby. */
              <Button
                variant={hasRequestedVote ? "ghost" : "primary"}
                size="md"
                onClick={handleVoteButton}
                disabled={
                  !onRequestVote ||
                  requestVoteLoading ||
                  retractVoteRequestLoading
                }
                className="flex-1"
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
          isPreVote ? t("vote.requestHint") : t("vote.votingHintBottom")
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
