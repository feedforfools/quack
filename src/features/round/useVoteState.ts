import { useState, useEffect, useCallback } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { log } from "@/lib/log";

const VOTE_EXPIRY_BUFFER_MS = 250;

export interface VoteTally {
  targetPlayerId: string;
  voteCount: number;
}

export interface VoteState {
  /** Server-side vote_state for the current game. */
  state: "none" | "requested" | "active" | "resolved";
  /** How many players have requested a vote so far. */
  requestCount: number;
  /** ISO timestamp when voting expires; null when state !== 'active'. */
  voteEndsAt: string | null;
  /**
   * The target player ID this device has voted for, or null if not voted.
   * Fetched from the votes table (own row only via RLS).
   */
  myVoteTargetId: string | null;
  /**
   * Per-target vote counts — only populated when `live_vote_tally` is true.
   * Returned by the get_vote_tally SECURITY DEFINER RPC.
   */
  tally: VoteTally[];
}

export interface UseVoteStateReturn {
  voteState: VoteState | null;
  loading: boolean;
  refetch: () => void;
}

/**
 * Fetches the current voting state for the given game.
 *
 * Queries:
 *  1. games row — vote_state, vote_request_count, vote_ends_at
 *  2. votes row for this device — to show which player we voted for
 *  3. get_vote_tally RPC — aggregated counts (only when live_tally=true)
 *
 * Re-fetches automatically whenever refetch() is called (triggered externally
 * by the `vote_state_changed` broadcast from useRoomPlayers).
 * Also schedules a one-shot re-check at `vote_ends_at`; when the deadline
 * passes, the hook attempts the idempotent `resolve_vote` RPC itself and then
 * refetches so the client transitions even without another player action.
 *
 * Only queries when deviceId and gameId are non-null.
 */
export function useVoteState(
  deviceId: string | null,
  gameId: string | null,
  liveTally: boolean,
): UseVoteStateReturn {
  const [voteState, setVoteState] = useState<VoteState | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!deviceId || !gameId) {
      setVoteState(null);
      return;
    }

    let isMounted = true;

    const run = async () => {
      setLoading(true);
      try {
        const client = supabaseWithDevice(deviceId);

        // Step 1: game vote columns.
        const { data: game, error: gameErr } = await client
          .from("games")
          .select("vote_state, vote_request_count, vote_ends_at")
          .eq("id", gameId)
          .maybeSingle();

        if (gameErr) {
          log.error("useVoteState: games fetch error", gameErr.code);
          return;
        }
        if (!game) return;

        const state = game.vote_state as VoteState["state"];

        // Step 2: own vote row.
        const { data: myVote, error: voteErr } = await client
          .from("votes")
          .select("target_player_id")
          .eq("game_id", gameId)
          .eq("voter_player_id", deviceId)
          .maybeSingle();

        if (voteErr) {
          log.warn("useVoteState: votes fetch error", voteErr.code);
        }

        // Step 3: tally (only when live tally is on and voting is active).
        let tally: VoteTally[] = [];
        if (liveTally && state === "active") {
          const { data: tallyData, error: tallyErr } = await client.rpc(
            "get_vote_tally",
            { p_game_id: gameId },
          );
          if (tallyErr) {
            log.warn("useVoteState: get_vote_tally error", tallyErr.code);
          } else if (tallyData) {
            tally = tallyData.map(
              (row: { target_player_id: string; vote_count: number }) => ({
                targetPlayerId: row.target_player_id,
                voteCount: row.vote_count,
              }),
            );
          }
        }

        if (isMounted) {
          setVoteState({
            state,
            requestCount: game.vote_request_count,
            voteEndsAt: game.vote_ends_at ?? null,
            myVoteTargetId: myVote?.target_player_id ?? null,
            tally,
          });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void run();
    return () => {
      isMounted = false;
    };
  }, [deviceId, gameId, liveTally, tick]);

  useEffect(() => {
    if (
      !deviceId ||
      !gameId ||
      voteState?.state !== "active" ||
      voteState.voteEndsAt === null
    ) {
      return;
    }

    let cancelled = false;
    const deadlineMs = new Date(voteState.voteEndsAt).getTime();
    const delayMs = Math.max(
      VOTE_EXPIRY_BUFFER_MS,
      deadlineMs - Date.now() + VOTE_EXPIRY_BUFFER_MS,
    );

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const { error } = await supabaseWithDevice(deviceId).rpc(
          "resolve_vote",
          {
            p_game_id: gameId,
          },
        );

        if (error && error.code !== "P0001") {
          log.warn("useVoteState: auto resolve_vote error", error.code);
        }

        if (!cancelled) {
          refetch();
        }
      })();
    }, delayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [deviceId, gameId, voteState, refetch]);

  return { voteState, loading, refetch };
}
