import { useState, useEffect, useCallback } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import type { Database } from "@/lib/supabase/types";
import { log } from "@/lib/log";

type RoomConfig = Database["public"]["Tables"]["rooms"]["Row"]["config"];

export type RoomState = "lobby" | "round_active" | "round_ended";

export interface UseRoomReturn {
  roomId: string | null;
  hostPlayerId: string | null;
  isHost: boolean;
  /** Raw `config` JSONB from the rooms row, or null while loading. */
  roomConfig: RoomConfig | null;
  /** Current state of the room (`lobby`, `round_active`, or `round_ended`). */
  roomState: RoomState;
  loading: boolean;
  /** Re-fetch the room row from the DB. Useful after a host transfer. */
  refetch: () => void;
}

/**
 * Looks up the room by code and determines whether the current device is
 * the host. Also exposes the room config for host validation (imposter count,
 * settings). Used by the lobby to conditionally show host-only controls.
 */
export function useRoom(
  deviceId: string | null,
  code: string | undefined,
): UseRoomReturn {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [roomConfig, setRoomConfig] = useState<RoomConfig | null>(null);
  const [roomState, setRoomState] = useState<RoomState>("lobby");
  const [loading, setLoading] = useState(true);

  const fetchRoom = useCallback(async () => {
    if (!deviceId || !code) return;

    const client = supabaseWithDevice(deviceId);
    const { data, error } = await client
      .from("rooms")
      .select("id, host_player_id, config, state")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (error) {
      log.error("useRoom: fetch failed", error);
    } else if (data) {
      setRoomId(data.id);
      setHostPlayerId(data.host_player_id);
      setIsHost(data.host_player_id === deviceId);
      setRoomConfig(data.config);
      setRoomState(data.state as RoomState);
    }
    setLoading(false);
  }, [deviceId, code]);

  useEffect(() => {
    void fetchRoom();
  }, [fetchRoom]);

  return { roomId, hostPlayerId, isHost, roomConfig, roomState, loading, refetch: fetchRoom };
}
