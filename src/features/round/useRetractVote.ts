import { useState, useCallback } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { log } from "@/lib/log";

export type RetractVoteError = "vote.retractError";

export interface UseRetractVoteReturn {
  retractVote: (params: {
    deviceId: string;
    gameId: string;
  }) => Promise<boolean>;
  loading: boolean;
  error: RetractVoteError | null;
}

/**
 * Calls the `retract_vote` SECURITY DEFINER RPC (E5-T7).
 *
 * Deletes the caller's vote row for the given game.
 * Idempotent: no error if the caller has no vote to retract.
 *
 * Rejected server-side when:
 *   - vote_state ≠ 'active'
 *   - vote_ends_at has passed
 *   - caller is not a game participant
 */
export function useRetractVote(): UseRetractVoteReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RetractVoteError | null>(null);

  const retractVote = useCallback(
    async ({
      deviceId,
      gameId,
    }: {
      deviceId: string;
      gameId: string;
    }): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const client = supabaseWithDevice(deviceId);
        const { error: rpcError } = await client.rpc("retract_vote", {
          p_game_id: gameId,
        });
        if (rpcError) {
          log.warn("retract_vote RPC error", { code: rpcError.code });
          setError("vote.retractError");
          return false;
        }
        return true;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { retractVote, loading, error };
}
