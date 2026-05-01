import { useState, useCallback } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { log } from "@/lib/log";

const HOST_SECRET_STORAGE_PREFIX = "quack_host_secret_";

/** Computes the SHA-256 hex digest of a UTF-8 string using the Web Crypto API. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type EndGameError = "room.endGameError";

export interface UseEndGameReturn {
  endGame: (params: { deviceId: string; roomId: string }) => Promise<boolean>;
  loading: boolean;
  error: EndGameError | null;
}

/**
 * Hook for host-initiated round end (E3-T8).
 *
 * Calls the `end_round` RPC which:
 *   1. Validates host identity + secret.
 *   2. Sets ended_at on the current round.
 *   3. Transitions room.state → 'lobby'.
 *   4. Resets all players' is_ready = false.
 *
 * After a successful call the caller is responsible for broadcasting
 * `round_ended_return_lobby` so all other connected clients know to
 * refetch their room state.
 *
 * The host secret is never logged (constraint §10 / §6.3).
 */
export function useEndGame(): UseEndGameReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<EndGameError | null>(null);

  const endGame = useCallback(
    async ({
      deviceId,
      roomId,
    }: {
      deviceId: string;
      roomId: string;
    }): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        const rawSecret = localStorage.getItem(
          `${HOST_SECRET_STORAGE_PREFIX}${roomId}`,
        );
        if (!rawSecret) {
          log.warn("useEndGame: no host secret in localStorage");
          setError("room.endGameError");
          return false;
        }

        const secretHash = await sha256Hex(rawSecret);

        const { error: rpcError } = await supabaseWithDevice(deviceId).rpc(
          "end_game",
          {
            p_room_id: roomId,
            p_host_secret_hash: secretHash,
          },
        );

        if (rpcError) {
          log.error("useEndGame: RPC error", rpcError.code);
          setError("room.endGameError");
          return false;
        }

        return true;
      } catch (err) {
        log.error("useEndGame: unexpected error", err);
        setError("room.endGameError");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { endGame, loading, error };
}
