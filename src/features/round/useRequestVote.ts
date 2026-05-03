import { useState, useCallback } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { log } from "@/lib/log";

export type RequestVoteError = "vote.requestError";

export interface UseRequestVoteReturn {
  requestVote: (params: {
    deviceId: string;
    gameId: string;
  }) => Promise<boolean>;
  loading: boolean;
  error: RequestVoteError | null;
}

/**
 * Calls the `request_vote` SECURITY DEFINER RPC (E5-T7).
 *
 * Any participant may call this to express "I want to vote now".
 * The server increments vote_request_count; once the configured threshold
 * (vote_threshold_fraction × player_count) is met, vote_state transitions
 * to 'active' and vote_ends_at is stamped.
 *
 * Idempotent: a second call from the same player is a server-side no-op.
 */
export function useRequestVote(): UseRequestVoteReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RequestVoteError | null>(null);

  const requestVote = useCallback(
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
        const { error: rpcError } = await client.rpc("request_vote", {
          p_game_id: gameId,
        });
        if (rpcError) {
          log.warn("request_vote RPC error", { code: rpcError.code });
          setError("vote.requestError");
          return false;
        }
        return true;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { requestVote, loading, error };
}
