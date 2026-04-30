import { useState, useCallback } from "react";
import { supabase, supabaseWithDevice } from "@/lib/supabase";
import { log } from "@/lib/log";

export interface UseLeaveRoomReturn {
  leaveRoom: (params: { deviceId: string; roomId: string }) => Promise<boolean>;
  loading: boolean;
}

/**
 * Hook that lets a non-host player leave a room by deleting their own
 * `players` row. The RLS `players_delete_own_row` policy ensures the delete
 * is restricted to the row whose `id` matches the device UUID in the
 * `x-device-id` request header.
 *
 * On success the caller is responsible for navigating away and clearing any
 * room-related UI state. The hook does NOT clear localStorage — that is
 * intentional: `quack_display_name` and `quack_device_id` are identity-level
 * keys that survive leaving a room.
 */
export function useLeaveRoom(): UseLeaveRoomReturn {
  const [loading, setLoading] = useState(false);

  const leaveRoom = useCallback(
    async ({
      deviceId,
      roomId,
    }: {
      deviceId: string;
      roomId: string;
    }): Promise<boolean> => {
      setLoading(true);
      try {
        const { error } = await supabaseWithDevice(deviceId)
          .from("players")
          .delete()
          .eq("id", deviceId)
          .eq("room_id", roomId);

        if (error) {
          log.warn("useLeaveRoom: delete failed", error.message);
          return false;
        }

        // Broadcast to the room channel so other connected clients
        // re-fetch the roster immediately (fire-and-forget).
        const broadcastChannel = supabase.channel(`room:${roomId}`);
        broadcastChannel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void broadcastChannel
              .send({ type: "broadcast", event: "roster_update", payload: {} })
              .finally(() => {
                setTimeout(() => void supabase.removeChannel(broadcastChannel), 500);
              });
          }
        });

        return true;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { leaveRoom, loading };
}
