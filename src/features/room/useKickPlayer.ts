import { useState, useCallback } from "react";
import { supabase, supabaseWithDevice } from "@/lib/supabase";
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

export interface UseKickPlayerReturn {
  /**
   * Removes `playerId` from the room. Reads the host secret from localStorage,
   * calls the `kick_player` RPC, then broadcasts `player_kicked` so the
   * kicked client can navigate home with a toast.
   */
  kickPlayer: (params: {
    deviceId: string;
    roomId: string;
    playerId: string;
  }) => Promise<boolean>;
  loading: boolean;
}

/**
 * Hook for kicking a player from the room (E4-T5).
 *
 * Flow:
 *  1. Read host secret from localStorage and hash it.
 *  2. Call `kick_player` RPC (SECURITY DEFINER) — deletes the player row.
 *  3. Fire-and-forget broadcast `player_kicked` on the room channel so the
 *     kicked client's `useRoomPlayers` handler navigates them home.
 */
export function useKickPlayer(): UseKickPlayerReturn {
  const [loading, setLoading] = useState(false);

  const kickPlayer = useCallback(
    async ({
      deviceId,
      roomId,
      playerId,
    }: {
      deviceId: string;
      roomId: string;
      playerId: string;
    }): Promise<boolean> => {
      setLoading(true);
      try {
        const rawSecret = localStorage.getItem(
          `${HOST_SECRET_STORAGE_PREFIX}${roomId}`,
        );
        if (!rawSecret) {
          log.warn("useKickPlayer: no host secret in localStorage");
          return false;
        }

        const secretHash = await sha256Hex(rawSecret);

        const { error } = await supabaseWithDevice(deviceId).rpc(
          "kick_player",
          {
            p_room_id: roomId,
            p_host_secret_hash: secretHash,
            p_player_id: playerId,
          },
        );

        if (error) {
          log.warn("useKickPlayer: RPC failed", error.message);
          return false;
        }

        // Fire-and-forget broadcast — the kicked client's useRoomPlayers handler
        // picks this up and navigates them home. Uses the singleton client so the
        // send completes even if the host navigates away first.
        const broadcastChannel = supabase.channel(`room:${roomId}`);
        broadcastChannel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void broadcastChannel
              .send({
                type: "broadcast",
                event: "player_kicked",
                payload: { playerId },
              })
              .finally(() => {
                setTimeout(
                  () => void supabase.removeChannel(broadcastChannel),
                  500,
                );
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

  return { kickPlayer, loading };
}
