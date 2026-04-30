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

export interface UseHostLeaveReturn {
  /**
   * Transfers host role to `successorId`. Calls the `transfer_host` RPC,
   * broadcasts the new raw host secret so the successor can save it without
   * a page reload, then removes own host secret from localStorage.
   */
  handOver: (params: {
    deviceId: string;
    roomId: string;
    successorId: string;
  }) => Promise<boolean>;
  /**
   * Deletes the room entirely. Calls the `end_room_as_host` RPC which CASCADE-
   * deletes all players rows. Removes own host secret from localStorage.
   */
  endRoom: (params: { deviceId: string; roomId: string }) => Promise<boolean>;
  loading: boolean;
}

/**
 * Hook for host-initiated room leave (Epic 2.5-T2).
 *
 * Two paths:
 *  1. Hand over — host picks a successor; DB is updated atomically via
 *     `transfer_host` RPC; new raw secret is broadcast on the room channel so
 *     the successor's browser saves it to localStorage.
 *  2. End room — host deletes the room (CASCADE removes all players rows) via
 *     `end_room_as_host` RPC.
 *
 * The host secret is never logged (constraint §10 / §6.3).
 */
export function useHostLeave(): UseHostLeaveReturn {
  const [loading, setLoading] = useState(false);

  const handOver = useCallback(
    async ({
      deviceId,
      roomId,
      successorId,
    }: {
      deviceId: string;
      roomId: string;
      successorId: string;
    }): Promise<boolean> => {
      setLoading(true);
      try {
        // Read current host secret from localStorage.
        const currentRawSecret = localStorage.getItem(
          `${HOST_SECRET_STORAGE_PREFIX}${roomId}`,
        );
        if (!currentRawSecret) {
          log.warn("useHostLeave.handOver: no host secret found in localStorage");
          return false;
        }

        // Compute current hash (sent to RPC for validation).
        const currentSecretHash = await sha256Hex(currentRawSecret);

        // Generate fresh host secret for the successor.
        const newRawSecret = crypto.randomUUID();
        const newSecretHash = await sha256Hex(newRawSecret);

        // Call transfer_host RPC atomically.
        const { error } = await supabaseWithDevice(deviceId).rpc("transfer_host", {
          p_room_id: roomId,
          p_host_secret_hash: currentSecretHash,
          p_successor_id: successorId,
          p_new_secret_hash: newSecretHash,
        });

        if (error) {
          log.warn("useHostLeave.handOver: RPC failed", error.message);
          return false;
        }

        // Broadcast the new raw secret on the room channel so the successor's
        // browser (already subscribed via useRoomPlayers) can save it to
        // localStorage without requiring a page reload.
        // This is best-effort — the singleton Supabase client persists across
        // SPA navigation so the send completes even after we navigate away.
        const broadcastChannel = supabase.channel(`room:${roomId}`);
        broadcastChannel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void broadcastChannel
              .send({
                type: "broadcast",
                event: "host_secret_transfer",
                payload: { newHostId: successorId, newSecret: newRawSecret },
              })
              .finally(() => {
                // Give Realtime 500 ms to deliver before removing the channel.
                setTimeout(() => void supabase.removeChannel(broadcastChannel), 500);
              });
          }
        });

        // Remove own (now stale) host secret.
        localStorage.removeItem(`${HOST_SECRET_STORAGE_PREFIX}${roomId}`);
        return true;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const endRoom = useCallback(
    async ({
      deviceId,
      roomId,
    }: {
      deviceId: string;
      roomId: string;
    }): Promise<boolean> => {
      setLoading(true);
      try {
        const currentRawSecret = localStorage.getItem(
          `${HOST_SECRET_STORAGE_PREFIX}${roomId}`,
        );
        if (!currentRawSecret) {
          log.warn("useHostLeave.endRoom: no host secret found in localStorage");
          return false;
        }

        const currentSecretHash = await sha256Hex(currentRawSecret);

        const { error } = await supabaseWithDevice(deviceId).rpc("end_room_as_host", {
          p_room_id: roomId,
          p_host_secret_hash: currentSecretHash,
        });

        if (error) {
          log.warn("useHostLeave.endRoom: RPC failed", error.message);
          return false;
        }

        localStorage.removeItem(`${HOST_SECRET_STORAGE_PREFIX}${roomId}`);

        // Notify connected players that the room is gone. Uses the same
        // fire-and-forget singleton-channel pattern as host_secret_transfer.
        const broadcastChannel = supabase.channel(`room:${roomId}`);
        broadcastChannel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void broadcastChannel
              .send({ type: "broadcast", event: "room_ended", payload: {} })
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

  return { handOver, endRoom, loading };
}
