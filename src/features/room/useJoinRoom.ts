import { useState, useCallback } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { ROOM_CODE_LENGTH } from "./generateCode";
import { log } from "@/lib/log";

export type JoinRoomError =
  | "join.errorNotFound"
  | "join.errorFull"
  | "join.errorJoin"
  | "join.errorAlreadyInRoom";

export interface UseJoinRoomReturn {
  joinRoom: (params: {
    deviceId: string;
    displayName: string;
    code: string;
  }) => Promise<string | null>;
  loading: boolean;
  error: JoinRoomError | null;
}

/**
 * Normalises a raw code string typed by the user:
 *  - Uppercases all characters.
 *  - Strips anything outside A–Z and 2–9 (hyphens, spaces, etc.).
 *  - Truncates to ROOM_CODE_LENGTH.
 */
export function normaliseCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, "")
    .slice(0, ROOM_CODE_LENGTH);
}

/**
 * Hook that handles the full join-room flow:
 *  1. Normalise the code and look up the room.
 *  2. Return `join.errorNotFound` if no active room matches the code.
 *  3. Idempotently upsert a `players` row for this device (INSERT … ON CONFLICT DO NOTHING
 *     is replicated via Supabase's `.upsert()` with `ignoreDuplicates: true`).
 *  4. Returns the room code on success, or null on failure (error is set).
 *
 * Re-joining the same room (deep-link revisit, back button) is safe: the upsert
 * is a no-op if the players row already exists.
 */
export function useJoinRoom(): UseJoinRoomReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<JoinRoomError | null>(null);

  const joinRoom = useCallback(
    async ({
      deviceId,
      displayName,
      code,
    }: {
      deviceId: string;
      displayName: string;
      code: string;
    }): Promise<string | null> => {
      setLoading(true);
      setError(null);

      try {
        const normCode = normaliseCode(code);
        if (normCode.length !== ROOM_CODE_LENGTH) {
          setError("join.errorNotFound");
          return null;
        }

        const client = supabaseWithDevice(deviceId);

        // Look up the room by code.
        const { data: room, error: roomError } = await client
          .from("rooms")
          .select("id, state")
          .eq("code", normCode)
          .maybeSingle();

        if (roomError) {
          log.error("useJoinRoom: room lookup failed", roomError);
          setError("join.errorJoin");
          return null;
        }

        if (!room) {
          setError("join.errorNotFound");
          return null;
        }

        // Idempotent insert — if the player is already in this room, this is a no-op.
        // Guard: if the device is already in a DIFFERENT room, surface a friendly error
        // instead of hitting the players_device_single_room unique index constraint.
        const { data: existingMembership } = await client
          .from("players")
          .select("room_id")
          .eq("id", deviceId)
          .maybeSingle();

        if (existingMembership && existingMembership.room_id !== room.id) {
          log.warn(
            "useJoinRoom: device already in a different room",
            existingMembership.room_id,
          );
          setError("join.errorAlreadyInRoom");
          return null;
        }

        // Idempotent insert — if the player is already in this room, this is a no-op.
        const { error: playerError } = await client.from("players").upsert(
          {
            id: deviceId,
            room_id: room.id,
            display_name: displayName,
            is_ready: false,
            is_connected: true,
            // Seat late joiners as spectators when the game is already running.
            // The spectator flag is cleared automatically by the server when the
            // next start_game RPC fires, so they participate from the next game.
            is_spectator: room.state === "round_active",
          },
          { onConflict: "id,room_id", ignoreDuplicates: true },
        );

        if (playerError) {
          log.error("useJoinRoom: players upsert failed", playerError);
          setError("join.errorJoin");
          return null;
        }

        log.debug("useJoinRoom: joined room");
        return normCode;
      } catch (err) {
        log.error("useJoinRoom: unexpected error", err);
        setError("join.errorJoin");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { joinRoom, loading, error };
}
