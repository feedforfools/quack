import { useCallback, useState } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { log } from "@/lib/log";

export interface UseResolveVoteReturn {
  resolveVote: (params: {
    deviceId: string;
    gameId: string;
  }) => Promise<boolean>;
  loading: boolean;
}

/**
 * Calls the `resolve_vote` SECURITY DEFINER RPC which tallies votes,
 * determines the outcome, and transitions `vote_state` → `resolved`.
 *
 * Idempotent: safe to call from multiple clients concurrently — the RPC
 * ignores a second call once already resolved.
 *
 * Triggered client-side when the voting CountdownDial reaches zero (E5-T9).
 */
export function useResolveVote(): UseResolveVoteReturn {
  const [loading, setLoading] = useState(false);

  const resolveVote = useCallback(
    async (params: { deviceId: string; gameId: string }): Promise<boolean> => {
      const { deviceId, gameId } = params;
      setLoading(true);
      try {
        const { error } = await supabaseWithDevice(deviceId).rpc(
          "resolve_vote",
          { p_game_id: gameId },
        );
        if (error) {
          // P0001 = voting still in progress (timer not yet expired and not all
          // voted) — can happen on a stale client timer; treat as non-fatal.
          if (error.code === "P0001") {
            log.warn("resolve_vote: voting still in progress", error.message);
            return false;
          }
          log.error("resolve_vote RPC error", error.message);
          return false;
        }
        return true;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { resolveVote, loading };
}
