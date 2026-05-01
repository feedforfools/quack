import { useState, useCallback } from "react";
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

export type StartGameTimerError =
  | "round.startTimerNotAllSeen"
  | "round.startTimerError";

export interface StartGameTimerResult {
  endsAt: string;
  timerSeconds: number;
}

export interface UseStartGameTimerReturn {
  startTimer: (params: {
    deviceId: string;
    roomId: string;
  }) => Promise<StartGameTimerResult | null>;
  loading: boolean;
  error: StartGameTimerError | null;
}

/**
 * Hook for host-initiated game timer start (E3-T7).
 *
 * Calls the `start_game_timer` RPC which:
 *   1. Validates host identity + secret.
 *   2. Checks all players have seen their role (all_players_seen).
 *   3. Sets games.ends_at and returns the authoritative timestamp + duration.
 *
 * After a successful call the caller should broadcast `timer_started` so all
 * connected clients refetch their role assignment and show the countdown.
 */
export function useStartGameTimer(): UseStartGameTimerReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<StartGameTimerError | null>(null);

  const startTimer = useCallback(
    async ({
      deviceId,
      roomId,
    }: {
      deviceId: string;
      roomId: string;
    }): Promise<StartGameTimerResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const rawSecret = localStorage.getItem(
          `${HOST_SECRET_STORAGE_PREFIX}${roomId}`,
        );
        if (!rawSecret) {
          log.warn("useStartGameTimer: no host secret found");
          setError("round.startTimerError");
          return null;
        }
        const secretHash = await sha256Hex(rawSecret);
        const client = supabaseWithDevice(deviceId);
        const { data, error: rpcError } = await client.rpc("start_game_timer", {
          p_room_id: roomId,
          p_host_secret_hash: secretHash,
        });
        if (rpcError) {
          const code = rpcError.code;
          log.warn("start_game_timer RPC error", { code });
          if (code === "P0001") {
            setError("round.startTimerNotAllSeen");
          } else {
            setError("round.startTimerError");
          }
          return null;
        }
        const result = data as { ends_at: string; timer_seconds: number };
        return {
          endsAt: result.ends_at,
          timerSeconds: result.timer_seconds,
        };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { startTimer, loading, error };
}
