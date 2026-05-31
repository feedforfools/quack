import { useState, useEffect, useCallback } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import type { RoomState } from "@/features/room";
import { log } from "@/lib/log";

export interface CoImposter {
  playerId: string;
  displayName: string;
}

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
   * Total timer duration in seconds — the configured value from the game's
   * config_snapshot (NOT ends_at − started_at, which would include the gap
   * between game start and the host tapping "start timer" and so make the bar
   * begin partially filled). Null when no timer was configured.
   */
  timerSeconds: number | null;
  /**
   * Frozen remaining seconds while the host has paused the timer. Null when
   * the timer is running or has not been started. Set by pause_game_timer.
   */
  pausedSeconds: number | null;
  /**
   * Player ID that should open the discussion (random per game), or null.
   */
  starterPlayerId: string | null;
  /**
   * Rotation hint for turn order: 'clockwise' | 'counterclockwise' | null.
   */
  discussionDirection: "clockwise" | "counterclockwise" | null;
  /**
   * Server-issued ISO timestamp of the player's first lid-peek, or null if
   * they have not yet peeked. Used by RoleReveal to restore peek state on
   * reload so a player is never falsely reset to "never peeked" (E4-T1).
   */
  seenAt: string | null;
  /**
   * Other imposters in this game — only populated when
   * config_snapshot.imposters_see_each_other is true. Empty array otherwise.
   * Fetched via the get_co_imposters SECURITY DEFINER RPC (E5-T4).
   */
  coImposters: CoImposter[];
  /**
   * Imposter-specific hints distributed by start_game (E5-T5).
   * One or more short clues to help the imposter blend in.
   * Always empty for civilians.
   */
  hints: string[];
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
      // config_snapshot carries the configured timer duration; ends_at /
      // timer_paused_seconds drive the live countdown and pause state.
      const { data: round, error: roundErr } = await client
        .from("games")
        .select(
          "id, index, ends_at, started_at, config_snapshot, timer_paused_seconds, starter_player_id, discussion_direction",
        )
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
        .select("role, word, seen_at, payload")
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
      // timerSeconds is the configured duration (config_snapshot.timer_seconds)
      // so the strip always starts completely filled — independent of how long
      // after game start the host actually tapped "start timer".
      const endsAt = round.ends_at ?? null;
      const configSnapshot =
        round.config_snapshot && typeof round.config_snapshot === "object"
          ? (round.config_snapshot as Record<string, unknown>)
          : null;
      const configTimerSeconds = Number(configSnapshot?.["timer_seconds"] ?? 0);
      const timerSeconds =
        Number.isFinite(configTimerSeconds) && configTimerSeconds > 0
          ? configTimerSeconds
          : null;
      const pausedSeconds =
        typeof round.timer_paused_seconds === "number"
          ? round.timer_paused_seconds
          : null;

      // Extract hints from payload (imposter-only field set by start_game).
      const hints: string[] =
        ra.payload &&
        typeof ra.payload === "object" &&
        !Array.isArray(ra.payload) &&
        "hints" in ra.payload &&
        Array.isArray((ra.payload as Record<string, unknown>)["hints"])
          ? ((ra.payload as Record<string, unknown>)["hints"] as string[])
          : [];

      // For imposters, fetch co-imposter names (E5-T4).
      // The RPC returns an empty result for civilians or when the setting is off.
      let coImposters: CoImposter[] = [];
      if (ra.role === "imposter") {
        const { data: coData } = await client.rpc("get_co_imposters", {
          p_game_id: round.id,
        });
        if (coData) {
          coImposters = coData.map(
            (row: { player_id: string; display_name: string }) => ({
              playerId: row.player_id,
              displayName: row.display_name,
            }),
          );
        }
      }

      // Word is intentionally not logged — privacy constraint §10.
      setAssignment({
        gameId: round.id,
        roundIndex: round.index,
        role: ra.role as "civilian" | "imposter",
        word: ra.word,
        endsAt,
        timerSeconds,
        pausedSeconds,
        starterPlayerId: round.starter_player_id ?? null,
        discussionDirection:
          round.discussion_direction === "clockwise" ||
          round.discussion_direction === "counterclockwise"
            ? round.discussion_direction
            : null,
        seenAt: ra.seen_at ?? null,
        coImposters,
        hints,
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
