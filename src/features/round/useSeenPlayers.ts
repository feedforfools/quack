import { useCallback, useEffect, useState } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { log } from "@/lib/log";

export interface UseSeenPlayersReturn {
  /** IDs of players who have peeked at their card at least once. */
  seenIds: Set<string>;
  loading: boolean;
  refetch: () => void;
}

/**
 * Fetches the set of players who have seen (peeked at) their role via the
 * `get_seen_player_ids` SECURITY DEFINER RPC (E5.5-T9).
 *
 * Unlike `useAllPlayersSeen` (which returns only an aggregate boolean for the
 * host's Start-Timer gate), this exposes the per-player set so every device
 * can render the "seen their card" roster indicator.
 *
 * Refetch is triggered externally on each `peek_update` broadcast.
 * Only queries when both deviceId and gameId are non-null.
 */
export function useSeenPlayers(
  deviceId: string | null,
  gameId: string | null,
): UseSeenPlayersReturn {
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!deviceId || !gameId) {
      setSeenIds(new Set());
      return;
    }

    let cancelled = false;
    setLoading(true);
    supabaseWithDevice(deviceId)
      .rpc("get_seen_player_ids", { p_game_id: gameId })
      .then(
        ({ data, error }) => {
          if (cancelled) return;
          if (error) {
            log.warn("useSeenPlayers: RPC error", { code: error.code });
          } else {
            setSeenIds(new Set((data ?? []).map((row) => row.player_id)));
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

  return { seenIds, loading, refetch };
}
