import { useState, useEffect, useRef, useCallback } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import type { Database } from "@/lib/supabase/types";
import { log } from "@/lib/log";

export type PlayerRow = Database["public"]["Tables"]["players"]["Row"];

export interface UseRoomPlayersReturn {
  players: PlayerRow[];
  /** Set of player IDs currently connected to the Realtime presence channel. */
  connectedIds: Set<string>;
  loading: boolean;
  /** True once the host broadcasts `room_ended` — non-host players should show a "room ended" screen. */
  roomEnded: boolean;
  /** Re-fetch the roster from the DB immediately. */
  refetch: () => Promise<void>;
  /**
   * Re-fetch locally AND broadcast a `roster_update` event so all other
   * connected clients also re-fetch. Use this after toggling ready state.
   */
  broadcastRefetch: () => Promise<void>;
}

/**
 * Fetches the player roster for a room and keeps it live via Supabase
 * Realtime Presence.
 *
 * Architecture note (E2-T7):
 *   Our RLS policies rely on the `x-device-id` HTTP header which is not
 *   forwarded to WebSocket connections. Therefore `postgres_changes`
 *   subscriptions would be blocked by RLS at the Realtime layer.
 *
 *   Instead we:
 *     1. Subscribe to a Presence channel (`room:<roomId>`).
 *     2. Track the current device in presence on SUBSCRIBED.
 *     3. Re-fetch the roster (HTTP → RLS-protected) on every `sync` event —
 *        this covers new players joining and players being removed.
 *     4. Derive `connectedIds` from the presence state (accurate, ephemeral).
 */
export function useRoomPlayers(
  deviceId: string | null,
  roomId: string | null,
): UseRoomPlayersReturn {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [roomEnded, setRoomEnded] = useState(false);

  // Keep a stable ref to the fetch function so it can be called from
  // callbacks that outlive a single render (e.g., broadcast handler).
  const fetchRef = useRef<(() => Promise<void>) | null>(null);
  // Ref to the broadcast function populated once the channel is subscribed.
  const broadcastRef = useRef<((event: string) => Promise<void>) | null>(null);

  useEffect(() => {
    if (!deviceId || !roomId) return;

    const client = supabaseWithDevice(deviceId);
    let isMounted = true;

    const fetchPlayers = async () => {
      const { data, error } = await client
        .from("players")
        .select("*")
        .eq("room_id", roomId)
        .order("joined_at", { ascending: true });

      if (error) {
        log.error("useRoomPlayers: fetch failed", error);
      } else if (isMounted) {
        setPlayers(data ?? []);
      }
    };

    fetchRef.current = fetchPlayers;

    // Initial fetch — establish the roster before Realtime connects.
    void fetchPlayers().then(() => {
      if (isMounted) setLoading(false);
    });

    // Presence channel — tracks who is live on the WebSocket right now.
    const channel = client
      .channel(`room:${roomId}`)
      .on("presence", { event: "sync" }, () => {
        if (!isMounted) return;

        const state = channel.presenceState<{ playerId: string }>();
        const ids = new Set(
          Object.values(state)
            .flat()
            .map((p) => p.playerId),
        );
        setConnectedIds(ids);

        // Re-fetch the DB roster so new rows from other devices appear.
        void fetchPlayers();
      })
      // Re-fetch when any client broadcasts a ready-state change.
      .on("broadcast", { event: "roster_update" }, () => {
        if (!isMounted) return;
        void fetchPlayers();
      })
      // Host ended the room — flag non-host players to show the ended screen.
      .on("broadcast", { event: "room_ended" }, () => {
        if (!isMounted) return;
        setRoomEnded(true);
      })
      // When the host hands over, they broadcast the new host secret so the
      // successor's browser can save it to localStorage without a page reload.
      .on("broadcast", { event: "host_secret_transfer" }, ({ payload }) => {
        if (!isMounted) return;
        const p = payload as { newHostId?: string; newSecret?: string };
        if (
          typeof p.newHostId === "string" &&
          typeof p.newSecret === "string" &&
          p.newHostId === deviceId &&
          roomId
        ) {
          localStorage.setItem(`quack_host_secret_${roomId}`, p.newSecret);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ playerId: deviceId });
        }
      });

    broadcastRef.current = async (event: string) => {
      await channel.send({ type: "broadcast", event, payload: {} });
    };

    return () => {
      isMounted = false;
      fetchRef.current = null;
      broadcastRef.current = null;
      void client.removeChannel(channel);
    };
  }, [deviceId, roomId]);

  const refetch = useCallback(async () => {
    await fetchRef.current?.();
  }, []);

  const broadcastRefetch = useCallback(async () => {
    await fetchRef.current?.();
    await broadcastRef.current?.("roster_update");
  }, []);

  return { players, connectedIds, loading, roomEnded, refetch, broadcastRefetch };
}
