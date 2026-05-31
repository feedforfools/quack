import { useCallback, useEffect, useState } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { log } from "@/lib/log";

export interface UseVoteRequestersReturn {
  /** IDs of players who have called to vote (skip-to-vote). */
  requesterIds: Set<string>;
  loading: boolean;
  refetch: () => void;
}

/**
 * Fetches the set of players who have called to vote via the
 * `get_vote_requesters` SECURITY DEFINER RPC (E5.5-T9).
 *
 * The aggregate `vote_request_count` already lives on the games row, but the
 * Discussion roster needs to know *which* players requested so it can render
 * the per-player "called to vote" indicator. The vote_requests table has no
 * SELECT grant, so this RPC exposes only the player_ids.
 *
 * Refetch is triggered externally on each `vote_state_changed` broadcast.
 * Only queries when both deviceId and gameId are non-null.
 */
export function useVoteRequesters(
  deviceId: string | null,
  gameId: string | null,
): UseVoteRequestersReturn {
  const [requesterIds, setRequesterIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!deviceId || !gameId) {
      setRequesterIds(new Set());
      return;
    }

    let cancelled = false;
    setLoading(true);
    supabaseWithDevice(deviceId)
      .rpc("get_vote_requesters", { p_game_id: gameId })
      .then(
        ({ data, error }) => {
          if (cancelled) return;
          if (error) {
            log.warn("useVoteRequesters: RPC error", { code: error.code });
          } else {
            setRequesterIds(new Set((data ?? []).map((row) => row.player_id)));
          }
          setLoading(false);
        },
        () => {
          if (!cancelled) setLoading(false);
        },
      );

    return () => {
      cancelled = true;
    };
  }, [deviceId, gameId, tick]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  return { requesterIds, loading, refetch };
}
