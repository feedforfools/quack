import { useState, useEffect, useCallback, useRef } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import type { Database } from "@/lib/supabase/types";
import { log } from "@/lib/log";

type RoomConfig = Database["public"]["Tables"]["rooms"]["Row"]["config"];

export type RoomState = "lobby" | "round_active" | "round_ended";

/**
 * Reconciliation poll interval. The whole app syncs via ephemeral Realtime
 * broadcasts, so a state change with no client to broadcast it never reaches
 * other devices — most importantly the inactivity purge (purge_stale_rooms
 * pg_cron), which deletes the room server-side. Polling lets every client
 * converge on the server truth (room state + existence) without a manual
 * refresh. Coarse (10 s) because room-lifecycle changes are infrequent and the
 * broadcasts already cover the happy path; this is the safety net.
 */
const ROOM_POLL_MS = 10_000;

export interface UseRoomReturn {
  roomId: string | null;
  hostPlayerId: string | null;
  isHost: boolean;
  /** Raw `config` JSONB from the rooms row, or null while loading. */
  roomConfig: RoomConfig | null;
  /** Current state of the room (`lobby`, `round_active`, or `round_ended`). */
  roomState: RoomState;
  /**
   * True once a fetch confirms the room row no longer exists — i.e. it was
   * purged for inactivity (or never existed). Drives the "Room expired" screen
   * so clients leave a now-broken lobby/game without needing a manual refresh.
   */
  roomMissing: boolean;
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
  const [roomMissing, setRoomMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Serialized last-seen config — lets the poll skip setRoomConfig when the
  // JSONB is unchanged, so it never churns the object reference (and the
  // downstream parseRoomConfig memo / settings-modal re-sync) every 10 s.
  const configJsonRef = useRef<string | null>(null);

  const fetchRoom = useCallback(async () => {
    if (!deviceId || !code) return;

    const client = supabaseWithDevice(deviceId);
    const { data, error } = await client
      .from("rooms")
      .select("id, host_player_id, config, state")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (error) {
      // Transient errors (e.g. a network blip) must NOT be read as "room gone":
      // leave roomMissing untouched and retry on the next poll.
      log.error("useRoom: fetch failed", error);
    } else if (data) {
      setRoomId(data.id);
      setHostPlayerId(data.host_player_id);
      setIsHost(data.host_player_id === deviceId);
      const nextConfigJson = JSON.stringify(data.config);
      if (nextConfigJson !== configJsonRef.current) {
        configJsonRef.current = nextConfigJson;
        setRoomConfig(data.config);
      }
      setRoomState(data.state as RoomState);
      setRoomMissing(false);
    } else {
      // No error and no row: the room was never found, or it has been purged
      // for inactivity. Flag it so the UI can show the expired screen.
      setRoomMissing(true);
    }
    setLoading(false);
  }, [deviceId, code]);

  // Initial fetch + reconciliation poll + refetch when the tab regains focus.
  // The focus refetch is the key mobile-party-game path: a player unlocks their
  // phone and the now-purged room (or a missed round/vote transition) surfaces
  // immediately instead of after a manual refresh.
  useEffect(() => {
    if (!deviceId || !code) return;

    void fetchRoom();

    const intervalId = window.setInterval(() => void fetchRoom(), ROOM_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchRoom();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [deviceId, code, fetchRoom]);

  return {
    roomId,
    hostPlayerId,
    isHost,
    roomConfig,
    roomState,
    roomMissing,
    loading,
    refetch: fetchRoom,
  };
}
