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
  /**
   * Broadcast `round_ended_return_lobby` so all other connected clients
   * know to refetch their room state and return to the lobby.
   * Call this after a successful `end_round` RPC.
   */
  broadcastRoundEnd: () => Promise<void>;
  /**
   * Broadcast `round_started` so all other connected clients
   * refetch their room state and transition to the active-round screen.
   * Call this after a successful `start_round` RPC. Without this signal,
   * non-host clients would only discover the state change on the next
   * incidental refetch (E3-T10 bug).
   */
  broadcastRoundStart: () => Promise<void>;
  /**
   * Broadcast `timer_started` so all other connected clients refetch their
   * role assignment and begin showing the countdown dial.
   * Call this after a successful `start_round_timer` RPC.
   */
  broadcastTimerStart: () => Promise<void>;
  /** Notifies other clients that the current player has peeked at their role (E3-T7). */
  broadcastPeekUpdate: () => Promise<void>;
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
  options?: {
    /**
     * Called when a `round_ended_return_lobby` broadcast is received.
     * Use this in Room.tsx to trigger a room state refetch so the UI
     * transitions back to the lobby for all connected clients.
     */
    onRoundEnd?: () => void;
    /**
     * Called when a `round_started` broadcast is received. Use this in
     * Room.tsx to trigger a room state refetch so non-host clients
     * transition into the active-round screen as soon as the host starts.
     */
    onRoundStart?: () => void;
    /**
     * Called when a `timer_started` broadcast is received. Use this in
     * Room.tsx / DiscussionScreen to trigger a role assignment refetch so all
     * clients transition to showing the countdown.
     */
    onTimerStart?: () => void;
    /**
     * Called when a `peek_update` broadcast is received (any player peeked).
     * Used by the host to refetch all_players_seen (E3-T7 gate).
     */
    onPeekUpdate?: () => void;
  },
): UseRoomPlayersReturn {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [roomEnded, setRoomEnded] = useState(false);

  // Keep a stable ref to the fetch function so it can be called from
  // callbacks that outlive a single render (e.g., broadcast handler).
  const fetchRef = useRef<(() => Promise<void>) | null>(null);
  // Ref to the onRoundEnd callback so the channel handler always calls
  // the latest version without needing to re-subscribe.
  const onRoundEndRef = useRef(options?.onRoundEnd);
  const onRoundStartRef = useRef(options?.onRoundStart);
  const onTimerStartRef = useRef(options?.onTimerStart);
  const onPeekUpdateRef = useRef(options?.onPeekUpdate);
  // Keep callback refs current whenever the props change.
  useEffect(() => {
    onRoundEndRef.current = options?.onRoundEnd;
    onRoundStartRef.current = options?.onRoundStart;
    onTimerStartRef.current = options?.onTimerStart;
    onPeekUpdateRef.current = options?.onPeekUpdate;
  });
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
      // Host ended the round — all clients (including host) should refetch room
      // state so the UI transitions back to the lobby.
      .on("broadcast", { event: "round_ended_return_lobby" }, () => {
        if (!isMounted) return;
        void fetchPlayers();
        onRoundEndRef.current?.();
      })
      // Host started a round — non-host clients refetch room state so the UI
      // transitions into the active-round screen within ~1 s of Start (E3-T10).
      .on("broadcast", { event: "round_started" }, () => {
        if (!isMounted) return;
        onRoundStartRef.current?.();
      })
      // Host started the discussion timer — all clients refetch their role
      // assignment so the countdown dial appears (E3-T7).
      .on("broadcast", { event: "timer_started" }, () => {
        if (!isMounted) return;
        onTimerStartRef.current?.();
      })
      // A player peeked — host refetches all_players_seen gate (E3-T7).
      .on("broadcast", { event: "peek_update" }, () => {
        if (!isMounted) return;
        onPeekUpdateRef.current?.();
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

  const broadcastRoundEnd = useCallback(async () => {
    await broadcastRef.current?.("round_ended_return_lobby");
  }, []);

  const broadcastRoundStart = useCallback(async () => {
    await broadcastRef.current?.("round_started");
  }, []);

  const broadcastTimerStart = useCallback(async () => {
    await broadcastRef.current?.("timer_started");
  }, []);

  const broadcastPeekUpdate = useCallback(async () => {
    await broadcastRef.current?.("peek_update");
  }, []);

  return {
    players,
    connectedIds,
    loading,
    roomEnded,
    refetch,
    broadcastRefetch,
    broadcastRoundEnd,
    broadcastRoundStart,
    broadcastTimerStart,
    broadcastPeekUpdate,
  };
}
