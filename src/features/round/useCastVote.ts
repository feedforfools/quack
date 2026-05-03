import { useState, useCallback } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { log } from "@/lib/log";

export type CastVoteError =
  | "vote.selfVote"
  | "vote.notActive"
  | "vote.expired"
  | "vote.castError";

export interface UseCastVoteReturn {
  castVote: (params: {
    deviceId: string;
    gameId: string;
    targetPlayerId: string;
  }) => Promise<boolean>;
  loading: boolean;
  error: CastVoteError | null;
}

/**
 * Calls the `cast_vote` SECURITY DEFINER RPC (E5-T7).
 *
 * Upserts the caller's vote for a target player.  Changing the vote is
 * allowed — the server updates the existing row.
 *
 * Rejected server-side when:
 *   - vote_state ≠ 'active'
 *   - caller == target (self-vote)
 *   - vote_ends_at has passed
 *   - caller or target is not a game participant
 */
export function useCastVote(): UseCastVoteReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<CastVoteError | null>(null);

  const castVote = useCallback(
    async ({
      deviceId,
      gameId,
      targetPlayerId,
    }: {
      deviceId: string;
      gameId: string;
      targetPlayerId: string;
    }): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const client = supabaseWithDevice(deviceId);
        const { error: rpcError } = await client.rpc("cast_vote", {
          p_game_id: gameId,
          p_target_player_id: targetPlayerId,
        });
        if (rpcError) {
          log.warn("cast_vote RPC error", { code: rpcError.code });
          // Surface a typed error the UI can interpret.
          if (rpcError.code === "P0001") {
            const msg = rpcError.message ?? "";
            if (msg.includes("yourself")) {
              setError("vote.selfVote");
            } else if (msg.includes("ended")) {
              setError("vote.expired");
            } else {
              setError("vote.notActive");
            }
          } else {
            setError("vote.castError");
          }
          return false;
        }
        return true;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { castVote, loading, error };
}
