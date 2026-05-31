import { useState, useCallback } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { log } from "@/lib/log";

export type RetractVoteRequestError = "vote.retractRequestError";

export interface UseRetractVoteRequestReturn {
  retractVoteRequest: (params: {
    deviceId: string;
    gameId: string;
  }) => Promise<boolean>;
  loading: boolean;
  error: RetractVoteRequestError | null;
}

/**
 * Calls the `retract_vote_request` SECURITY DEFINER RPC (E5.5-T12).
 *
 * Undoes a "skip / call to vote" request while voting is still only pending
 * (vote_state in 'none' | 'requested'). Deletes the caller's vote_requests
 * row and decrements the request count.
 *
 * Idempotent: a no-op if the caller has no pending request, or if voting has
 * already gone active/resolved.
 */
export function useRetractVoteRequest(): UseRetractVoteRequestReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RetractVoteRequestError | null>(null);

  const retractVoteRequest = useCallback(
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
        const { error: rpcError } = await client.rpc("retract_vote_request", {
          p_game_id: gameId,
        });
        if (rpcError) {
          log.warn("retract_vote_request RPC error", { code: rpcError.code });
          setError("vote.retractRequestError");
          return false;
        }
        return true;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { retractVoteRequest, loading, error };
}
