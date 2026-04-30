import { useState, useEffect, useCallback, useRef } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { log } from "@/lib/log";

export interface ActiveRoom {
  roomId: string;
  code: string;
}

export interface UseActiveRoomReturn {
  /** Non-null when the device has a live `players` row, null otherwise. */
  activeRoom: ActiveRoom | null;
  loading: boolean;
  /** Re-query the DB immediately (e.g. after a successful leave). */
  refetch: () => void;
}

/**
 * Checks whether the current device is already a member of a room.
 *
 * Queries `players` (filtered by device id via RLS `requesting_player_id()`)
 * and joins `rooms` to retrieve the code for the resume card on the home page.
 *
 * Used by E2.5-T3 to render a "Resume room" card on `/`.
 */
export function useActiveRoom(
  deviceId: string | null,
): UseActiveRoomReturn {
  const [activeRoom, setActiveRoom] = useState<ActiveRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!deviceId) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetch = async () => {
      const { data, error } = await supabaseWithDevice(deviceId)
        .from("players")
        .select("room_id, rooms(code)")
        .eq("id", deviceId)
        .maybeSingle();

      if (!isMounted) return;

      if (error) {
        log.error("useActiveRoom: fetch failed", error);
        setActiveRoom(null);
      } else if (data) {
        // `rooms` is typed as an array by the Supabase client even with .maybeSingle(),
        // but the join on a single FK always returns one row or null.
        const rooms = data.rooms as { code: string } | { code: string }[] | null;
        const code = rooms
          ? Array.isArray(rooms)
            ? rooms[0]?.code
            : rooms.code
          : undefined;

        if (typeof code === "string") {
          setActiveRoom({ roomId: data.room_id, code });
        } else {
          setActiveRoom(null);
        }
      } else {
        setActiveRoom(null);
      }

      setLoading(false);
    };

    fetchRef.current = () => void fetch();
    void fetch();

    return () => {
      isMounted = false;
      fetchRef.current = null;
    };
  }, [deviceId]);

  const refetch = useCallback(() => {
    fetchRef.current?.();
  }, []);

  return { activeRoom, loading, refetch };
}
