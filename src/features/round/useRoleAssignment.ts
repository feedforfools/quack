import { useState, useEffect, useCallback } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import type { RoomState } from "@/features/room";
import { log } from "@/lib/log";

export interface RoleAssignment {
  gameId: string;
  roundIndex: number;
  role: "civilian" | "imposter";
  /** Null for imposters — the word is deliberately withheld from them. */
  word: string | null;
  /**
   * Server-issued ISO timestamp when the discussion timer expires.
   * Null when no timer was configured for this round.
   */
  endsAt: string | null;
  /**
   * Total timer duration in seconds (derived from ends_at − started_at).
   * Null when no timer was configured for this round.
   */
  timerSeconds: number | null;
  /**
   * Server-issued ISO timestamp of the player's first lid-peek, or null if
   * they have not yet peeked. Used by RoleReveal to restore peek state on
   * reload so a player is never falsely reset to "never peeked" (E4-T1).
   */
  seenAt: string | null;
}

export interface UseRoleAssignmentReturn {
  assignment: RoleAssignment | null;
  loading: boolean;
  refetch: () => void;
}

/**
 * Fetches the current player's role assignment for the latest active round.
 *
 * Only queries when `roomState === "round_active"` — returns null during lobby
 * or round_ended states.
 *
 * Privacy constraint: the word value is never logged (see lib/log conventions).
 * The RLS policy on role_assignments ensures the server only returns the
 * calling device's own row, so the client never sees another player's role.
 */
export function useRoleAssignment(
  deviceId: string | null,
  roomId: string | null,
  roomState: RoomState,
): UseRoleAssignmentReturn {
  const [assignment, setAssignment] = useState<RoleAssignment | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAssignment = useCallback(async () => {
    if (!deviceId || !roomId) return;
    setLoading(true);
    try {
      const client = supabaseWithDevice(deviceId);

      // Step 1: Get the latest round for this room.
      // ends_at and started_at are used to derive the timer duration.
      const { data: round, error: roundErr } = await client
        .from("games")
        .select("id, index, ends_at, started_at")
        .eq("room_id", roomId)
        .order("index", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (roundErr) {
        log.error("useRoleAssignment: games fetch error", roundErr.code);
        return;
      }

      if (!round) {
        setAssignment(null);
        return;
      }

      // Step 2: Get own role assignment for that round.
      // RLS guarantees only the row for this device is returned.
      const { data: ra, error: raErr } = await client
        .from("role_assignments")
        .select("role, word, seen_at")
        .eq("game_id", round.id)
        .eq("player_id", deviceId)
        .maybeSingle();

      if (raErr) {
        log.error(
          "useRoleAssignment: role_assignments fetch error",
          raErr.code,
        );
        return;
      }

      if (!ra) {
        setAssignment(null);
        return;
      }

      // Compute timer fields from the round row.
      // timerSeconds is derived server-side so all clients agree on the value.
      const endsAt = round.ends_at ?? null;
      const timerSeconds =
        endsAt && round.started_at
          ? Math.round(
              (new Date(endsAt).getTime() -
                new Date(round.started_at).getTime()) /
                1000,
            )
          : null;

      // Word is intentionally not logged — privacy constraint §10.
      setAssignment({
        gameId: round.id,
        roundIndex: round.index,
        role: ra.role as "civilian" | "imposter",
        word: ra.word,
        endsAt,
        timerSeconds,
        seenAt: ra.seen_at ?? null,
      });
    } finally {
      setLoading(false);
    }
  }, [deviceId, roomId]);

  useEffect(() => {
    if (roomState === "round_active") {
      void fetchAssignment();
    } else {
      setAssignment(null);
    }
  }, [roomState, fetchAssignment]);

  return { assignment, loading, refetch: fetchAssignment };
}
