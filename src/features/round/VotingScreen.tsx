import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, TimerStrip } from "@/components";
import type { RoleAssignment } from "./useRoleAssignment";
import type { VoteState, VoteTally } from "./useVoteState";

interface VotingScreenProps {
  /** For game label context anchor. */
  assignment: RoleAssignment;
  /**
   * All players currently in the room.
   * `is_spectator` players are excluded from the voteable list.
   */
  players: { id: string; display_name: string; is_spectator?: boolean }[];
  /** This device's player ID. */
  deviceId: string | null;
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
   * Called once when the voting CountdownDial reaches zero.
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
 * Voting phase screen (E5.5-T5, updated in E5.5 UX pass).
 *
 * Handles three vote states:
 *  • none / requested — pre-vote lobby shown after discussion timer expires.
 *    Players call to vote; button colour is per-device (not global).
 *  • active — live voting with TimerStrip + player grid.
 *
 * Role peeking is intentionally absent — focus is entirely on voting.
 */
export function VotingScreen({
  assignment,
  players,
  deviceId,
  voteState,
  onRequestVote,
  requestVoteLoading = false,
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

  // Per-device tracking so the "Call to Vote" button only goes ghost for the
  // player who pressed it, not for everyone as soon as one person calls.
  const [hasLocallyRequestedVote, setHasLocallyRequestedVote] = useState(false);

  const tallyMap = new Map<string, number>(
    (tally as VoteTally[]).map((e) => [e.targetPlayerId, e.voteCount]),
  );

  const activePlayers = players.filter((p) => !p.is_spectator);
  const otherPlayers = activePlayers.filter((p) => p.id !== deviceId);

  const handleRequestVote = useCallback(() => {
    if (!deviceId || !onRequestVote) return;
    setHasLocallyRequestedVote(true);
    void onRequestVote({ deviceId, gameId: assignment.gameId }).then((ok) => {
      if (!ok) setHasLocallyRequestedVote(false);
    });
  }, [onRequestVote, deviceId, assignment.gameId]);

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

  const isPreVote = state === "none" || state === "requested";

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Timer strip — sticky header (active voting only) ─────────────── */}
      {state === "active" && voteEndsAt && (
        <div className="sticky top-0 z-10 w-full">
          <TimerStrip
            endsAt={voteEndsAt}
            totalSeconds={votingTotalSeconds}
            running={true}
            onComplete={onVoteTimerComplete}
          />
        </div>
      )}

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center px-6 py-10">
        {/* Game label */}
        <p className="text-xs font-semibold uppercase tracking-widest text-fg-subtle">
          {t("round.gameLabel", { index: assignment.roundIndex })}
        </p>

        {/* ── Pre-vote lobby (none / requested) ───────────────────────────── */}
        {isPreVote && (
          <>
            <h1 className="mt-8 text-center text-2xl font-semibold text-fg">
              {t("vote.sectionLabel")}
            </h1>
            <p className="mt-2 text-center text-sm text-fg-muted">
              {state === "requested"
                ? t("vote.requestCount", {
                    count: voteState.requestCount,
                    threshold: voteThreshold,
                  })
                : t("vote.requestHint")}
            </p>
            <Button
              variant={hasLocallyRequestedVote ? "ghost" : "primary"}
              size="lg"
              onClick={handleRequestVote}
              disabled={requestVoteLoading || hasLocallyRequestedVote}
              className="mt-6 w-full max-w-xs"
            >
              {requestVoteLoading
                ? t("vote.requestLoading")
                : t("vote.callToVoteCta")}
            </Button>
          </>
        )}

        {/* ── Active voting ────────────────────────────────────────────────── */}
        {state === "active" && (
          <>
            {/* Vote instruction */}
            <p className="mt-6 text-center text-sm font-medium text-fg">
              {myVoteTargetId
                ? t("vote.changeVoteHint")
                : t("vote.castVoteHint")}
            </p>

            {/* Player grid — tap to cast/change vote */}
            <ul
              className="mt-3 w-full space-y-2"
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
                        "flex w-full items-center rounded-xl px-4 py-3 text-left transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        isMyVote
                          ? "bg-danger/20 ring-1 ring-danger text-fg"
                          : "bg-bg-raised text-fg hover:bg-bg-raised/70",
                      ].join(" ")}
                    >
                      <span className="flex-1 truncate font-medium">
                        {p.display_name}
                      </span>
                      {isMyVote && (
                        <span className="mr-2 rounded-full bg-danger/30 px-2 py-0.5 text-xs font-semibold text-danger">
                          {t("vote.yourVote")}
                        </span>
                      )}
                      {count !== undefined && (
                        <span className="ml-2 rounded-full bg-bg/40 px-2 py-0.5 text-xs text-fg-muted">
                          {t("vote.tallyCount", { count })}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Retract vote — shown only when the player has cast a vote */}
            {myVoteTargetId && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRetractVote}
                  disabled={retractVoteLoading}
                >
                  {retractVoteLoading
                    ? t("vote.retractLoading")
                    : t("vote.retractCta")}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
