import { useState, useCallback } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { log } from "@/lib/log";

export interface UseReadyToggleReturn {
  /** Toggle `is_ready` for the current device in the given room. */
  toggleReady: (currentIsReady: boolean) => Promise<void>;
  loading: boolean;
}

/**
 * Provides a toggle action for the current player's `is_ready` state.
 *
 * The current `is_ready` value is passed at call-time (from the live roster in
 * `useRoomPlayers`) rather than maintained internally, which avoids stale-
 * closure issues when the roster re-fetches and the DB truth changes.
 *
 * After a successful UPDATE the caller is expected to call `refetch()` (from
 * `useRoomPlayers`) so the roster reflects the change immediately for all
 * players on this device.
 */
export function useReadyToggle(
  deviceId: string | null,
  roomId: string | null,
  onSuccess: () => Promise<void>,
): UseReadyToggleReturn {
  const [loading, setLoading] = useState(false);

  const toggleReady = useCallback(
    async (currentIsReady: boolean) => {
      if (!deviceId || !roomId) return;

      setLoading(true);
      const client = supabaseWithDevice(deviceId);

      const { error } = await client
        .from("players")
        .update({ is_ready: !currentIsReady })
        .eq("id", deviceId)
        .eq("room_id", roomId);

      if (error) {
        log.error("useReadyToggle: update failed", error);
      } else {
        await onSuccess();
      }

      setLoading(false);
    },
    [deviceId, roomId, onSuccess],
  );

  return { toggleReady, loading };
}
