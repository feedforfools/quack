import { useCallback, useState } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { log } from "@/lib/log";

const HOST_SECRET_STORAGE_PREFIX = "quack_host_secret_";

/** Computes the SHA-256 hex digest of a UTF-8 string. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface UseStartVoteReturn {
  startVote: (params: {
    deviceId: string;
    roomId: string;
    gameId: string;
  }) => Promise<boolean>;
  loading: boolean;
}

/**
 * Host-only: opens the ballot directly via the `start_vote` RPC.
 *
 * This is the only way a game can reach the voting phase when call-to-vote is
 * disabled (the discussion would otherwise dead-end), and doubles as a host
 * override in any mode. Idempotent when voting is already active.
 */
export function useStartVote(): UseStartVoteReturn {
  const [loading, setLoading] = useState(false);

  const startVote = useCallback(
    async ({
      deviceId,
      roomId,
      gameId,
    }: {
      deviceId: string;
      roomId: string;
      gameId: string;
    }): Promise<boolean> => {
      setLoading(true);
      try {
        const rawSecret = localStorage.getItem(
          `${HOST_SECRET_STORAGE_PREFIX}${roomId}`,
        );
        if (!rawSecret) {
          log.warn("useStartVote: no host secret found");
          return false;
        }
        const secretHash = await sha256Hex(rawSecret);
        const { error } = await supabaseWithDevice(deviceId).rpc("start_vote", {
          p_game_id: gameId,
          p_host_secret_hash: secretHash,
        });
        if (error) {
          log.error("start_vote RPC error", error.code);
          return false;
        }
        return true;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { startVote, loading };
}
