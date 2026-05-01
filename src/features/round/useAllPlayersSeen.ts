import { useState, useEffect, useCallback } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { log } from "@/lib/log";

export interface UseAllPlayersSeenReturn {
  allSeen: boolean;
  loading: boolean;
  refetch: () => void;
}

/**
 * Polls `all_players_seen(p_game_id)` RPC once and provides a refetch.
 * Used by the host's "Start Timer" gate (E3-T7).
 *
 * The host calls refetch() after each `mark_game_seen` broadcast to get
 * an up-to-date gate value without exposing role/word data to the client.
 */
export function useAllPlayersSeen(
  deviceId: string | null,
  gameId: string | null,
): UseAllPlayersSeenReturn {
  const [allSeen, setAllSeen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!deviceId || !gameId) return;

    let cancelled = false;
    setLoading(true);
    const client = supabaseWithDevice(deviceId);
    client
      .rpc("all_players_seen", { p_game_id: gameId })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          log.warn("useAllPlayersSeen: RPC error", { code: error.code });
        } else {
          setAllSeen(data === true);
        }
        setLoading(false);
      }, () => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deviceId, gameId, tick]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  return { allSeen, loading, refetch };
}
