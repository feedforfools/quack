import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components";
import { CountdownDial } from "@/components";
import type { VoteState, VoteTally } from "./useVoteState";

interface VotingPanelProps {
  /** Current game ID. */
  gameId: string;
  /** This device's player ID. */
  deviceId: string;
  /** All active (non-spectator) players in the game. */
  players: { id: string; display_name: string }[];
  /** Current voting state from useVoteState. */
  voteState: VoteState;
  /**
   * Minimum number of vote-requests needed to transition to 'active'.
   * Derived from CEIL(playerCount × vote_threshold_fraction) on the client;
   * displayed as "{requestCount} / {threshold}" next to the CTA.
   */
  voteThreshold: number;
  /** Called when this player taps "Call to vote". */
  onRequestVote: (params: {
    deviceId: string;
    gameId: string;
  }) => Promise<boolean>;
  requestVoteLoading: boolean;
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
   * Wired to `resolve_vote` in Room.tsx (E5-T9).
   */
  onVoteTimerComplete?: () => void;
}

/**
 * Voting panel — rendered inside DiscussionScreen when vote_state ≠ 'resolved'.
 *
 * States:
 *  none / requested — shows "Call to vote" CTA with live request count.
 *  active           — voting timer (primary visual) + grid of other players.
 *  resolved         — nothing rendered (caller handles resolution UI in E5-T9).
 *
 * Privacy:
 *  Civilians never see who voted for whom. The `tally` array only contains
 *  counts (not voter IDs), populated only when live_vote_tally=true.
 *  Imposters can see co-imposter votes (RLS-controlled in the votes table).
 */
export function VotingPanel({
  gameId,
  deviceId,
  players,
  voteState,
  voteThreshold,
  onRequestVote,
  requestVoteLoading,
  onCastVote,
  castVoteLoading,
  onRetractVote,
  retractVoteLoading,
  onVoteTimerComplete,
}: VotingPanelProps) {
  const { t } = useTranslation();

  const { state, requestCount, voteEndsAt, myVoteTargetId, tally } = voteState;

  // Map tally entries by targetPlayerId for O(1) lookup.
  const tallyMap = new Map<string, number>(
    tally.map((e: VoteTally) => [e.targetPlayerId, e.voteCount]),
  );

  const handleRequestVote = useCallback(() => {
    void onRequestVote({ deviceId, gameId });
  }, [onRequestVote, deviceId, gameId]);

  const handleCastVote = useCallback(
    (targetPlayerId: string) => {
      void onCastVote({ deviceId, gameId, targetPlayerId });
    },
    [onCastVote, deviceId, gameId],
  );

  const handleRetractVote = useCallback(() => {
    void onRetractVote({ deviceId, gameId });
  }, [onRetractVote, deviceId, gameId]);

  // ── Call-to-vote state (none | requested) ──────────────────────────────
  if (state === "none" || state === "requested") {
    // Whether this device has already requested a vote (idempotent server-side,
    // but we use voteThreshold <= requestCount as proxy — exact match not
    // possible from client without querying vote_requests. Disable only after
    // state is 'active'; still allow re-tap for idempotency).
    const alreadyRequested = state === "requested";
    return (
      <div className="mt-8 w-full rounded-2xl border border-fg-subtle/20 bg-bg-raised p-4">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-fg-subtle">
          {t("vote.sectionLabel")}
        </p>
        <p className="mt-1 text-center text-sm text-fg-muted">
          {alreadyRequested
            ? t("vote.requestCount", {
                count: requestCount,
                threshold: voteThreshold,
              })
            : t("vote.requestHint")}
        </p>
        <div className="mt-3 flex justify-center">
          <Button
            variant={alreadyRequested ? "ghost" : "primary"}
            size="lg"
            onClick={handleRequestVote}
            disabled={requestVoteLoading}
            className="min-w-[10rem]"
          >
            {requestVoteLoading
              ? t("vote.requestLoading")
              : t("vote.callToVoteCta")}
          </Button>
        </div>
      </div>
    );
  }

  // ── Active voting ──────────────────────────────────────────────────────
  if (state === "active") {
    // Voting duration — derive total seconds from the discussion timer logic.
    // We don't have the started_at for the vote; use a fixed 60s sentinel
    // derived from the diff between voteEndsAt and now as a fallback.
    // The CountdownDial uses endsAt server timestamp so clock skew is fine.
    const votingDurationApprox = voteEndsAt
      ? Math.max(
          10,
          Math.round((new Date(voteEndsAt).getTime() - Date.now()) / 1000) + 5, // add a small buffer for initial render
        )
      : 60;

    const otherPlayers = players.filter((p) => p.id !== deviceId);

    return (
      <div className="mt-6 w-full">
        {/* Voting timer — primary visual */}
        {voteEndsAt && (
          <div className="flex flex-col items-center">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-fg-subtle">
              {t("vote.activeLabel")}
            </p>
            <CountdownDial
              endsAt={voteEndsAt}
              totalSeconds={votingDurationApprox}
              size={160}
              onComplete={onVoteTimerComplete}
            />
          </div>
        )}

        {/* Player grid — tap to cast/change vote */}
        <p className="mt-6 text-center text-sm font-medium text-fg">
          {myVoteTargetId ? t("vote.changeVoteHint") : t("vote.castVoteHint")}
        </p>
        <ul className="mt-3 space-y-2" aria-label={t("vote.playerListLabel")}>
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

        {/* Retract vote — shown only when the player has an active vote */}
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
      </div>
    );
  }

  // resolved — no voting panel (handled by E5-T9 result screen)
  return null;
}
