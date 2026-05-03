import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { log } from "@/lib/log";
import type { Json } from "@/lib/supabase/types";

export interface GameImposter {
  player_id: string;
  display_name: string;
}

export interface GameResult {
  outcome: "imposters_caught" | "imposters_win" | "tie";
  votedOutPlayerId: string | null;
  votedOutPlayerName: string | null;
  secretWord: string | null;
  imposters: GameImposter[];
}

export interface UseGameResultReturn {
  result: GameResult | null;
  loading: boolean;
  refetch: () => void;
}

/**
 * Fetches the full game result via the `get_game_result` SECURITY DEFINER RPC
 * once `vote_state` is `resolved`. The RPC bypasses normal role_assignments
 * RLS so it can reveal all imposters and the secret word to every participant.
 *
 * Only fires when both `deviceId` and `gameId` are non-null.
 */
export function useGameResult(
  deviceId: string | null,
  gameId: string | null,
): UseGameResultReturn {
  const [result, setResult] = useState<GameResult | null>(null);
  const [loading, setLoading] = useState(false);
  const isMountedRef = useRef(true);

  const fetchResult = useCallback(async () => {
    if (!deviceId || !gameId) return;
    setLoading(true);
    try {
      const { data, error } = await supabaseWithDevice(deviceId).rpc(
        "get_game_result",
        { p_game_id: gameId },
      );
      if (!isMountedRef.current) return;
      if (error) {
        log.error("get_game_result RPC error", error.message);
        return;
      }
      if (!data || data.length === 0) return;
      const row = data[0];
      if (!row) return;
      const impostersRaw = row.imposters as Json;
      const imposters: GameImposter[] = Array.isArray(impostersRaw)
        ? (impostersRaw as { player_id: string; display_name: string }[]).map(
            (imp) => ({
              player_id: String(imp.player_id),
              display_name: String(imp.display_name),
            }),
          )
        : [];
      setResult({
        outcome: row.outcome,
        votedOutPlayerId: row.voted_out_player_id ?? null,
        votedOutPlayerName: row.voted_out_player_name ?? null,
        secretWord: row.secret_word ?? null,
        imposters,
      });
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [deviceId, gameId]);

  useEffect(() => {
    isMountedRef.current = true;
    if (deviceId && gameId) void fetchResult();
    return () => {
      isMountedRef.current = false;
    };
  }, [deviceId, gameId, fetchResult]);

  return { result, loading, refetch: fetchResult };
}
