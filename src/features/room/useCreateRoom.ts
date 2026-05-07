import { useState, useCallback } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import type { Json } from "@/lib/supabase/types";
import { generateUniqueRoomCode } from "./generateCode";
import { log } from "@/lib/log";
import type { RoomConfig } from "./roomConfig";

const HOST_SECRET_STORAGE_PREFIX = "quack_host_secret_";

export interface UseCreateRoomReturn {
  createRoom: (params: {
    deviceId: string;
    displayName: string;
    config?: RoomConfig;
  }) => Promise<string | null>;
  loading: boolean;
  error: "create.errorCreate" | "create.errorAlreadyInRoom" | null;
}

/**
 * Hook that handles the full room-creation flow:
 *  1. Generate a collision-checked 6-char room code.
 *  2. Derive `host_secret_hash` = hex SHA-256 of a freshly minted UUID.
 *  3. INSERT into `rooms` (as host) and `players` (as self) via the
 *     device-scoped Supabase client so RLS headers are set correctly.
 *  4. Persist the raw host secret to localStorage under
 *     `quack_host_secret_<roomId>` for later use (start game, kick, etc.).
 *
 * Returns the room code on success, or null on failure (error is set).
 *
 * The host secret is never logged.
 */
export function useCreateRoom(): UseCreateRoomReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<
    "create.errorCreate" | "create.errorAlreadyInRoom" | null
  >(null);

  const createRoom = useCallback(
    async ({
      deviceId,
      displayName,
      config,
    }: {
      deviceId: string;
      displayName: string;
      config?: RoomConfig;
    }): Promise<string | null> => {
      setLoading(true);
      setError(null);

      try {
        const client = supabaseWithDevice(deviceId);

        // Guard: reject if this device is already a member of any room.
        // Prevents orphaning a newly-created room if the players INSERT would
        // later fail against the players_device_single_room unique index.
        const { data: existing } = await client
          .from("players")
          .select("room_id")
          .eq("id", deviceId)
          .maybeSingle();

        if (existing) {
          log.warn("useCreateRoom: device already in a room", existing.room_id);
          setError("create.errorAlreadyInRoom");
          return null;
        }

        // Generate unique room code.
        const code = await generateUniqueRoomCode(client);

        // Generate host secret and compute its SHA-256 hash.
        const hostSecret = crypto.randomUUID();
        const secretBytes = new TextEncoder().encode(hostSecret);
        const hashBuffer = await crypto.subtle.digest("SHA-256", secretBytes);
        const hostSecretHash = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        // INSERT rooms row — RLS policy: inserting player must be host_player_id.
        const { data: roomData, error: roomError } = await client
          .from("rooms")
          .insert({
            code,
            host_player_id: deviceId,
            host_secret_hash: hostSecretHash,
            config: (config ?? {}) as unknown as {
              [key: string]: Json | undefined;
            },
            state: "lobby",
            locked_after_start: false,
          })
          .select("id")
          .single();

        if (roomError || !roomData) {
          log.error("useCreateRoom: rooms insert failed", roomError);
          setError("create.errorCreate");
          return null;
        }

        const roomId: string = roomData.id;

        // INSERT players row for the host.
        const { error: playerError } = await client.from("players").insert({
          id: deviceId,
          room_id: roomId,
          display_name: displayName,
          is_ready: false,
          is_connected: true,
        });

        if (playerError) {
          log.error("useCreateRoom: players insert failed", playerError);
          setError("create.errorCreate");
          return null;
        }

        // Persist host secret locally (never sent to server again; used client-side only).
        localStorage.setItem(
          `${HOST_SECRET_STORAGE_PREFIX}${roomId}`,
          hostSecret,
        );
        log.debug("useCreateRoom: room created");

        return code;
      } catch (err) {
        log.error("useCreateRoom: unexpected error", err);
        setError("create.errorCreate");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { createRoom, loading, error };
}
