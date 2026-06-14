import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { log } from "@/lib/log";
import type { Json } from "@/lib/supabase/types";
import type { VoteTally } from "./useVoteState";

export interface RoundResult {
  /** 1-based vote-round number. */
  round: number;
  /** Player voted out this round, or null on a tie / no votes. */
  eliminatedPlayerId: string | null;
  /** Display name of the eliminated player (null if they left the room). */
  eliminatedPlayerName: string | null;
  /** Their revealed role — eliminations are public. */
  eliminatedRole: "civilian" | "imposter" | null;
  /**
   * Final per-target vote counts for the round. Empty when the host disabled
   * `show_vote_counts` (enforced server-side).
   */
  tally: VoteTally[];
}

export interface UseRoundResultsReturn {
  /** All resolved rounds so far, ordered by round number. */
  rounds: RoundResult[];
  /** The most recently resolved round, or null before the first vote. */
  latest: RoundResult | null;
  /** Players eliminated in any round so far. */
  eliminatedIds: Set<string>;
  loading: boolean;
  refetch: () => void;
}

function parseTally(raw: Json): VoteTally[] {
  if (!Array.isArray(raw)) return [];
  return (raw as { player_id?: unknown; votes?: unknown }[])
    .filter((e) => typeof e?.player_id === "string")
    .map((e) => ({
      targetPlayerId: String(e.player_id),
      voteCount: typeof e.votes === "number" ? e.votes : 0,
    }));
}

/**
 * Fetches the per-round resolution history via the `get_round_results`
 * SECURITY DEFINER RPC: who was eliminated each round (role revealed) and the
 * vote tally snapshot. Drives the round-result screen, the eliminated-player
 * styling on the roster, and the vote counts on the final result screen.
 *
 * Returns an empty list until the first round resolves. Refetch is triggered
 * externally on `vote_state_changed` / `round_advanced` broadcasts.
 * Only queries when both deviceId and gameId are non-null.
 */
export function useRoundResults(
  deviceId: string | null,
  gameId: string | null,
): UseRoundResultsReturn {
  const [rounds, setRounds] = useState<RoundResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!deviceId || !gameId) {
      setRounds([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    supabaseWithDevice(deviceId)
      .rpc("get_round_results", { p_game_id: gameId })
      .then(
        ({ data, error }) => {
          if (cancelled) return;
          if (error) {
            log.warn("useRoundResults: RPC error", { code: error.code });
          } else {
            setRounds(
              (data ?? []).map((row) => ({
                round: row.round,
                eliminatedPlayerId: row.eliminated_player_id ?? null,
                eliminatedPlayerName: row.eliminated_player_name ?? null,
                eliminatedRole: row.eliminated_role ?? null,
                tally: parseTally(row.tally),
              })),
            );
          }
          setLoading(false);
        },
        () => {
          if (!cancelled) setLoading(false);
        },
      );

    return () => {
      cancelled = true;
    };
  }, [deviceId, gameId, tick]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  const latest = rounds.length > 0 ? (rounds[rounds.length - 1] ?? null) : null;

  const eliminatedIds = useMemo(
    () =>
      new Set(
        rounds
          .map((r) => r.eliminatedPlayerId)
          .filter((id): id is string => id !== null),
      ),
    [rounds],
  );

  return { rounds, latest, eliminatedIds, loading, refetch };
}
