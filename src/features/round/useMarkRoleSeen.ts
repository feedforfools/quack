import { useState, useCallback } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { log } from "@/lib/log";

export type MarkRoleSeenError = "round.markRoleSeenError";

export interface UseMarkRoleSeenReturn {
  markRoleSeen: (params: { deviceId: string; gameId: string }) => Promise<boolean>;
  loading: boolean;
  error: MarkRoleSeenError | null;
}

/**
 * Stamps the calling player's seen_at on their role_assignment row (E3-T11).
 *
 * Calls the `mark_role_seen` SECURITY DEFINER RPC which:
 *   1. Resolves the calling player via the x-player-id header.
 *   2. Updates seen_at = now() idempotently (no-op if already set).
 *
 * Intended to be called from DiscussionScreen on the first successful peek.
 * The caller's word/role is never passed to this hook (constraint §10).
 */
export function useMarkRoleSeen(): UseMarkRoleSeenReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<MarkRoleSeenError | null>(null);

  const markRoleSeen = useCallback(
    async ({
      deviceId,
      gameId,
    }: {
      deviceId: string;
      gameId: string;
    }): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const client = supabaseWithDevice(deviceId);
        const { error: rpcError } = await client.rpc("mark_game_seen", {
          p_game_id: gameId,
        });
        if (rpcError) {
          log.warn("mark_game_seen RPC error", { code: rpcError.code });
          setError("round.markRoleSeenError");
          return false;
        }
        return true;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { markRoleSeen, loading, error };
}
