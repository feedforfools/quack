import { useState, useCallback } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import type { Json } from "@/lib/supabase/types";
import { log } from "@/lib/log";
import type { RoomConfig } from "./roomConfig";

export interface UseUpdateRoomConfigReturn {
  updateConfig: (config: RoomConfig) => Promise<boolean>;
  saving: boolean;
  error: string | null;
}

/**
 * Persists the full `RoomConfig` object into `rooms.config` JSONB.
 * Allowed only when the room is in `lobby` state (validated server-side
 * by the host UPDATE RLS policy). The config is copied verbatim into
 * `games.config_snapshot` by `start_game`, so changes land in the next game.
 */
export function useUpdateRoomConfig(
  deviceId: string | null,
  roomId: string | null,
): UseUpdateRoomConfigReturn {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateConfig = useCallback(
    async (config: RoomConfig): Promise<boolean> => {
      if (!deviceId || !roomId) return false;
      setSaving(true);
      setError(null);

      const client = supabaseWithDevice(deviceId);
      // Cast RoomConfig to the Json object subtype. RoomConfig only contains
      // primitive values and string arrays, so this cast is safe.
      const { error: dbError } = await client
        .from("rooms")
        .update({
          config: config as unknown as { [key: string]: Json | undefined },
        })
        .eq("id", roomId);

      setSaving(false);
      if (dbError) {
        log.error("useUpdateRoomConfig: update failed", dbError);
        setError("settings.saveError");
        return false;
      }
      log.debug("useUpdateRoomConfig: config saved");
      return true;
    },
    [deviceId, roomId],
  );

  return { updateConfig, saving, error };
}
