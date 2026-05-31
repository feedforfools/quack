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

export type GameTimerControlError = "round.timerControlError";

export interface UseGameTimerControlsReturn {
  /** Pauses the running discussion timer for every device. */
  pauseTimer: (params: {
    deviceId: string;
    roomId: string;
  }) => Promise<boolean>;
  /** Resumes a paused discussion timer for every device. */
  resumeTimer: (params: {
    deviceId: string;
    roomId: string;
  }) => Promise<boolean>;
  loading: boolean;
  error: GameTimerControlError | null;
}

/**
 * Host-only pause / resume controls for the discussion timer (E5.5-T11).
 *
 * Wraps the `pause_game_timer` / `resume_game_timer` SECURITY DEFINER RPCs.
 * Both require the host secret and operate on the room's latest active game,
 * freezing or re-stamping games.ends_at so the countdown stops/resumes on
 * every connected device once they refetch.
 *
 * After a successful call the caller should broadcast `timer_started` so all
 * connected clients refetch their assignment and reflect the new state.
 */
export function useGameTimerControls(): UseGameTimerControlsReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<GameTimerControlError | null>(null);

  const call = useCallback(
    async (
      fn: "pause_game_timer" | "resume_game_timer",
      { deviceId, roomId }: { deviceId: string; roomId: string },
    ): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const rawSecret = localStorage.getItem(
          `${HOST_SECRET_STORAGE_PREFIX}${roomId}`,
        );
        if (!rawSecret) {
          log.warn("useGameTimerControls: no host secret found");
          setError("round.timerControlError");
          return false;
        }
        const secretHash = await sha256Hex(rawSecret);
        const client = supabaseWithDevice(deviceId);
        const { error: rpcError } = await client.rpc(fn, {
          p_room_id: roomId,
          p_host_secret_hash: secretHash,
        });
        if (rpcError) {
          log.warn(`${fn} RPC error`, { code: rpcError.code });
          setError("round.timerControlError");
          return false;
        }
        return true;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const pauseTimer = useCallback(
    (params: { deviceId: string; roomId: string }) =>
      call("pause_game_timer", params),
    [call],
  );

  const resumeTimer = useCallback(
    (params: { deviceId: string; roomId: string }) =>
      call("resume_game_timer", params),
    [call],
  );

  return { pauseTimer, resumeTimer, loading, error };
}
