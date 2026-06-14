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

export interface UseAdvanceRoundReturn {
  advanceRound: (params: {
    deviceId: string;
    roomId: string;
    gameId: string;
  }) => Promise<boolean>;
  loading: boolean;
}

/**
 * Host-only: opens the next vote round after an intermediate round result
 * (multi-round mode). Calls the `advance_round` RPC which bumps
 * games.current_round, resets the vote columns and clears the discussion
 * timer so the host can run a fresh one.
 *
 * After a successful call the caller should broadcast `round_advanced` so all
 * connected clients refetch their vote state and role assignment.
 */
export function useAdvanceRound(): UseAdvanceRoundReturn {
  const [loading, setLoading] = useState(false);

  const advanceRound = useCallback(
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
          log.warn("useAdvanceRound: no host secret found");
          return false;
        }
        const secretHash = await sha256Hex(rawSecret);
        const { error } = await supabaseWithDevice(deviceId).rpc(
          "advance_round",
          { p_game_id: gameId, p_host_secret_hash: secretHash },
        );
        if (error) {
          log.error("advance_round RPC error", error.code);
          return false;
        }
        return true;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { advanceRound, loading };
}
